import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeliveryPartnersService } from './delivery-partners.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateDeliveryPartnerDto,
  UpdateDeliveryPartnerDto,
  ToggleAvailabilityDto,
} from './dto/delivery-partner.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Delivery Partners')
@ApiBearerAuth()
@Controller('delivery-partners')
export class DeliveryPartnersController {
  constructor(private readonly deliveryPartnersService: DeliveryPartnersService) {}

  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Post()
  @ApiOperation({ summary: 'Merchant registers a new delivery partner for their store' })
  @ApiResponse({ status: 201, description: 'Delivery partner registered' })
  async createForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @Body() dto: CreateDeliveryPartnerDto,
  ) {
    const data = await this.deliveryPartnersService.createForMerchant(merchantId, dto);
    return {
      data,
      __message: 'Delivery partner created successfully',
    };
  }

  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Get()
  @ApiOperation({ summary: 'Merchant lists all their registered delivery partners' })
  @ApiResponse({ status: 200, description: 'Delivery partners list' })
  async listForMerchant(@CurrentUser('merchantId') merchantId: string) {
    const data = await this.deliveryPartnersService.listForMerchant(merchantId);
    return {
      data,
      __message: 'Delivery partners retrieved successfully',
    };
  }

  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Patch(':deliveryPartnerId')
  @ApiOperation({ summary: 'Merchant updates a delivery partner profile' })
  @ApiResponse({ status: 200, description: 'Delivery partner updated' })
  async updateForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @Param('deliveryPartnerId') deliveryPartnerId: string,
    @Body() dto: UpdateDeliveryPartnerDto,
  ) {
    const data = await this.deliveryPartnersService.updateForMerchant(
      merchantId,
      deliveryPartnerId,
      dto,
    );
    return {
      data,
      __message: 'Delivery partner updated successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Get('me')
  @ApiOperation({ summary: 'Delivery partner gets their own profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved' })
  async getMyProfile(@CurrentUser('deliveryPartnerId') deliveryPartnerId: string) {
    const data = await this.deliveryPartnersService.getMyProfile(deliveryPartnerId);
    return {
      data,
      __message: 'Profile retrieved successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Put('me/availability')
  @ApiOperation({ summary: 'Delivery partner toggles their online availability' })
  @ApiResponse({ status: 200, description: 'Availability updated' })
  async toggleAvailability(
    @CurrentUser('deliveryPartnerId') deliveryPartnerId: string,
    @Body() dto: ToggleAvailabilityDto,
  ) {
    const data = await this.deliveryPartnersService.toggleAvailability(
      deliveryPartnerId,
      dto,
    );
    return {
      data,
      __message: 'Availability updated successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Get('me/earnings')
  @ApiOperation({ summary: 'Delivery partner gets their computed earnings, daily totals, and payout history' })
  @ApiResponse({ status: 200, description: 'Earnings retrieved successfully' })
  async getMyEarnings(@CurrentUser('deliveryPartnerId') deliveryPartnerId: string) {
    const data = await this.deliveryPartnersService.getMyEarnings(deliveryPartnerId);
    return {
      data,
      __message: 'Earnings retrieved successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Get('me/ratings')
  @ApiOperation({ summary: 'Delivery partner gets their ratings, customer feedback and satisfaction metrics' })
  @ApiResponse({ status: 200, description: 'Ratings retrieved successfully' })
  async getMyRatings(@CurrentUser('deliveryPartnerId') deliveryPartnerId: string) {
    const data = await this.deliveryPartnersService.getMyRatings(deliveryPartnerId);
    return {
      data,
      __message: 'Ratings retrieved successfully',
    };
  }
}
