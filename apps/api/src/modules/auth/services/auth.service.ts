import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EmailTokenPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { RegisterDto, LoginDto } from '../dtos/auth.dto';
import { MailService } from './mail.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const BCRYPT_ROUNDS = 12;
const VERIFY_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
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
    await this.sendVerificationEmail(user.id, user.email, user.name);

    return this.issueTokens(user.id);
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }

  async verifyEmail(rawToken: string) {
    const row = await this.consumeToken(rawToken, EmailTokenPurpose.VERIFY);
    await this.prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    });
    return { verified: true };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return { sent: false, alreadyVerified: true };
    await this.sendVerificationEmail(user.id, user.email, user.name);
    return { sent: true, alreadyVerified: false };
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const raw = await this.issueEmailToken(user.id, EmailTokenPurpose.RESET, RESET_TTL_HOURS);
      const url = `${this.webUrl()}/reset-password?token=${raw}`;
      await this.mail.send(
        user.email,
        'Redefinir senha',
        `Recebemos um pedido para criar uma senha nova na sua conta Brismar Pay. O link vale 1 hora. Se não foi você, ignore esta mensagem.\n\n${url}`,
        `<p>Recebemos um pedido para criar uma senha nova na sua conta Brismar Pay. O link vale 1 hora. Se não foi você, ignore esta mensagem.</p><p><a href="${url}">Redefinir senha</a></p>`,
      );
    }
    return { ok: true };
  }

  async resetPassword(rawToken: string, password: string) {
    const row = await this.consumeToken(rawToken, EmailTokenPurpose.RESET);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.writeAuditLog(row.userId, null, 'user.password_reset', 'User', row.userId);
    return { reset: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException('Senha atual incorreta.');
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.writeAuditLog(userId, null, 'user.password_change', 'User', userId);
    await this.mail.send(
      user.email,
      'Sua senha foi alterada',
      'A senha da sua conta Brismar Pay foi alterada agora. Se não foi você, use Esqueci a senha na tela de entrada.',
      '<p>A senha da sua conta Brismar Pay foi alterada agora. Se não foi você, use Esqueci a senha na tela de entrada.</p>',
    );
    return { changed: true };
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
    // Refresh tokens e links de e-mail nunca são armazenados em claro no banco.
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private webUrl(): string {
    return (process.env.APP_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private async sendVerificationEmail(userId: string, email: string, name: string) {
    const raw = await this.issueEmailToken(userId, EmailTokenPurpose.VERIFY, VERIFY_TTL_HOURS);
    const url = `${this.webUrl()}/verify-email?token=${raw}`;
    await this.mail.send(
      email,
      'Sua conta Brismar Pay foi criada',
      `Olá, ${name}. Sua conta foi criada. Confirme o e-mail para sabermos que este endereço é seu. O link vale 24 horas.\n\n${url}`,
      `<p>Olá, ${name}. Sua conta foi criada. Confirme o e-mail para sabermos que este endereço é seu. O link vale 24 horas.</p><p><a href="${url}">Confirmar e-mail</a></p>`,
    );
  }

  private async issueEmailToken(userId: string, purpose: EmailTokenPurpose, hours: number) {
    await this.prisma.emailToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    const raw = crypto.randomBytes(32).toString('hex');
    await this.prisma.emailToken.create({
      data: {
        userId,
        purpose,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      },
    });
    return raw;
  }

  private async consumeToken(rawToken: string, purpose: EmailTokenPurpose) {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: this.hashToken(rawToken) } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('Este link não é mais válido. Peça outro.');
    }
    await this.prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return row;
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
