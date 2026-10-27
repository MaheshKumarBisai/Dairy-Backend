import { Test, TestingModule } from '@nestjs/testing';
import { CartService } from './cart.service';
import { PrismaService } from '../../database/prisma.service';
import { CouponsService } from '../coupons/coupons.service';

describe('CartService - Authoritative Price Calculation (Section 15)', () => {
  let cartService: CartService;
  let couponsService: CouponsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: PrismaService,
          useValue: {
            cart: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            cartItem: {
              update: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
        {
          provide: CouponsService,
          useValue: {
            validateAndCalculateDiscount: jest.fn().mockResolvedValue({
              couponId: 'CPN-100001',
              code: 'DAIRY20',
              calculatedDiscount: 20,
            }),
          },
        },
      ],
    }).compile();

    cartService = module.get<CartService>(CartService);
    couponsService = module.get<CouponsService>(CouponsService);
  });

  it('should accurately calculate subtotal and delivery fee for orders below threshold', async () => {
    const mockCart = {
      id: 'cart-1',
      items: [
        {
          id: 'item-1',
          productId: 'PRD-100001',
          quantity: 2,
          deliverySchedule: 'ONE_TIME',
          selectedDays: [],
          product: {
            productId: 'PRD-100001',
            name: 'Fresh Cow Milk',
            merchantId: 'MR-100001',
            price: 30,
            unit: '500ml',
            imageUrl: 'https://cdn.example.com/products/PRD-100001.webp',
          },
        },
      ],
    };

    const result = await cartService.calculateAuthoritativeTotal(mockCart);
    // Subtotal: 2 * 30 = 60
    // Delivery fee: 25 (subtotal < 200)
    // Total: 85
    expect(result.summary.subtotal).toBe(60);
    expect(result.summary.deliveryFee).toBe(25);
    expect(result.summary.discount).toBe(0);
    expect(result.summary.total).toBe(85);
  });

  it('should waive delivery fee when subtotal is >= 200', async () => {
    const mockCart = {
      id: 'cart-2',
      items: [
        {
          id: 'item-1',
          productId: 'PRD-100003',
          quantity: 1,
          deliverySchedule: 'ONE_TIME',
          selectedDays: [],
          product: {
            productId: 'PRD-100003',
            name: 'A2 Cow Vedic Ghee',
            merchantId: 'MR-100001',
            price: 650,
            unit: '500ml',
            imageUrl: 'https://cdn.example.com/products/PRD-100003.webp',
          },
        },
      ],
    };

    const result = await cartService.calculateAuthoritativeTotal(mockCart);
    expect(result.summary.subtotal).toBe(650);
    expect(result.summary.deliveryFee).toBe(0);
    expect(result.summary.total).toBe(650);
  });

  it('should apply discount from coupon and recalculate final total', async () => {
    const mockCart = {
      id: 'cart-3',
      items: [
        {
          id: 'item-1',
          productId: 'PRD-100001',
          quantity: 8,
          deliverySchedule: 'ONE_TIME',
          selectedDays: [],
          product: {
            productId: 'PRD-100001',
            name: 'Fresh Cow Milk',
            merchantId: 'MR-100001',
            price: 30,
            unit: '500ml',
            imageUrl: null,
          },
        },
      ],
    };

    const result = await cartService.calculateAuthoritativeTotal(mockCart, 'DAIRY20');
    // Subtotal: 240
    // Discount: 20
    // Delivery fee: 0 (subtotal >= 200)
    // Total: 220
    expect(result.summary.subtotal).toBe(240);
    expect(result.summary.discount).toBe(20);
    expect(result.summary.deliveryFee).toBe(0);
    expect(result.summary.total).toBe(220);
    expect(result.summary.appliedCoupon.code).toBe('DAIRY20');
  });
});
