import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CompanyRolesGuard } from '../../auth/guards/company-roles.guard';
import { CompanyRoles } from '../../auth/guards/company-roles.decorator';
import { CustomersService } from '../services/customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';

@Controller('companies/:companyId/customers')
@UseGuards(JwtAuthGuard, CompanyRolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR')
  create(@Param('companyId') companyId: string, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(companyId, dto);
  }

  @Get()
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR', 'VIEWER')
  list(
    @Param('companyId') companyId: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customersService.list(companyId, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':customerId')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR', 'VIEWER')
  getOne(@Param('companyId') companyId: string, @Param('customerId') customerId: string) {
    return this.customersService.getWithHistory(companyId, customerId);
  }

  @Patch(':customerId')
  @CompanyRoles('OWNER', 'ADMIN', 'FINANCE', 'OPERATOR')
  update(
    @Param('companyId') companyId: string,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(companyId, customerId, dto);
  }
}
