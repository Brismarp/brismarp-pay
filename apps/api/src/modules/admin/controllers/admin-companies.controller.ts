import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../auth/guards/platform-admin.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AdminCompaniesService } from '../services/admin-companies.service';
import { UpdateCompanyStatusDto, ReviewKybDto } from '../dtos/admin.dto';

@Controller('admin/companies')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminCompaniesController {
  constructor(private readonly adminCompaniesService: AdminCompaniesService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminCompaniesService.list({
      search,
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':companyId')
  getOne(@Param('companyId') companyId: string) {
    return this.adminCompaniesService.getOne(companyId);
  }

  @Patch(':companyId/status')
  updateStatus(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateCompanyStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.adminCompaniesService.updateStatus(companyId, dto, user.id);
  }

  @Patch(':companyId/kyb')
  reviewKyb(
    @Param('companyId') companyId: string,
    @Body() dto: ReviewKybDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.adminCompaniesService.reviewKyb(companyId, dto, user.id);
  }
}
