import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { RegisterDto, LoginDto } from '../dtos/auth.dto';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // Mensagem genérica — não revela se o e-mail já existe, mitigando enumeração de contas.
      throw new ConflictException('Não foi possível concluir o cadastro com os dados informados.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
      },
    });

    await this.writeAuditLog(user.id, null, 'user.register', 'User', user.id);

    // Fluxo real deve disparar e-mail de verificação aqui (módulo de Notificações — fase futura).
    // O usuário é conduzido, no frontend, para o onboarding de empresa após o cadastro.

    return this.issueTokens(user.id);
  }

  async login(dto: LoginDto, ipAddress: string | undefined) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Mesma resposta para "usuário não existe" e "senha errada", sempre.
    const genericError = () => new UnauthorizedException('Credenciais inválidas.');

    if (!user) throw genericError();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.',
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      await this.registerFailedAttempt(user.id);
      throw genericError();
    }

    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException('Código de verificação em duas etapas obrigatório.');
      }
      // Validação real de TOTP é implementada no módulo de segurança (fase futura).
      // Aqui apenas garantimos que a autenticação não prossegue sem o código.
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.writeAuditLog(user.id, null, 'user.login', 'User', user.id, ipAddress);

    return this.issueTokens(user.id);
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    // Rotação: o token antigo é revogado e um novo é emitido — reduz janela de uso indevido em caso de vazamento.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.userId);
  }

  async logout(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async registerFailedAttempt(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
        },
      });
    }
  }

  private async issueTokens(userId: string) {
    const accessToken = this.jwtService.sign({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL });

    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(raw: string): string {
    // Refresh tokens nunca são armazenados em claro no banco.
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private async writeAuditLog(
    actorUserId: string | null,
    companyId: string | null,
    action: string,
    entity: string,
    entityId: string,
    ipAddress?: string,
  ) {
    await this.prisma.auditLog.create({
      data: { actorUserId, companyId, action, entity, entityId, ipAddress },
    });
  }
}
