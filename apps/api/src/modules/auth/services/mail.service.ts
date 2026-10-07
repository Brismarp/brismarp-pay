import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(to: string, subject: string, text: string, html: string): Promise<void> {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      this.logger.log(`SMTP ausente. E-mail para ${to}: ${subject}\n${text}`);
      return;
    }

    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM || 'Brismar Pay <nao-responda@brismarppay.com.br>',
        to,
        subject,
        text,
        html,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'falha desconhecida';
      this.logger.error(`Falha ao enviar e-mail para ${to}: ${message}\n${text}`);
    }
  }
}
