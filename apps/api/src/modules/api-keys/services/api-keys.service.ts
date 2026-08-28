import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApiKeyEnvironmentDto, AVAILABLE_SCOPES, CreateApiKeyDto } from '../dtos/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(companyId: string, dto: CreateApiKeyDto) {
    this.validateScopes(dto.scopes);
    const rawKey = `bpay_${dto.environment.toLowerCase()}_${crypto.randomBytes(32).toString('hex')}`;
    const prefix = rawKey.slice(0, 16);
    const created = await this.prisma.apiKey.create({
      data: { companyId, name: dto.name.trim(), prefix, keyHash: this.hash(rawKey), environment: dto.environment, scopes: dto.scopes },
      select: { id: true, name: true, prefix: true, environment: true, scopes: true, createdAt: true },
    });
    return { ...created, key: rawKey, warning: 'Armazene esta chave agora. Ela não será exibida novamente.' };
  }

  async list(companyId: string) {
    return this.prisma.apiKey.findMany({
      where: { companyId }, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, environment: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
  }

  async revoke(companyId: string, apiKeyId: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id: apiKeyId, companyId } });
    if (!key) throw new NotFoundException('API Key não encontrada.');
    if (key.revokedAt) return { id: key.id, revokedAt: key.revokedAt, alreadyRevoked: true };
    return this.prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() }, select: { id: true, prefix: true, revokedAt: true } });
  }

  async rotate(companyId: string, apiKeyId: string) {
    const current = await this.prisma.apiKey.findFirst({ where: { id: apiKeyId, companyId } });
    if (!current) throw new NotFoundException('API Key não encontrada.');
    if (current.revokedAt) throw new ConflictException('Não é possível rotacionar uma API Key já revogada.');
    const rawKey = `bpay_${current.environment.toLowerCase()}_${crypto.randomBytes(32).toString('hex')}`;
    const created = await this.prisma.$transaction(async tx => {
      await tx.apiKey.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
      return tx.apiKey.create({ data: { companyId, name: current.name, prefix: rawKey.slice(0, 16), keyHash: this.hash(rawKey), environment: current.environment, scopes: current.scopes }, select: { id: true, name: true, prefix: true, environment: true, scopes: true, createdAt: true } });
    });
    return { ...created, key: rawKey, warning: 'A chave anterior foi revogada e esta chave será exibida apenas agora.' };
  }

  async authenticate(rawKey: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash: this.hash(rawKey) } });
    if (!key || key.revokedAt) return null;
    void this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    return key;
  }

  private validateScopes(scopes: string[]) {
    const invalid = scopes.filter(scope => !(AVAILABLE_SCOPES as readonly string[]).includes(scope));
    if (invalid.length) throw new BadRequestException(`Escopos inválidos: ${invalid.join(', ')}.`);
  }

  private hash(value: string) { return crypto.createHash('sha256').update(value).digest('hex'); }
}
