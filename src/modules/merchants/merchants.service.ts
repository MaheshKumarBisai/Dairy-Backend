import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateMerchantDto } from './dto/merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyMerchantProfile(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { merchantId },
      include: {
        _count: {
          select: {
            products: true,
            orders: true,
            deliveryPartners: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant profile with ID ${merchantId} not found`);
    }

    return merchant;
  }

  async updateMerchantProfile(merchantId: string, dto: UpdateMerchantDto) {
    const merchant = await this.prisma.merchant.update({
      where: { merchantId },
      data: {
        ...(dto.businessName && { businessName: dto.businessName }),
        ...(dto.address && { address: dto.address }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.email && { email: dto.email }),
      },
    });

    return merchant;
  }

  async listPublicMerchants() {
    return this.prisma.merchant.findMany({
      where: { isActive: true },
      select: {
        merchantId: true,
        businessName: true,
        address: true,
        phone: true,
        email: true,
        createdAt: true,
      },
    });
  }

  async getPublicMerchantById(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { merchantId, isActive: true },
      select: {
        merchantId: true,
        businessName: true,
        address: true,
        phone: true,
        email: true,
        createdAt: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found or currently inactive');
    }

    return merchant;
  }
}
