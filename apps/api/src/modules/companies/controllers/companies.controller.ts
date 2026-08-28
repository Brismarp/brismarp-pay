import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CompaniesService } from '../services/companies.service';
import { CreateCompanyDto } from '../dtos/create-company.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard) // toda rota deste controller exige autenticação — nenhuma exceção
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(@CurrentUser() user: { id: string }, @Body() dto: CreateCompanyDto) {
    return this.companiesService.createCompany(user.id, dto);
  }

  @Get('me')
  async listMine(@CurrentUser() user: { id: string }) {
    return this.companiesService.listCompaniesForUser(user.id);
  }

  @Get(':companyId')
  async getOne(@CurrentUser() user: { id: string }, @Param('companyId') companyId: string) {
    // getCompanyForUser já valida o vínculo real do usuário com a empresa antes de retornar dados —
    // não basta o companyId estar na URL.
    return this.companiesService.getCompanyForUser(user.id, companyId);
  }
}
