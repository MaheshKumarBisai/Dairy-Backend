import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UpdateMerchantDto } from './dto/merchant.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Merchants')
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'List all active dairy merchants for customer browsing' })
  @ApiResponse({ status: 200, description: 'Active merchants retrieved' })
  async listPublicMerchants() {
    const data = await this.merchantsService.listPublicMerchants();
    return {
      data,
      __message: 'Active merchants retrieved successfully',
    };
  }

  @Public()
  @Get('public/:merchantId')
  @ApiOperation({ summary: 'Get public details of a dairy merchant' })
  @ApiResponse({ status: 200, description: 'Merchant details retrieved' })
  async getPublicMerchantById(@Param('merchantId') merchantId: string) {
    const data = await this.merchantsService.getPublicMerchantById(merchantId);
    return {
      data,
      __message: 'Merchant details retrieved successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Get('profile/me')
  @ApiOperation({ summary: 'Get authenticated merchant full dashboard profile' })
  @ApiResponse({ status: 200, description: 'Merchant profile retrieved' })
  async getMyMerchantProfile(@CurrentUser('merchantId') merchantId: string) {
    const data = await this.merchantsService.getMyMerchantProfile(merchantId);
    return {
      data,
      __message: 'Merchant profile retrieved successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Patch('profile/me')
  @ApiOperation({ summary: 'Update authenticated merchant business profile' })
  @ApiResponse({ status: 200, description: 'Merchant profile updated' })
  async updateMyMerchantProfile(
    @CurrentUser('merchantId') merchantId: string,
    @Body() dto: UpdateMerchantDto,
  ) {
    const data = await this.merchantsService.updateMerchantProfile(merchantId, dto);
    return {
      data,
      __message: 'Merchant profile updated successfully',
    };
  }
}
