import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IdGeneratorService, IdPrefix } from '../../common/services/id-generator.service';
import { CouponsService } from '../coupons/coupons.service';
import {
  CheckoutDto,
  CreateDirectOrderDto,
  UpdateOrderStatusDto,
  OrderQueryDto,
} from './dto/order.dto';
import { OrderStatus, PaymentStatus, PaymentMethod, DeliveryStatus, Prisma } from '@prisma/client';
import { AuditAction } from '../../common/constants/audit-action.enum';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGenerator: IdGeneratorService,
    private readonly couponsService: CouponsService,
  ) {}

  /**
   * Checkout from Customer Cart with atomic inventory reservation and payment initialization
   */
  async checkoutCart(userId: string, dto: CheckoutDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: { inventory: true },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty. Please add products before checkout.');
    }

    // Verify address belongs to user
    const address = await this.prisma.address.findFirst({
      where: { addressId: dto.addressId, userId },
    });

    if (!address) {
      throw new BadRequestException('Selected delivery address is invalid or does not belong to your account');
    }

    // Group items by merchant if multiple, or process primary merchant order
    // In our marketplace, each order is scoped to one merchant
    const merchantGroups = new Map<string, typeof cart.items>();
    for (const item of cart.items) {
      const mId = item.product.merchantId;
      if (!merchantGroups.has(mId)) {
        merchantGroups.set(mId, []);
      }
      merchantGroups.get(mId)!.push(item);
    }

    const createdOrders = [];

    // Execute atomic creation inside transaction for each merchant group
    for (const [merchantId, items] of merchantGroups.entries()) {
      const orderId = await this.idGenerator.generateId(IdPrefix.ORDER);

      // Dynamic delivery slot calculation based on order time:
      const now = new Date();
      const currentHour = now.getHours();
      let deliveryDate: Date;
      let deliverySlotStartTime: string;
      let deliverySlotEndTime: string;

      if (dto.deliveryDate) {
        deliveryDate = new Date(dto.deliveryDate);
        deliverySlotStartTime = '06:30';
        deliverySlotEndTime = '08:00';
      } else if (currentHour < 12) {
        // Morning booking -> Today evening delivery (e.g. 5:00 PM - 7:00 PM)
        deliveryDate = now;
        deliverySlotStartTime = '17:00';
        deliverySlotEndTime = '19:00';
      } else if (currentHour < 15) {
        // Early afternoon -> Today late evening (e.g. 7:00 PM - 8:30 PM)
        deliveryDate = now;
        deliverySlotStartTime = '19:00';
        deliverySlotEndTime = '20:30';
      } else {
        // Evening / night booking -> Tomorrow morning delivery (e.g. 6:00 AM - 7:30 AM)
        deliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        deliverySlotStartTime = '06:00';
        deliverySlotEndTime = '07:30';
      }

      const createdOrder = await this.prisma.$transaction(async (tx) => {
        let subtotal = 0;
        const orderItemCreates = [];

        // Authoritative price check and inventory reservation
        for (const item of items) {
          const product = await tx.product.findUnique({
            where: { productId: item.productId },
            include: { inventory: true },
          });

          if (!product || !product.isActive) {
            throw new BadRequestException(`Product ${item.product.name} is no longer available`);
          }

          if ((product.inventory?.availableQuantity ?? 0) < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for "${product.name}". Available: ${product.inventory?.availableQuantity ?? 0}, Requested: ${item.quantity}`,
            );
          }

          const lineTotal = product.price * item.quantity;
          subtotal += lineTotal;

          orderItemCreates.push({
            productId: product.productId,
            productName: product.name,
            unitPrice: product.price,
            quantity: item.quantity,
            totalPrice: lineTotal,
          });

          // Reserve inventory
          await tx.inventory.update({
            where: { productId: product.productId },
            data: {
              availableQuantity: { decrement: item.quantity },
              reservedQuantity: { increment: item.quantity },
            },
          });
        }

        let discount = 0;
        if (dto.couponCode && subtotal > 0) {
          try {
            const couponResult = await this.couponsService.validateAndCalculateDiscount({
              code: dto.couponCode,
              subtotal,
              merchantId,
            });
            discount = couponResult.calculatedDiscount;
          } catch {
            // Invalid coupon skipped
          }
        }

        const deliveryFee = subtotal >= 200 ? 0 : 25;
        const tax = 0;
        const total = Math.max(0, Math.round((subtotal - discount + deliveryFee + tax) * 100) / 100);

        const order = await tx.order.create({
          data: {
            orderId,
            merchantId,
            customerId: userId,
            addressId: dto.addressId,
            status: OrderStatus.CONFIRMED,
            subtotal,
            discount,
            deliveryFee,
            tax,
            total,
            isRecurringInstance: false,
            deliveryDate,
            deliverySlotStartTime,
            deliverySlotEndTime,
            notes: dto.notes,
            items: {
              create: orderItemCreates,
            },
            delivery: {
              create: {
                merchantId,
                status: DeliveryStatus.AVAILABLE,
              },
            },
            payment: {
              create: {
                merchantId,
                amount: total,
                currency: 'INR',
                status:
                  dto.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
                    ? PaymentStatus.PENDING
                    : PaymentStatus.COMPLETED,
                method: dto.paymentMethod || PaymentMethod.ONLINE,
                transactionReference: `TXN-${orderId}-${Date.now()}`,
              },
            },
          },
          include: {
            items: true,
            payment: true,
            delivery: true,
            address: true,
          },
        });

        return order;
      });

      createdOrders.push(createdOrder);
    }

    // Clear cart after successful checkout
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return createdOrders.length === 1 ? createdOrders[0] : createdOrders;
  }

  /**
   * Customer lists their own order history
   */
  async listForCustomer(customerId: string, query: OrderQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      customerId,
      ...(query.status && { status: query.status }),
    };

    const [totalItems, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          items: true,
          payment: true,
          delivery: {
            include: {
              deliveryPartner: {
                include: {
                  user: {
                    select: { name: true, phone: true },
                  },
                },
              },
            },
          },
          merchant: {
            select: {
              merchantId: true,
              businessName: true,
              phone: true,
            },
          },
          address: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  }

  /**
   * Get single order details with ownership verification
   */
  async getOrderById(orderId: string, user: { userId: string; role: string; merchantId?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { orderId },
      include: {
        items: true,
        payment: true,
        delivery: {
          include: {
            deliveryPartner: {
              include: {
                user: { select: { name: true, phone: true } },
              },
            },
          },
        },
        merchant: true,
        address: true,
        customer: {
          select: { userId: true, name: true, email: true, phone: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // Role-based tenant / ownership check
    if (user.role === 'CUSTOMER' && order.customerId !== user.userId) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    if (user.role === 'MERCHANT' && order.merchantId !== user.merchantId) {
      throw new ForbiddenException('Tenant Isolation Violation: Order belongs to a different merchant');
    }

    return order;
  }

  /**
   * Merchant lists orders belonging strictly to their merchantId
   */
  async listForMerchant(merchantId: string, query: OrderQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      merchantId, // STRICT TENANT ISOLATION
      ...(query.status && { status: query.status }),
      ...(query.date && {
        deliveryDate: {
          gte: new Date(`${query.date}T00:00:00.000Z`),
          lte: new Date(`${query.date}T23:59:59.999Z`),
        },
      }),
    };

    const [totalItems, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          items: true,
          payment: true,
          delivery: {
            include: {
              deliveryPartner: {
                include: {
                  user: { select: { name: true, phone: true } },
                },
              },
            },
          },
          address: true,
          customer: {
            select: { userId: true, name: true, email: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  }

  /**
   * Merchant updates order status with lifecycle validation
   */
  async updateStatusForMerchant(
    merchantId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
    actorId: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { orderId, merchantId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found in your merchant store`);
    }

    if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(`Cannot change status of an order that is already ${order.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { orderId },
        data: {
          status: dto.status,
          ...(dto.notes && { notes: dto.notes }),
        },
        include: {
          items: true,
          payment: true,
          delivery: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: 'MERCHANT',
          merchantId,
          action: 'ORDER_STATUS_CHANGED',
          resource: 'Order',
          resourceId: orderId,
          oldValue: { status: order.status },
          newValue: { status: dto.status },
        },
      });

      return updated;
    });
  }

  /**
   * Customer or Merchant cancels order with inventory rollback
   */
  async cancelOrder(
    orderId: string,
    user: { userId: string; role: string; merchantId?: string },
    reason?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (user.role === 'CUSTOMER' && order.customerId !== user.userId) {
      throw new ForbiddenException('Unauthorized to cancel this order');
    }

    if (user.role === 'MERCHANT' && order.merchantId !== user.merchantId) {
      throw new ForbiddenException('Tenant Isolation Violation');
    }

    const unCancellableStates: OrderStatus[] = [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.CANCELLED];
    if (unCancellableStates.includes(order.status)) {
      throw new BadRequestException(`Cannot cancel order in ${order.status} state`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Revert reserved inventory
      for (const item of order.items) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: {
            availableQuantity: { increment: item.quantity },
            reservedQuantity: { decrement: item.quantity },
          },
        });
      }

      const cancelledOrder = await tx.order.update({
        where: { orderId },
        data: {
          status: OrderStatus.CANCELLED,
          notes: reason ? `Cancelled: ${reason}` : 'Cancelled by user',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.userId,
          actorRole: user.role as any,
          merchantId: order.merchantId,
          action: AuditAction.ORDER_CANCELLED,
          resource: 'Order',
          resourceId: orderId,
          oldValue: { status: order.status },
          newValue: { status: OrderStatus.CANCELLED, reason },
        },
      });

      return cancelledOrder;
    });
  }
}
