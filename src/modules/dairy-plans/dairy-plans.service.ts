import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IdGeneratorService, IdPrefix } from '../../common/services/id-generator.service';
import {
  CreateDairyPlanDto,
  UpdateDairyPlanDto,
  SkipDeliveryDto,
  ExtraDeliveryDto,
} from './dto/dairy-plan.dto';
import {
  PlanStatus,
  PlanActionType,
  OrderStatus,
  DeliveryStatus,
  PaymentStatus,
  PaymentMethod,
} from '@prisma/client';

@Injectable()
export class DairyPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGenerator: IdGeneratorService,
  ) {}

  /**
   * Customer creates a recurring dairy subscription plan
   */
  async create(userId: string, dto: CreateDairyPlanDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Dairy plan must contain at least one product item');
    }

    const address = await this.prisma.address.findFirst({
      where: { addressId: dto.addressId, userId },
    });

    if (!address) {
      throw new BadRequestException('Selected address is invalid or not owned by you');
    }

    // Validate all products and check merchant consistency
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { productId: { in: productIds }, isActive: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more selected products are invalid or inactive');
    }

    // Check subscriptionAllowed flag
    for (const prod of products) {
      if (!prod.subscriptionAllowed) {
        throw new BadRequestException(`Product "${prod.name}" does not support recurring subscriptions`);
      }
    }

    const merchantId = products[0].merchantId;
    const planId = await this.idGenerator.generateId(IdPrefix.DAIRY_PLAN);

    return this.prisma.dairyPlan.create({
      data: {
        planId,
        merchantId,
        customerId: userId,
        addressId: dto.addressId,
        status: PlanStatus.ACTIVE,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        frequency: dto.frequency,
        selectedDays: dto.selectedDays || [],
        items: {
          create: dto.items.map((item) => {
            const prod = products.find((p) => p.productId === item.productId)!;
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: prod.price,
            };
          }),
        },
      },
      include: {
        items: {
          include: { product: true },
        },
        address: true,
        merchant: {
          select: { merchantId: true, businessName: true },
        },
      },
    });
  }

  /**
   * Customer retrieves their active and past dairy subscriptions
   */
  async listForCustomer(userId: string) {
    return this.prisma.dairyPlan.findMany({
      where: { customerId: userId },
      include: {
        items: {
          include: { product: true },
        },
        actions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        address: true,
        merchant: {
          select: { merchantId: true, businessName: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get single dairy plan details
   */
  async getById(planId: string, user: { userId: string; role: string; merchantId?: string }) {
    const plan = await this.prisma.dairyPlan.findUnique({
      where: { planId },
      include: {
        items: { include: { product: true } },
        actions: { orderBy: { createdAt: 'desc' } },
        address: true,
        merchant: true,
        customer: { select: { userId: true, name: true, phone: true, email: true } },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Dairy plan ${planId} not found`);
    }

    if (user.role === 'CUSTOMER' && plan.customerId !== user.userId) {
      throw new ForbiddenException('You do not own this dairy plan');
    }

    if (user.role === 'MERCHANT' && plan.merchantId !== user.merchantId) {
      throw new ForbiddenException('Tenant Isolation Violation: Subscription belongs to another merchant');
    }

    return plan;
  }

  /**
   * Skip tomorrow's delivery without affecting regular recurring schedule (Section 18)
   */
  async skipDelivery(planId: string, userId: string, dto: SkipDeliveryDto) {
    const plan = await this.prisma.dairyPlan.findFirst({
      where: { planId, customerId: userId },
    });

    if (!plan) {
      throw new NotFoundException(`Dairy plan ${planId} not found`);
    }

    if (plan.status !== PlanStatus.ACTIVE) {
      throw new BadRequestException('Cannot skip delivery for a plan that is not active');
    }

    const targetDate = dto.targetDate
      ? new Date(`${dto.targetDate}T00:00:00.000Z`)
      : new Date(new Date().setDate(new Date().getDate() + 1));

    const action = await this.prisma.dairyPlanAction.create({
      data: {
        planId,
        actionType: PlanActionType.SKIP,
        targetDate,
        reason: dto.reason || 'Skipped by customer request',
      },
    });

    return {
      planId,
      actionId: action.id,
      actionType: 'SKIP',
      targetDate,
      message: `Delivery scheduled for ${targetDate.toISOString().split('T')[0]} has been skipped. Recurring plan remains active.`,
    };
  }

  /**
   * Request extra milk / dairy quantity for a specific date (Section 18)
   */
  async addExtraDelivery(planId: string, userId: string, dto: ExtraDeliveryDto) {
    const plan = await this.prisma.dairyPlan.findFirst({
      where: { planId, customerId: userId },
    });

    if (!plan) {
      throw new NotFoundException(`Dairy plan ${planId} not found`);
    }

    if (plan.status !== PlanStatus.ACTIVE) {
      throw new BadRequestException('Cannot add extra delivery to an inactive subscription');
    }

    const targetDate = dto.targetDate
      ? new Date(`${dto.targetDate}T00:00:00.000Z`)
      : new Date(new Date().setDate(new Date().getDate() + 1));

    const action = await this.prisma.dairyPlanAction.create({
      data: {
        planId,
        actionType: PlanActionType.EXTRA_DELIVERY,
        targetDate,
        extraQuantity: dto.extraQuantity,
        reason: dto.reason || 'Extra quantity requested',
      },
    });

    return {
      planId,
      actionId: action.id,
      actionType: 'EXTRA_DELIVERY',
      targetDate,
      extraQuantity: dto.extraQuantity,
      message: `Added +${dto.extraQuantity} units for ${targetDate.toISOString().split('T')[0]}. Regular plan quantities resume automatically afterward.`,
    };
  }

  /**
   * Pause a dairy plan
   */
  async pausePlan(planId: string, userId: string) {
    const plan = await this.prisma.dairyPlan.findFirst({
      where: { planId, customerId: userId },
    });

    if (!plan) {
      throw new NotFoundException(`Dairy plan ${planId} not found`);
    }

    if (plan.status === PlanStatus.PAUSED) {
      throw new BadRequestException('Dairy plan is already paused');
    }

    return this.prisma.dairyPlan.update({
      where: { planId },
      data: {
        status: PlanStatus.PAUSED,
        pausedAt: new Date(),
      },
    });
  }

  /**
   * Resume a paused dairy plan
   */
  async resumePlan(planId: string, userId: string) {
    const plan = await this.prisma.dairyPlan.findFirst({
      where: { planId, customerId: userId },
    });

    if (!plan) {
      throw new NotFoundException(`Dairy plan ${planId} not found`);
    }

    if (plan.status !== PlanStatus.PAUSED) {
      throw new BadRequestException('Dairy plan is not currently paused');
    }

    return this.prisma.dairyPlan.update({
      where: { planId },
      data: {
        status: PlanStatus.ACTIVE,
        resumedAt: new Date(),
      },
    });
  }

  /**
   * Cancel subscription permanently
   */
  async cancelPlan(planId: string, userId: string) {
    const plan = await this.prisma.dairyPlan.findFirst({
      where: { planId, customerId: userId },
    });

    if (!plan) {
      throw new NotFoundException(`Dairy plan ${planId} not found`);
    }

    return this.prisma.dairyPlan.update({
      where: { planId },
      data: {
        status: PlanStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
  }

  /**
   * Update plan quantities and days
   */
  async updatePlan(planId: string, userId: string, dto: UpdateDairyPlanDto) {
    const plan = await this.prisma.dairyPlan.findFirst({
      where: { planId, customerId: userId },
    });

    if (!plan) {
      throw new NotFoundException(`Dairy plan ${planId} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.items && dto.items.length > 0) {
        await tx.dairyPlanItem.deleteMany({ where: { planId } });
        for (const item of dto.items) {
          const product = await tx.product.findUnique({ where: { productId: item.productId } });
          if (!product) continue;
          await tx.dairyPlanItem.create({
            data: {
              planId,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: product.price,
            },
          });
        }
      }

      return tx.dairyPlan.update({
        where: { planId },
        data: {
          ...(dto.frequency && { frequency: dto.frequency }),
          ...(dto.selectedDays && { selectedDays: dto.selectedDays }),
          ...(dto.addressId && { addressId: dto.addressId }),
        },
        include: {
          items: { include: { product: true } },
          address: true,
        },
      });
    });
  }

  /**
   * Idempotent Daily Order Generation Engine (Section 27)
   */
  async generateDailyOrders(dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
    const dayOfWeek = startOfDay.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    const activePlans = await this.prisma.dairyPlan.findMany({
      where: {
        status: PlanStatus.ACTIVE,
        startDate: { lte: endOfDay },
        OR: [{ endDate: null }, { endDate: { gte: startOfDay } }],
      },
      include: {
        items: { include: { product: true } },
        actions: {
          where: {
            targetDate: { gte: startOfDay, lte: endOfDay },
          },
        },
      },
    });

    const generated = [];

    for (const plan of activePlans) {
      // Check if day matches schedule
      let isScheduledToday = false;
      if (plan.frequency === 'DAILY') {
        isScheduledToday = true;
      } else if (plan.frequency === 'SELECTED_DAYS' && plan.selectedDays.includes(dayOfWeek)) {
        isScheduledToday = true;
      }

      // Check skip action
      const hasSkip = plan.actions.some((a) => a.actionType === PlanActionType.SKIP);
      if (hasSkip || !isScheduledToday) {
        continue;
      }

      // Check idempotency: did we already generate an order for this plan today?
      const existingOrder = await this.prisma.order.findFirst({
        where: {
          dairyPlanId: plan.planId,
          deliveryDate: { gte: startOfDay, lte: endOfDay },
        },
      });

      if (existingOrder) {
        continue; // Idempotent skip
      }

      // Check extra delivery quantity
      const extraAction = plan.actions.find((a) => a.actionType === PlanActionType.EXTRA_DELIVERY);
      const extraQty = extraAction?.extraQuantity || 0;

      const orderId = await this.idGenerator.generateId(IdPrefix.ORDER);

      let subtotal = 0;
      const orderItems = plan.items.map((item, idx) => {
        const qty = idx === 0 ? item.quantity + extraQty : item.quantity;
        const total = qty * item.unitPrice;
        subtotal += total;
        return {
          productId: item.productId,
          productName: item.product.name,
          unitPrice: item.unitPrice,
          quantity: qty,
          totalPrice: total,
        };
      });

      const order = await this.prisma.order.create({
        data: {
          orderId,
          merchantId: plan.merchantId,
          customerId: plan.customerId,
          addressId: plan.addressId,
          status: OrderStatus.CONFIRMED,
          subtotal,
          discount: 0,
          deliveryFee: 0,
          tax: 0,
          total: subtotal,
          isRecurringInstance: true,
          dairyPlanId: plan.planId,
          deliveryDate: startOfDay,
          notes: extraQty > 0 ? `Recurring delivery (+${extraQty} extra units)` : 'Recurring daily delivery',
          items: { create: orderItems },
          delivery: {
            create: {
              merchantId: plan.merchantId,
              status: DeliveryStatus.ASSIGNED,
            },
          },
          payment: {
            create: {
              merchantId: plan.merchantId,
              amount: subtotal,
              currency: 'INR',
              status: PaymentStatus.COMPLETED,
              method: PaymentMethod.WALLET,
              transactionReference: `AUTO-REC-${orderId}`,
            },
          },
        },
      });

      generated.push(order);
    }

    return {
      targetDate: startOfDay.toISOString().split('T')[0],
      plansEvaluated: activePlans.length,
      ordersGeneratedCount: generated.length,
      orders: generated,
    };
  }
}
