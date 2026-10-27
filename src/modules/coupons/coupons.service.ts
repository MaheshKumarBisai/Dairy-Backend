import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCouponDto, ValidateCouponDto } from './dto/coupon.dto';
import { DiscountType } from '@prisma/client';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(merchantId: string | null, dto: CreateCouponDto) {
    const existing = await this.prisma.coupon.findUnique({
      where: { code: dto.code.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(`Coupon code "${dto.code}" already exists`);
    }

    return this.prisma.coupon.create({
      data: {
        merchantId: merchantId || null,
        code: dto.code.toUpperCase(),
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderValue: dto.minOrderValue ?? 0,
        maxDiscount: dto.maxDiscount,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validUntil: new Date(dto.validUntil),
        usageLimit: dto.usageLimit,
        isActive: true,
      },
    });
  }

  async validateAndCalculateDiscount(dto: ValidateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: dto.code.toUpperCase() },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Coupon is invalid or inactive');
    }

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      throw new BadRequestException('Coupon has expired or is not yet active');
    }

    if (coupon.merchantId && dto.merchantId && coupon.merchantId !== dto.merchantId) {
      throw new BadRequestException('Coupon is not applicable to products from this merchant');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    if (coupon.minOrderValue && dto.subtotal < coupon.minOrderValue) {
      throw new BadRequestException(
        `Minimum order subtotal of ₹${coupon.minOrderValue} required to apply this coupon`,
      );
    }

    let discount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (dto.subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = Math.min(coupon.discountValue, dto.subtotal);
    }

    return {
      couponId: coupon.couponId,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      calculatedDiscount: Math.round(discount * 100) / 100,
    };
  }

  async listMerchantCoupons(merchantId: string) {
    return this.prisma.coupon.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
