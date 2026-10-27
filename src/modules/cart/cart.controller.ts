import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AddToCartDto, UpdateCartItemDto, CalculateCartDto } from './dto/cart.dto';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get current customer active cart with authoritative totals' })
  @ApiResponse({ status: 200, description: 'Cart retrieved successfully' })
  async getCart(
    @CurrentUser('userId') userId: string,
    @Query() options: CalculateCartDto,
  ) {
    const data = await this.cartService.getCart(userId, options);
    return {
      data,
      __message: 'Cart retrieved successfully',
    };
  }

  @Post('items')
  @ApiOperation({ summary: 'Add product item to cart' })
  @ApiResponse({ status: 201, description: 'Item added to cart' })
  async addToCart(
    @CurrentUser('userId') userId: string,
    @Body() dto: AddToCartDto,
  ) {
    const data = await this.cartService.addToCart(userId, dto);
    return {
      data,
      __message: 'Item added to cart',
    };
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity or schedule' })
  @ApiResponse({ status: 200, description: 'Cart updated' })
  async updateItem(
    @CurrentUser('userId') userId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const data = await this.cartService.updateItem(userId, itemId, dto);
    return {
      data,
      __message: 'Cart item updated successfully',
    };
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiResponse({ status: 200, description: 'Item removed from cart' })
  async removeItem(
    @CurrentUser('userId') userId: string,
    @Param('itemId') itemId: string,
  ) {
    const data = await this.cartService.removeItem(userId, itemId);
    return {
      data,
      __message: 'Item removed from cart',
    };
  }

  @Delete()
  @ApiOperation({ summary: 'Clear all items in cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared' })
  async clearCart(@CurrentUser('userId') userId: string) {
    const data = await this.cartService.clearCart(userId);
    return {
      data,
      __message: 'Cart cleared successfully',
    };
  }
}
