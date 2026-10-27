import { Body, Controller, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateStockDto, AdjustStockDto } from './dto/inventory.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(RolesGuard, TenantGuard)
@Roles(UserRole.MERCHANT)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Put(':productId/stock')
  @ApiOperation({ summary: 'Merchant sets absolute stock quantity for a product' })
  @ApiResponse({ status: 200, description: 'Stock updated' })
  async updateStock(
    @CurrentUser('merchantId') merchantId: string,
    @CurrentUser('userId') actorId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateStockDto,
  ) {
    const data = await this.inventoryService.updateStock(
      merchantId,
      productId,
      dto,
      actorId,
    );
    return {
      data,
      __message: 'Inventory stock updated successfully',
    };
  }

  @Patch(':productId/adjust')
  @ApiOperation({ summary: 'Merchant adjusts stock by delta (+ / -)' })
  @ApiResponse({ status: 200, description: 'Stock adjusted' })
  async adjustStock(
    @CurrentUser('merchantId') merchantId: string,
    @CurrentUser('userId') actorId: string,
    @Param('productId') productId: string,
    @Body() dto: AdjustStockDto,
  ) {
    const data = await this.inventoryService.adjustStock(
      merchantId,
      productId,
      dto,
      actorId,
    );
    return {
      data,
      __message: 'Inventory stock adjusted successfully',
    };
  }
}
