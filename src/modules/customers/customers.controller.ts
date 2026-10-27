import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Customer dashboard with subscriptions, recent orders, and addresses' })
  @ApiResponse({ status: 200, description: 'Customer dashboard data' })
  async getDashboard(@CurrentUser('userId') userId: string) {
    const [recentOrders, activePlans, addresses] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: userId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { items: true, payment: true },
      }),
      this.prisma.dairyPlan.findMany({
        where: { customerId: userId, status: 'ACTIVE' },
        include: { items: { include: { product: true } } },
      }),
      this.prisma.address.findMany({
        where: { userId },
        orderBy: { isDefault: 'desc' },
      }),
    ]);

    return {
      data: {
        recentOrders,
        activePlans,
        addresses,
      },
      __message: 'Customer dashboard retrieved successfully',
    };
  }

  @Get('favorites')
  @ApiOperation({ summary: 'List all favorited products for the customer' })
  @ApiResponse({ status: 200, description: 'Customer favorites list' })
  async getFavorites(@CurrentUser('userId') userId: string) {
    const favorites = await this.prisma.customerFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            category: { select: { categoryId: true, name: true } },
            inventory: { select: { availableQuantity: true, stockStatus: true } },
          },
        },
      },
    });

    const storageBase = (process.env.STORAGE_BASE_URL || 'http://localhost:4000/uploads').replace(/\/+$/, '');

    const products = favorites.map((f) => {
      const p = f.product;
      let imageUrl = p.imageUrl || `https://cdn.example.com/products/${p.productId}.webp`;
      const uploadsMatch = imageUrl.match(/\/uploads\/(.+)$/);
      if (uploadsMatch) {
        imageUrl = `${storageBase}/${uploadsMatch[1]}`;
      }

      return {
        productId: p.productId,
        merchantId: p.merchantId,
        name: p.name,
        description: p.description,
        category: p.category,
        image: {
          imageId: p.imageId || 'IMG-DEFAULT',
          imageUrl,
        },
        pricing: {
          price: p.price,
          currency: p.currency,
          unit: p.unit,
        },
        availability: {
          isAvailable: (p.inventory?.availableQuantity ?? 0) > 0,
          stockStatus: p.inventory?.stockStatus || 'IN_STOCK',
        },
        delivery: {
          subscriptionAllowed: p.subscriptionAllowed,
          availableSchedules: p.availableSchedules,
        },
        favoritedAt: f.createdAt,
      };
    });

    return {
      success: true,
      data: {
        products,
        totalItems: products.length,
      },
      message: 'Favorites retrieved successfully',
    };
  }

  @Get('favorites/ids')
  @ApiOperation({ summary: 'Get list of favorite product IDs for customer' })
  @ApiResponse({ status: 200, description: 'List of favorite product IDs' })
  async getFavoriteIds(@CurrentUser('userId') userId: string) {
    const favorites = await this.prisma.customerFavorite.findMany({
      where: { userId },
      select: { productId: true },
    });
    return {
      success: true,
      data: favorites.map((f) => f.productId),
      message: 'Favorite IDs retrieved successfully',
    };
  }

  @Post('favorites/:productId')
  @ApiOperation({ summary: 'Add product to favorites' })
  @ApiResponse({ status: 201, description: 'Product added to favorites' })
  async addFavorite(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    await this.prisma.customerFavorite.upsert({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
      create: {
        userId,
        productId,
      },
      update: {},
    });

    return {
      success: true,
      data: { productId, isFavorite: true },
      message: 'Product added to favorites',
    };
  }

  @Delete('favorites/:productId')
  @ApiOperation({ summary: 'Remove product from favorites' })
  @ApiResponse({ status: 200, description: 'Product removed from favorites' })
  async removeFavorite(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    await this.prisma.customerFavorite.deleteMany({
      where: {
        userId,
        productId,
      },
    });

    return {
      success: true,
      data: { productId, isFavorite: false },
      message: 'Product removed from favorites',
    };
  }
}
