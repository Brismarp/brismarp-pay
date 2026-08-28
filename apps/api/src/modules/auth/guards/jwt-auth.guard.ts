import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Aplicado por padrão em todo controller de negócio — toda rota é protegida
// a menos que explicitamente marcada com @Public() (ver public.decorator.ts).
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
