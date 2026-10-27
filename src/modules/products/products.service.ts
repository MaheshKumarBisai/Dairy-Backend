import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IdGeneratorService, IdPrefix } from '../../common/services/id-generator.service';
import { ProductImageService } from './services/product-image.service';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto/product.dto';
import { StockStatus, Prisma } from '@prisma/client';
import { AuditAction } from '../../common/constants/audit-action.enum';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idGenerator: IdGeneratorService,
    private readonly imageService: ProductImageService,
  ) {}

  /**
   * Merchant creates a new product with inventory under their merchant tenant ID
   */
  async createForMerchant(merchantId: string, dto: CreateProductDto) {
    // Validate category
    const category = await this.prisma.category.findUnique({
      where: { categoryId: dto.categoryId },
    });

    if (!category) {
      throw new BadRequestException(`Category ${dto.categoryId} does not exist`);
    }

    // Verify image belongs to this merchant if imageId supplied
    if (dto.imageId) {
      const ownsImage = await this.imageService.verifyMerchantImageOwnership(
        merchantId,
        dto.imageId,
      );
      if (!ownsImage) {
        throw new ForbiddenException(
          'Cannot attach an image that does not belong to your merchant account',
        );
      }
    }

    const productId = await this.idGenerator.generateId(IdPrefix.PRODUCT);
    const initialStock = dto.initialStock ?? 0;
    const stockStatus =
      initialStock > 10
        ? StockStatus.IN_STOCK
        : initialStock > 0
          ? StockStatus.LOW_STOCK
          : StockStatus.OUT_OF_STOCK;

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          productId,
          merchantId,
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description,
          price: dto.price,
          currency: dto.currency || 'INR',
          unit: dto.unit,
          quantityValue: dto.quantityValue || 1,
          imageId: dto.imageId,
          imageUrl: dto.imageUrl || (dto.imageId ? `https://cdn.example.com/products/${dto.imageId}.webp` : null),
          subscriptionAllowed: dto.subscriptionAllowed ?? true,
          availableSchedules: dto.availableSchedules || ['DAILY', 'SELECTED_DAYS'],
          isActive: true,
        },
        include: {
          category: true,
          productImage: true,
        },
      });

      await tx.inventory.create({
        data: {
          merchantId,
          productId: product.productId,
          availableQuantity: initialStock,
          reservedQuantity: 0,
          stockStatus,
        },
      });

      return product;
    });
  }

  /**
   * Customer browse API returning exact contract format defined in Section 14A
   */
  async browseForCustomer(query: ProductQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      merchant: { isActive: true },
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.merchantId && { merchantId: query.merchantId }),
      ...(query.subscriptionAllowed !== undefined && {
        subscriptionAllowed: query.subscriptionAllowed,
      }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined && { gte: Number(query.minPrice) }),
              ...(query.maxPrice !== undefined && { lte: Number(query.maxPrice) }),
            },
          }
        : {}),
    };

    const [totalItems, rawProducts] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: {
            select: { categoryId: true, name: true },
          },
          inventory: {
            select: { availableQuantity: true, stockStatus: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    // Transform products exactly matching Section 14A schema
    const products = rawProducts.map((p) => {
      const isAvailable = (p.inventory?.availableQuantity ?? 0) > 0;
      return {
        productId: p.productId,
        merchantId: p.merchantId,
        name: p.name,
        description: p.description,
        category: {
          categoryId: p.category.categoryId,
          name: p.category.name,
        },
        image: {
          imageId: p.imageId || 'IMG-DEFAULT',
          imageUrl: this.resolveImageUrl(p.imageUrl, p.productId),
        },
        pricing: {
          price: p.price,
          currency: p.currency,
          unit: p.unit,
        },
        availability: {
          isAvailable,
          stockStatus: p.inventory?.stockStatus || StockStatus.IN_STOCK,
        },
        delivery: {
          subscriptionAllowed: p.subscriptionAllowed,
          availableSchedules: p.availableSchedules,
        },
      };
    });

    return {
      products,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Get single product details formatted for customer
   */
  async getSingleForCustomer(productId: string) {
    const p = await this.prisma.product.findFirst({
      where: { productId, isActive: true, merchant: { isActive: true } },
      include: {
        category: { select: { categoryId: true, name: true } },
        inventory: { select: { availableQuantity: true, stockStatus: true } },
      },
    });

    if (!p) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const isAvailable = (p.inventory?.availableQuantity ?? 0) > 0;

    return {
      productId: p.productId,
      merchantId: p.merchantId,
      name: p.name,
      description: p.description,
      category: {
        categoryId: p.category.categoryId,
        name: p.category.name,
      },
      image: {
        imageId: p.imageId || 'IMG-DEFAULT',
        imageUrl: this.resolveImageUrl(p.imageUrl, p.productId),
      },
      pricing: {
        price: p.price,
        currency: p.currency,
        unit: p.unit,
      },
      availability: {
        isAvailable,
        stockStatus: p.inventory?.stockStatus || StockStatus.IN_STOCK,
      },
      delivery: {
        subscriptionAllowed: p.subscriptionAllowed,
        availableSchedules: p.availableSchedules,
      },
    };
  }

  /**
   * Merchant lists their own catalog with full inventory details (strict tenant isolation)
   */
  async listForMerchant(merchantId: string, query: ProductQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      merchantId, // STRICT TENANT ISOLATION
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [totalItems, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          inventory: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      products,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  }

  /**
   * Merchant updates their own product (with audit logging when price changes)
   */
  async updateForMerchant(
    merchantId: string,
    productId: string,
    dto: UpdateProductDto,
    actorId: string,
  ) {
    // Tenant query validation
    const existing = await this.prisma.product.findFirst({
      where: { productId, merchantId },
    });

    if (!existing) {
      throw new NotFoundException(
        `Product ${productId} not found in your merchant store inventory`,
      );
    }

    if (dto.imageId) {
      const ownsImage = await this.imageService.verifyMerchantImageOwnership(
        merchantId,
        dto.imageId,
      );
      if (!ownsImage) {
        throw new ForbiddenException(
          'Cannot attach an image that does not belong to your merchant account',
        );
      }
    }

    const priceChanged = dto.price !== undefined && dto.price !== existing.price;

    const updated = await this.prisma.$transaction(async (tx) => {
      const prod = await tx.product.update({
        where: { productId },
        data: {
          ...(dto.categoryId && { categoryId: dto.categoryId }),
          ...(dto.name && { name: dto.name }),
          ...(dto.description && { description: dto.description }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.unit && { unit: dto.unit }),
          ...(dto.imageId && { imageId: dto.imageId }),
          ...(dto.imageUrl && { imageUrl: dto.imageUrl }),
          ...(dto.subscriptionAllowed !== undefined && {
            subscriptionAllowed: dto.subscriptionAllowed,
          }),
          ...(dto.availableSchedules && {
            availableSchedules: dto.availableSchedules,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: {
          category: true,
          inventory: true,
        },
      });

      if (priceChanged) {
        await tx.auditLog.create({
          data: {
            actorId,
            actorRole: 'MERCHANT',
            merchantId,
            action: AuditAction.PRODUCT_PRICE_CHANGED,
            resource: 'Product',
            resourceId: productId,
            oldValue: { price: existing.price },
            newValue: { price: dto.price },
          },
        });
      }

      return prod;
    });

    return updated;
  }

  /**
   * Merchant soft-deletes / deactivates product
   */
  async deleteForMerchant(merchantId: string, productId: string) {
    const existing = await this.prisma.product.findFirst({
      where: { productId, merchantId },
    });

    if (!existing) {
      throw new NotFoundException(`Product ${productId} not found in your merchant store`);
    }

    return this.prisma.product.update({
      where: { productId },
      data: { isActive: false },
    });
  }

  /**
   * Dynamically resolves image URLs to ensure they point to the currently active STORAGE_BASE_URL
   */
  private resolveImageUrl(url: string | null | undefined, productId: string): string {
    if (!url) return `https://cdn.example.com/products/${productId}.webp`;
    const storageBase = (process.env.STORAGE_BASE_URL || 'http://localhost:4000/uploads').replace(/\/+$/, '');
    const uploadsMatch = url.match(/\/uploads\/(.+)$/);
    if (uploadsMatch) {
      return `${storageBase}/${uploadsMatch[1]}`;
    }
    return url;
  }
}
