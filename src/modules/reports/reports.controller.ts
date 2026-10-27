import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(RolesGuard, TenantGuard)
@Roles(UserRole.MERCHANT)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('merchant/dashboard')
  @ApiOperation({ summary: 'Merchant dashboard sales and operations analytics' })
  @ApiResponse({ status: 200, description: 'Merchant report data' })
  async getMerchantReport(@CurrentUser('merchantId') merchantId: string) {
    const data = await this.reportsService.getMerchantReport(merchantId);
    return {
      data,
      __message: 'Merchant report retrieved successfully',
    };
  }
}
