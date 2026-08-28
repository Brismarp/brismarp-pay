import { Module } from '@nestjs/common';
import { AdminCompaniesController } from './controllers/admin-companies.controller';
import { AdminAuditController } from './controllers/admin-audit.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminCompaniesService } from './services/admin-companies.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminDashboardService } from './services/admin-dashboard.service';

@Module({
  controllers: [AdminCompaniesController, AdminAuditController, AdminDashboardController],
  providers: [AdminCompaniesService, AdminAuditService, AdminDashboardService],
})
export class AdminModule {}
