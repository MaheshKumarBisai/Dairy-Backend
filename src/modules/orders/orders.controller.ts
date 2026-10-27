import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CheckoutDto, UpdateOrderStatusDto, OrderQueryDto } from './dto/order.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Customer checks out current cart to place orders' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  async checkout(
    @CurrentUser('userId') userId: string,
    @Body() dto: CheckoutDto,
  ) {
    const data = await this.ordersService.checkoutCart(userId, dto);
    return {
      data,
      __message: 'Order placed successfully',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Customer gets their personal order history' })
  @ApiResponse({ status: 200, description: 'Orders retrieved' })
  async listForCustomer(
    @CurrentUser('userId') userId: string,
    @Query() query: OrderQueryDto,
  ) {
    const data = await this.ordersService.listForCustomer(userId, query);
    return {
      data,
      __message: 'Orders retrieved successfully',
    };
  }

  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Get('merchant/orders')
  @ApiOperation({ summary: 'Merchant retrieves their store incoming orders' })
  @ApiResponse({ status: 200, description: 'Merchant orders retrieved' })
  async listForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @Query() query: OrderQueryDto,
  ) {
    const data = await this.ordersService.listForMerchant(merchantId, query);
    return {
      data,
      __message: 'Merchant orders retrieved successfully',
    };
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get single order details by ORD-100001 ID' })
  @ApiResponse({ status: 200, description: 'Order details' })
  async getOrderById(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.ordersService.getOrderById(orderId, user);
    return {
      data,
      __message: 'Order details retrieved successfully',
    };
  }

  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Patch(':orderId/status')
  @ApiOperation({ summary: 'Merchant updates order fulfillment status' })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  async updateStatusForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @CurrentUser('userId') actorId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const data = await this.ordersService.updateStatusForMerchant(
      merchantId,
      orderId,
      dto,
      actorId,
    );
    return {
      data,
      __message: 'Order status updated successfully',
    };
  }

  @Post(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel order and release reserved inventory' })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully' })
  async cancelOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { reason?: string },
  ) {
    const data = await this.ordersService.cancelOrder(orderId, user, body?.reason);
    return {
      data,
      __message: 'Order cancelled successfully',
    };
  }
}
