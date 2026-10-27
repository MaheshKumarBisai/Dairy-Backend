import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Merchant dashboard summary report with strict tenant isolation
   */
  async getMerchantReport(merchantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      totalRevenueAggregate,
      totalProducts,
      activePlans,
      activeDeliveryPartners,
    ] = await Promise.all([
      this.prisma.order.count({ where: { merchantId } }),
      this.prisma.order.count({
        where: {
          merchantId,
          deliveryDate: { gte: today },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          merchantId,
          status: { notIn: ['CANCELLED', 'FAILED'] },
        },
        _sum: { total: true },
      }),
      this.prisma.product.count({ where: { merchantId, isActive: true } }),
      this.prisma.dairyPlan.count({ where: { merchantId, status: 'ACTIVE' } }),
      this.prisma.deliveryPartner.count({ where: { merchantId, isActive: true } }),
    ]);

    const recentOrders = await this.prisma.order.findMany({
      where: { merchantId },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true, phone: true } },
        items: true,
      },
    });

    return {
      overview: {
        totalRevenue: Math.round((totalRevenueAggregate._sum.total || 0) * 100) / 100,
        totalOrders,
        todayOrders,
        totalProducts,
        activeSubscriptions: activePlans,
        activeDeliveryPartners,
        currency: 'INR',
      },
      recentOrders,
    };
  }
}
