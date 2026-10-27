import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { AddToCartDto, UpdateCartItemDto, CalculateCartDto } from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
  ) {}

  private async getOrCreateCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
                inventory: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  category: true,
                  inventory: true,
                },
              },
            },
          },
        },
      });
    }

    return cart;
  }

  async getCart(userId: string, options?: CalculateCartDto) {
    const cart = await this.getOrCreateCart(userId);
    return this.calculateAuthoritativeTotal(cart, options?.couponCode);
  }

  async addToCart(userId: string, dto: AddToCartDto) {
    const cart = await this.getOrCreateCart(userId);

    const product = await this.prisma.product.findUnique({
      where: { productId: dto.productId, isActive: true },
      include: { inventory: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found or inactive`);
    }

    if ((product.inventory?.availableQuantity ?? 0) < dto.quantity) {
      throw new BadRequestException(
        `Only ${product.inventory?.availableQuantity ?? 0} units available in stock`,
      );
    }

    const existingItem = cart.items.find((i) => i.productId === dto.productId);

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + dto.quantity,
          deliverySchedule: dto.deliverySchedule || existingItem.deliverySchedule,
          selectedDays: dto.selectedDays || existingItem.selectedDays,
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
          deliverySchedule: dto.deliverySchedule || 'ONE_TIME',
          selectedDays: dto.selectedDays || [],
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);

    if (!item) {
      throw new NotFoundException(`Cart item ${itemId} not found in your cart`);
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity: dto.quantity,
        ...(dto.deliverySchedule && { deliverySchedule: dto.deliverySchedule }),
        ...(dto.selectedDays && { selectedDays: dto.selectedDays }),
      },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);

    if (!item) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
    return this.getCart(userId);
  }

  /**
   * Authoritative server-side price calculation (Section 15)
   */
  async calculateAuthoritativeTotal(cart: any, couponCode?: string) {
    let subtotal = 0;

    const items = cart.items.map((item: any) => {
      const unitPrice = item.product.price;
      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      return {
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        merchantId: item.product.merchantId,
        unitPrice,
        unit: item.product.unit,
        quantity: item.quantity,
        deliverySchedule: item.deliverySchedule,
        selectedDays: item.selectedDays,
        itemTotal: Math.round(itemTotal * 100) / 100,
        imageUrl: item.product.imageUrl,
      };
    });

    let discount = 0;
    let appliedCoupon: any = null;

    if (couponCode && subtotal > 0) {
      try {
        const merchantId = items.length > 0 ? items[0].merchantId : undefined;
        const couponResult = await this.couponsService.validateAndCalculateDiscount({
          code: couponCode,
          subtotal,
          merchantId,
        });
        discount = couponResult.calculatedDiscount;
        appliedCoupon = {
          code: couponResult.code,
          discount: couponResult.calculatedDiscount,
        };
      } catch (err) {
        // Coupon not applied if invalid
      }
    }

    const deliveryFee = subtotal >= 200 || subtotal === 0 ? 0 : 25;
    const tax = 0; // Essential dairy items are 0% GST in standard regime
    const finalTotal = Math.max(0, Math.round((subtotal - discount + deliveryFee + tax) * 100) / 100);

    return {
      cartId: cart.id,
      items,
      itemCount: items.reduce((acc: number, cur: any) => acc + cur.quantity, 0),
      summary: {
        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        deliveryFee,
        tax,
        total: finalTotal,
        currency: 'INR',
        appliedCoupon,
      },
    };
  }
}
