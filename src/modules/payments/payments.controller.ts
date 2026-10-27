import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './dto/payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @Post('intent')
  @ApiOperation({ summary: 'Create server-controlled payment intent for an order' })
  @ApiResponse({ status: 201, description: 'Payment intent created' })
  async createPaymentIntent(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    const data = await this.paymentsService.createPaymentIntent(userId, dto);
    return {
      data,
      __message: 'Payment intent initialized',
    };
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Payment provider idempotent webhook callback' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(@Body() dto: PaymentWebhookDto) {
    const data = await this.paymentsService.handleWebhook(dto);
    return {
      data,
      __message: 'Webhook processed successfully',
    };
  }

  @ApiBearerAuth()
  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get payment record for an order' })
  @ApiResponse({ status: 200, description: 'Payment details retrieved' })
  async getPaymentDetails(@Param('orderId') orderId: string) {
    const data = await this.paymentsService.getPaymentDetails(orderId);
    return {
      data,
      __message: 'Payment details retrieved successfully',
    };
  }
}
