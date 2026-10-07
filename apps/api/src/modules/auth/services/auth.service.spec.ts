import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { PrismaService } from '../../../prisma/prisma.service';

// Mock leve do Prisma — testes unitários não dependem de banco real.
// A cobertura contra um Postgres de verdade fica para os testes de integração/E2E
// (ver test/e2e/critical-flows.e2e-spec.ts), que exigem DATABASE_URL de teste.
function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    emailToken: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('fake.jwt.token') },
        },
        { provide: MailService, useValue: { send: jest.fn() } },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('rejeita cadastro com e-mail já existente sem revelar detalhes específicos', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        authService.register({ name: 'Ana', email: 'ana@empresa.com', password: 'senha12345' }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('cria o usuário com senha hasheada (nunca em claro) e emite tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'ana@empresa.com' });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.register({
        name: 'Ana',
        email: 'ana@empresa.com',
        password: 'senha12345',
      });

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.passwordHash).not.toBe('senha12345');
      expect(await bcrypt.compare('senha12345', createArgs.data.passwordHash)).toBe(true);

      expect(result.accessToken).toBe('fake.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
    });
  });

  describe('login', () => {
    const passwordHash = bcrypt.hashSync('senhaCorreta123', 4);

    it('rejeita com mensagem genérica quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'inexistente@empresa.com', password: 'qualquer' }, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita com a MESMA mensagem genérica quando a senha está errada (anti-enumeração)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
      });
      prisma.user.update.mockResolvedValue({ failedLoginAttempts: 1 });

      let userNotFoundError: Error | undefined;
      let wrongPasswordError: Error | undefined;

      prisma.user.findUnique.mockResolvedValueOnce(null);
      try {
        await authService.login({ email: 'x@x.com', password: 'x' }, '127.0.0.1');
      } catch (e) {
        userNotFoundError = e as Error;
      }

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
      });
      try {
        await authService.login({ email: 'ana@empresa.com', password: 'senhaErrada' }, '127.0.0.1');
      } catch (e) {
        wrongPasswordError = e as Error;
      }

      expect(userNotFoundError?.message).toBe(wrongPasswordError?.message);
    });

    it('bloqueia a conta após atingir o limite de tentativas falhas', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash,
        failedLoginAttempts: 4, // próxima falha é a 5ª — deve acionar o lockout
        lockedUntil: null,
        twoFactorEnabled: false,
      });
      prisma.user.update
        .mockResolvedValueOnce({ id: 'user-1', failedLoginAttempts: 5 })
        .mockResolvedValueOnce({});

      await expect(
        authService.login({ email: 'ana@empresa.com', password: 'senhaErrada' }, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);

      // A segunda chamada de update é a que define lockedUntil.
      const lockCallArgs = prisma.user.update.mock.calls[1][0];
      expect(lockCallArgs.data.lockedUntil).toBeInstanceOf(Date);
    });

    it('rejeita login em conta já bloqueada, mesmo com a senha correta', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // bloqueado por mais 10min
        twoFactorEnabled: false,
      });

      await expect(
        authService.login({ email: 'ana@empresa.com', password: 'senhaCorreta123' }, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('exige código de 2FA quando habilitado', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: true,
      });

      await expect(
        authService.login({ email: 'ana@empresa.com', password: 'senhaCorreta123' }, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('login com sucesso reseta o contador de tentativas falhas', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash,
        failedLoginAttempts: 3,
        lockedUntil: null,
        twoFactorEnabled: false,
      });
      prisma.user.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      await authService.login({ email: 'ana@empresa.com', password: 'senhaCorreta123' }, '127.0.0.1');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }),
        }),
      );
    });
  });

  describe('refresh', () => {
    it('rejeita refresh token inexistente, revogado ou expirado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(authService.refresh('token-invalido')).rejects.toThrow(UnauthorizedException);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });
      await expect(authService.refresh('token-revogado')).rejects.toThrow(UnauthorizedException);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000), // expirado
      });
      await expect(authService.refresh('token-expirado')).rejects.toThrow(UnauthorizedException);
    });

    it('rotaciona o token: revoga o antigo e emite um novo', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.refresh('token-valido');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(result.accessToken).toBe('fake.jwt.token');
    });
  });
});
