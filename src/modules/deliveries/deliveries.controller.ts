import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AssignDeliveryDto,
  UpdateDeliveryStatusDto,
  AvailableDeliveriesQueryDto,
  UpdateLocationDto,
} from './dto/delivery.dto';
import { UserRole, DeliveryStatus } from '@prisma/client';

@ApiTags('Deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Get('partner/available')
  @ApiOperation({ summary: 'Delivery partner queries nearby available delivery orders (Section 20 & Geolocation Dispatch)' })
  @ApiResponse({ status: 200, description: 'Available delivery orders retrieved successfully' })
  async getAvailableDeliveries(
    @CurrentUser('deliveryPartnerId') deliveryPartnerId: string,
    @Query() query: AvailableDeliveriesQueryDto,
  ) {
    const data = await this.deliveriesService.getAvailableDeliveries(
      deliveryPartnerId,
      query,
    );
    return {
      data,
      __message: 'Available delivery orders retrieved successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Post('partner/accept/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delivery partner claims / accepts an available order' })
  @ApiResponse({ status: 200, description: 'Order claimed successfully' })
  async acceptDelivery(
    @CurrentUser('deliveryPartnerId') deliveryPartnerId: string,
    @Param('orderId') orderId: string,
  ) {
    const data = await this.deliveriesService.acceptDelivery(
      deliveryPartnerId,
      orderId,
    );
    return {
      data,
      __message: 'Order accepted for delivery successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Post('partner/reject/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delivery partner rejects an available or assigned order' })
  @ApiResponse({ status: 200, description: 'Order rejected successfully' })
  async rejectDelivery(
    @CurrentUser('deliveryPartnerId') deliveryPartnerId: string,
    @Param('orderId') orderId: string,
  ) {
    const data = await this.deliveriesService.rejectDelivery(
      deliveryPartnerId,
      orderId,
    );
    return {
      data,
      __message: 'Order rejected successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Put('partner/location')
  @ApiOperation({ summary: 'Delivery partner sends real-time GPS coordinates update' })
  @ApiResponse({ status: 200, description: 'Location updated successfully' })
  async updateLocation(
    @CurrentUser('deliveryPartnerId') deliveryPartnerId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    const data = await this.deliveriesService.updateLocation(
      deliveryPartnerId,
      dto,
    );
    return {
      data,
      __message: 'Location updated successfully',
    };
  }

  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Post('merchant/assign/:orderId')
  @ApiOperation({ summary: 'Merchant assigns delivery partner to an order' })
  @ApiResponse({ status: 200, description: 'Delivery partner assigned' })
  async assignPartner(
    @CurrentUser('merchantId') merchantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: AssignDeliveryDto,
  ) {
    const data = await this.deliveriesService.assignDeliveryPartner(
      merchantId,
      orderId,
      dto,
    );
    return {
      data,
      __message: 'Delivery partner assigned successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Get('partner/assigned')
  @ApiOperation({ summary: 'Delivery partner views assigned deliveries' })
  @ApiQuery({ name: 'status', enum: DeliveryStatus, required: false })
  @ApiResponse({ status: 200, description: 'Deliveries retrieved' })
  async listAssignedDeliveries(
    @CurrentUser('deliveryPartnerId') deliveryPartnerId: string,
    @Query('status') status?: DeliveryStatus,
  ) {
    const data = await this.deliveriesService.listForPartner(deliveryPartnerId, status);
    return {
      data,
      __message: 'Assigned deliveries retrieved successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.DELIVERY_PARTNER)
  @Patch('partner/status/:orderId')
  @ApiOperation({ summary: 'Delivery partner updates delivery fulfillment status' })
  @ApiResponse({ status: 200, description: 'Delivery status updated' })
  async updateStatus(
    @CurrentUser('deliveryPartnerId') deliveryPartnerId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    const data = await this.deliveriesService.updateStatusByPartner(
      deliveryPartnerId,
      orderId,
      dto,
    );
    return {
      data,
      __message: 'Delivery status updated successfully',
    };
  }
}
