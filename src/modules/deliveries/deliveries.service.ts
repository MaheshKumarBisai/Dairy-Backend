import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  AssignDeliveryDto,
  UpdateDeliveryStatusDto,
  AvailableDeliveriesQueryDto,
  UpdateLocationDto,
} from './dto/delivery.dto';
import { calculateDistanceInMeters } from '../../common/utils/geo.util';
import { DeliveryStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class DeliveriesService {
  private readonly partnerRejections = new Map<string, Set<string>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Merchant manually assigns delivery partner to an order belonging to their store
   */
  async assignDeliveryPartner(
    merchantId: string,
    orderId: string,
    dto: AssignDeliveryDto,
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!delivery || delivery.merchantId !== merchantId) {
      throw new NotFoundException(`Delivery for order ${orderId} not found in your merchant store`);
    }

    // Verify delivery partner belongs to this merchant
    const partner = await this.prisma.deliveryPartner.findFirst({
      where: {
        deliveryPartnerId: dto.deliveryPartnerId,
        merchantId,
        isActive: true,
      },
    });

    if (!partner) {
      throw new BadRequestException(
        `Delivery partner ${dto.deliveryPartnerId} is not registered or active under your merchant account`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedDelivery = await tx.delivery.update({
        where: { orderId },
        data: {
          deliveryPartnerId: dto.deliveryPartnerId,
          status: DeliveryStatus.ASSIGNED,
          assignedAt: new Date(),
        },
        include: {
          deliveryPartner: {
            include: {
              user: { select: { name: true, phone: true } },
            },
          },
        },
      });

      await tx.order.update({
        where: { orderId },
        data: { status: OrderStatus.ASSIGNED },
      });

      return updatedDelivery;
    });
  }

  /**
   * Delivery Partner queries nearby available delivery orders within dispatch radius
   * Formatted strictly conforming to the Delivery Broadcast API Contract
   */
  async getAvailableDeliveries(
    deliveryPartnerId: string,
    query: AvailableDeliveriesQueryDto,
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { deliveryPartnerId },
    });

    if (!partner) {
      throw new NotFoundException('Delivery partner profile not found');
    }

    const driverLat = query.latitude ?? partner.currentLatitude;
    const driverLng = query.longitude ?? partner.currentLongitude;
    const radius = query.radiusInMeters ?? query.maxDistanceMeters ?? 10000; // Default 10km search radius

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    // Fetch unassigned available deliveries for this partner's merchant
    const rawDeliveries = await this.prisma.delivery.findMany({
      where: {
        merchantId: partner.merchantId,
        status: { in: [DeliveryStatus.AVAILABLE, DeliveryStatus.ASSIGNED] },
        deliveryPartnerId: null, // Unclaimed orders
      },
      include: {
        order: {
          include: {
            customer: {
              select: { userId: true, name: true, phone: true },
            },
            address: true,
            items: {
              include: {
                product: { select: { productId: true, name: true, unit: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rejectedSet = this.partnerRejections.get(deliveryPartnerId);
    const unrejectedDeliveries = rejectedSet
      ? rawDeliveries.filter((d) => !rejectedSet.has(d.orderId))
      : rawDeliveries;

    // Calculate proximity and filter by radius if coordinates are available
    let filteredOrders = unrejectedDeliveries
      .map((del) => {
        const order = del.order;
        const address = order.address;

        let distanceInMeters: number | null = null;
        if (
          driverLat !== undefined &&
          driverLat !== null &&
          driverLng !== undefined &&
          driverLng !== null &&
          address.latitude !== null &&
          address.longitude !== null
        ) {
          distanceInMeters = calculateDistanceInMeters(
            driverLat,
            driverLng,
            address.latitude,
            address.longitude,
          );
        }

        const dateStr = order.deliveryDate
          ? order.deliveryDate.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        return {
          orderId: order.orderId,
          merchantId: order.merchantId,
          status: order.status,
          delivery: {
            deliveryId: del.deliveryId || del.id,
            status: del.status,
            distanceInMeters,
          },
          customer: {
            customerId: order.customer.userId,
            name: order.customer.name,
            phone: order.customer.phone || '+91XXXXXXXXXX',
          },
          deliveryAddress: {
            addressId: address.addressId,
            addressLine1: address.addressLine1,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            latitude: address.latitude,
            longitude: address.longitude,
          },
          items: order.items.map((item) => ({
            productId: item.productId,
            name: item.productName || item.product.name,
            quantity: item.quantity,
            unit: item.product.unit || 'PACKET',
          })),
          deliverySlot: {
            date: dateStr,
            startTime:
              order.deliverySlotStartTime && order.deliverySlotStartTime !== '06:00'
                ? order.deliverySlotStartTime
                : new Date(order.createdAt).getHours() < 12
                ? '17:30'
                : '06:30',
            endTime:
              order.deliverySlotEndTime && order.deliverySlotEndTime !== '08:00'
                ? order.deliverySlotEndTime
                : new Date(order.createdAt).getHours() < 12
                ? '19:00'
                : '08:00',
          },
        };
      })
      .filter((item) => {
        if (
          item.delivery.distanceInMeters !== null &&
          radius !== undefined &&
          radius > 0
        ) {
          return item.delivery.distanceInMeters <= radius;
        }
        return true;
      });

    const totalItems = filteredOrders.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const paginatedOrders = filteredOrders.slice((page - 1) * limit, page * limit);

    return {
      orders: paginatedOrders,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Delivery Partner claims / accepts an available order
   */
  async acceptDelivery(deliveryPartnerId: string, orderId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!delivery) {
      throw new NotFoundException(`Order ${orderId} delivery record not found`);
    }

    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { deliveryPartnerId },
    });

    if (!partner || partner.merchantId !== delivery.merchantId) {
      throw new ForbiddenException(
        'You cannot accept deliveries belonging to a different merchant',
      );
    }

    if (
      delivery.deliveryPartnerId &&
      delivery.deliveryPartnerId !== deliveryPartnerId
    ) {
      throw new BadRequestException('This order has already been claimed by another delivery partner');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.update({
        where: { orderId },
        data: {
          deliveryPartnerId,
          status: DeliveryStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
        include: {
          order: {
            include: {
              address: true,
              items: true,
            },
          },
        },
      });

      await tx.order.update({
        where: { orderId },
        data: { status: OrderStatus.READY },
      });

      return updated;
    });
  }

  /**
   * Delivery Partner rejects an available or assigned order
   */
  async rejectDelivery(deliveryPartnerId: string, orderId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!delivery) {
      throw new NotFoundException(`Order ${orderId} delivery record not found`);
    }

    // Record rejection so this partner is NEVER shown this available or rejected order again
    let rejected = this.partnerRejections.get(deliveryPartnerId);
    if (!rejected) {
      rejected = new Set<string>();
      this.partnerRejections.set(deliveryPartnerId, rejected);
    }
    rejected.add(orderId);

    // If the delivery is assigned to or accepted by this partner, reset it back to AVAILABLE
    if (delivery.deliveryPartnerId === deliveryPartnerId) {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.delivery.update({
          where: { orderId },
          data: {
            deliveryPartnerId: null,
            status: DeliveryStatus.AVAILABLE,
            acceptedAt: null,
          },
          include: {
            order: {
              include: {
                address: true,
                items: true,
              },
            },
          },
        });

        await tx.order.update({
          where: { orderId },
          data: { status: OrderStatus.READY },
        });

        return updated;
      });
    }

    return delivery;
  }

  /**
   * Delivery partner updates real-time GPS location
   */
  async updateLocation(deliveryPartnerId: string, dto: UpdateLocationDto) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { deliveryPartnerId },
    });

    if (!partner) {
      throw new NotFoundException('Delivery partner profile not found');
    }

    return this.prisma.deliveryPartner.update({
      where: { deliveryPartnerId },
      data: {
        currentLatitude: dto.latitude,
        currentLongitude: dto.longitude,
        lastLocationAt: new Date(),
      },
      select: {
        deliveryPartnerId: true,
        currentLatitude: true,
        currentLongitude: true,
        lastLocationAt: true,
      },
    });
  }

  /**
   * Delivery Partner lists deliveries assigned to them
   */
  async listForPartner(deliveryPartnerId: string, status?: DeliveryStatus) {
    return this.prisma.delivery.findMany({
      where: {
        deliveryPartnerId,
        ...(status && { status }),
      },
      include: {
        order: {
          include: {
            items: true,
            address: true,
            customer: {
              select: { userId: true, name: true, phone: true },
            },
          },
        },
        merchant: {
          select: {
            merchantId: true,
            businessName: true,
            address: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delivery partner updates delivery status (ACCEPTED, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED, FAILED)
   */
  async updateStatusByPartner(
    deliveryPartnerId: string,
    orderId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!delivery) {
      throw new NotFoundException(`Delivery for order ${orderId} not found`);
    }

    if (delivery.deliveryPartnerId !== deliveryPartnerId) {
      throw new ForbiddenException(
        'Security Violation: You are not authorized to update deliveries assigned to other drivers',
      );
    }

    const timestampField: any = {};
    let correspondingOrderStatus: OrderStatus = OrderStatus.ASSIGNED;

    switch (dto.status) {
      case DeliveryStatus.ACCEPTED:
        timestampField.acceptedAt = new Date();
        break;
      case DeliveryStatus.PICKED_UP:
        timestampField.pickedUpAt = new Date();
        correspondingOrderStatus = OrderStatus.OUT_FOR_DELIVERY;
        break;
      case DeliveryStatus.OUT_FOR_DELIVERY:
        correspondingOrderStatus = OrderStatus.OUT_FOR_DELIVERY;
        break;
      case DeliveryStatus.DELIVERED:
        timestampField.deliveredAt = new Date();
        correspondingOrderStatus = OrderStatus.DELIVERED;
        break;
      case DeliveryStatus.FAILED:
        timestampField.failedReason = dto.failedReason || 'Delivery attempt failed';
        correspondingOrderStatus = OrderStatus.FAILED;
        break;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.update({
        where: { orderId },
        data: {
          status: dto.status,
          ...timestampField,
        },
      });

      if (
        dto.status === DeliveryStatus.DELIVERED ||
        dto.status === DeliveryStatus.OUT_FOR_DELIVERY ||
        dto.status === DeliveryStatus.PICKED_UP ||
        dto.status === DeliveryStatus.FAILED
      ) {
        await tx.order.update({
          where: { orderId },
          data: { status: correspondingOrderStatus },
        });
      }

      return updated;
    });
  }
}
