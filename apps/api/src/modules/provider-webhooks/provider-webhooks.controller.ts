import { Controller, Post, Body, Headers, HttpCode, Inject, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ChargesService } from '../charges/services/charges.service';
import { PAYMENT_PROVIDER, PaymentProvider } from '../../integrations/payment-providers/payment-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('webhooks')
export class ProviderWebhooksController {
  constructor(
    private readonly charges: ChargesService,
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  @Post('getnet')
  @HttpCode(204)
  async getnet(@Body() body: unknown, @Headers() headers: Record<string, string>) {
    if (this.provider.name !== 'getnet' && process.env.ALLOW_SANDBOX_WEBHOOK !== 'true') {
      throw new UnauthorizedException();
    }

    const event = await this.provider.processWebhook(body, headers);
    const eventKey = String(
      (event.raw as any).eventId
      ?? (event.raw as any).event_id
      ?? (event.raw as any).eventKey
      ?? `${event.eventType}:${event.providerPaymentId}:${event.newStatus}`,
    );
    if (!eventKey || eventKey === 'undefined') throw new BadRequestException('Webhook sem identificador estável.');
    const signatureValid = event.signatureValid === true;

    const persisted = await this.prisma.incomingWebhookEvent.upsert({
      where: { idempotencyKey: eventKey },
        update: { payload: event.raw as any, signatureValid },
      create: {
        provider: this.provider.name,
        eventType: event.eventType,
        payload: event.raw as any,
        signatureValid,
        idempotencyKey: eventKey,
      },
    });

    if (!persisted.processed) {
      await this.charges.applyProviderWebhook(
        event.providerPaymentId,
        event.newStatus as any,
        eventKey,
        event.raw,
      );
      await this.prisma.incomingWebhookEvent.update({
        where: { id: persisted.id },
        data: { processed: true, processedAt: new Date() },
      });
    }
  }
}
