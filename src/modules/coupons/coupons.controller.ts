import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateCouponDto, ValidateCouponDto } from './dto/coupon.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Public()
  @Post('validate')
  @ApiOperation({ summary: 'Validate coupon and calculate authoritative discount' })
  @ApiResponse({ status: 200, description: 'Discount calculation response' })
  async validateCoupon(@Body() dto: ValidateCouponDto) {
    const data = await this.couponsService.validateAndCalculateDiscount(dto);
    return {
      data,
      __message: 'Coupon applied successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Post('merchant')
  @ApiOperation({ summary: 'Merchant creates coupon for their store' })
  @ApiResponse({ status: 201, description: 'Coupon created' })
  async createForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @Body() dto: CreateCouponDto,
  ) {
    const data = await this.couponsService.create(merchantId, dto);
    return {
      data,
      __message: 'Coupon created successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Get('merchant')
  @ApiOperation({ summary: 'Merchant lists their store coupons' })
  @ApiResponse({ status: 200, description: 'Coupons retrieved' })
  async listForMerchant(@CurrentUser('merchantId') merchantId: string) {
    const data = await this.couponsService.listMerchantCoupons(merchantId);
    return {
      data,
      __message: 'Coupons retrieved successfully',
    };
  }
}
