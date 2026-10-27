import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlatformMetrics() {
    const [
      totalUsers,
      totalMerchants,
      totalCustomers,
      totalDeliveryPartners,
      totalOrders,
      totalRevenue,
      activePlans,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.merchant.count(),
      this.prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      this.prisma.deliveryPartner.count(),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        where: { status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { total: true },
      }),
      this.prisma.dairyPlan.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      totalUsers,
      totalMerchants,
      totalCustomers,
      totalDeliveryPartners,
      totalOrders,
      grossPlatformVolume: Math.round((totalRevenue._sum.total || 0) * 100) / 100,
      activeSubscriptions: activePlans,
      currency: 'INR',
    };
  }

  async listUsers(role?: UserRole, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = role ? { role } : {};

    const [totalItems, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          userId: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          merchant: { select: { merchantId: true, businessName: true } },
          deliveryPartner: { select: { deliveryPartnerId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  }

  async toggleUserActive(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return this.prisma.user.update({
      where: { userId },
      data: { isActive },
      select: { userId: true, email: true, isActive: true },
    });
  }

  async listAuditLogs(page = 1, limit = 30) {
    const skip = (page - 1) * limit;

    const [totalItems, logs] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findMany({
        skip,
        take: limit,
        include: {
          actor: { select: { userId: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  }
}
