import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './dto/payment.dto';
import { PaymentStatus, OrderStatus } from '@prisma/client';
import { AuditAction } from '../../common/constants/audit-action.enum';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Server generates authoritative payment intent based on authoritative order total
   */
  async createPaymentIntent(userId: string, dto: CreatePaymentIntentDto) {
    const order = await this.prisma.order.findUnique({
      where: { orderId: dto.orderId },
      include: { payment: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${dto.orderId} not found`);
    }

    if (order.customerId !== userId) {
      throw new BadRequestException('Order does not belong to your account');
    }

    if (order.payment && order.payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('This order has already been paid for');
    }

    const idempotencyKey = dto.idempotencyKey || `idem-${order.orderId}-${Date.now()}`;

    // If payment record already exists, return client secret / intent
    if (order.payment) {
      return {
        paymentId: order.payment.paymentId,
        orderId: order.orderId,
        amount: order.total,
        currency: 'INR',
        status: order.payment.status,
        clientSecret: `mock_client_secret_${order.payment.paymentId}`,
      };
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.orderId,
        merchantId: order.merchantId,
        amount: order.total,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        method: dto.method || 'ONLINE',
        idempotencyKey,
      },
    });

    return {
      paymentId: payment.paymentId,
      orderId: order.orderId,
      amount: order.total,
      currency: 'INR',
      status: payment.status,
      clientSecret: `mock_client_secret_${payment.paymentId}`,
    };
  }

  /**
   * Idempotent payment webhook processing (Section 21)
   */
  async handleWebhook(dto: PaymentWebhookDto) {
    this.logger.log(`Received payment webhook for order: ${dto.orderId}, ref: ${dto.transactionReference}`);

    const payment = await this.prisma.payment.findUnique({
      where: { orderId: dto.orderId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment record for order ${dto.orderId} not found`);
    }

    // Idempotency check: if already completed with this transactionReference, ignore duplicate safely
    if (payment.status === PaymentStatus.COMPLETED) {
      this.logger.log(`Duplicate webhook for already completed payment: ${payment.paymentId}. Returning idempotent 200.`);
      return {
        processed: true,
        idempotent: true,
        paymentId: payment.paymentId,
        status: payment.status,
      };
    }

    const isSuccess = dto.status === PaymentStatus.COMPLETED;

    return this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { paymentId: payment.paymentId },
        data: {
          status: dto.status,
          transactionReference: dto.transactionReference,
        },
      });

      if (isSuccess) {
        await tx.order.update({
          where: { orderId: dto.orderId },
          data: { status: OrderStatus.CONFIRMED },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: payment.order.customerId,
          actorRole: 'CUSTOMER',
          merchantId: payment.merchantId,
          action: AuditAction.PAYMENT_STATUS_CHANGED,
          resource: 'Payment',
          resourceId: payment.paymentId,
          oldValue: { status: payment.status },
          newValue: { status: dto.status, transactionReference: dto.transactionReference },
        },
      });

      return {
        processed: true,
        paymentId: updatedPayment.paymentId,
        orderId: dto.orderId,
        status: updatedPayment.status,
      };
    });
  }

  async getPaymentDetails(orderId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }

    return payment;
  }
}
