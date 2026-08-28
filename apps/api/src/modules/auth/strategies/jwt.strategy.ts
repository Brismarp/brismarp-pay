import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Falha explícita no boot em vez de rodar com segredo vazio/previsível.
      throw new Error('JWT_SECRET não configurado. Defina a variável de ambiente antes de iniciar a API.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    // Objeto anexado a req.user — controllers/guards downstream leem daqui, nunca confiam em headers custom.
    return { id: user.id, email: user.email, isPlatformAdmin: user.isPlatformAdmin };
  }
}
