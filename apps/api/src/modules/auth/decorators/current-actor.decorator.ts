import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type RequestActor = {
  userId: string | null;
  source: string;
};

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestActor => {
  const request = ctx.switchToHttp().getRequest();
  if (request.apiKey?.id) {
    return { userId: null, source: `apiKey:${request.apiKey.id}` };
  }
  if (request.user?.id) {
    return { userId: request.user.id, source: `user:${request.user.id}` };
  }
  return { userId: null, source: 'system' };
});
