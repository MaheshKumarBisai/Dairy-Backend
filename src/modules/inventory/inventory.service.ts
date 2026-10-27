import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateStockDto, AdjustStockDto } from './dto/inventory.dto';
import { StockStatus, Prisma } from '@prisma/client';
import { AuditAction } from '../../common/constants/audit-action.enum';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Merchant updates stock for a specific product
   */
  async updateStock(
    merchantId: string,
    productId: string,
    dto: UpdateStockDto,
    actorId: string,
  ) {
    const inv = await this.prisma.inventory.findFirst({
      where: { productId, merchantId },
    });

    if (!inv) {
      throw new NotFoundException(`Inventory for product ${productId} not found`);
    }

    const stockStatus =
      dto.availableQuantity > 10
        ? StockStatus.IN_STOCK
        : dto.availableQuantity > 0
          ? StockStatus.LOW_STOCK
          : StockStatus.OUT_OF_STOCK;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventory.update({
        where: { productId },
        data: {
          availableQuantity: dto.availableQuantity,
          stockStatus,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: 'MERCHANT',
          merchantId,
          action: AuditAction.INVENTORY_CHANGED,
          resource: 'Inventory',
          resourceId: productId,
          oldValue: { availableQuantity: inv.availableQuantity },
          newValue: { availableQuantity: dto.availableQuantity },
        },
      });

      return updated;
    });
  }

  /**
   * Adjusts stock relative to current level (+/-)
   */
  async adjustStock(
    merchantId: string,
    productId: string,
    dto: AdjustStockDto,
    actorId: string,
  ) {
    const inv = await this.prisma.inventory.findFirst({
      where: { productId, merchantId },
    });

    if (!inv) {
      throw new NotFoundException(`Inventory for product ${productId} not found`);
    }

    const newQty = inv.availableQuantity + dto.adjustment;
    if (newQty < 0) {
      throw new BadRequestException('Adjustment would result in negative stock quantity');
    }

    return this.updateStock(merchantId, productId, { availableQuantity: newQty }, actorId);
  }

  /**
   * Concurrency-safe stock reservation within an active checkout transaction
   */
  async reserveStockTx(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
  ) {
    const inv = await tx.inventory.findUnique({
      where: { productId },
    });

    if (!inv || inv.availableQuantity < quantity) {
      throw new BadRequestException(
        `Insufficient stock for product ${productId}. Available: ${inv?.availableQuantity ?? 0}, Requested: ${quantity}`,
      );
    }

    const newAvailable = inv.availableQuantity - quantity;
    const newReserved = inv.reservedQuantity + quantity;
    const stockStatus =
      newAvailable > 10
        ? StockStatus.IN_STOCK
        : newAvailable > 0
          ? StockStatus.LOW_STOCK
          : StockStatus.OUT_OF_STOCK;

    return tx.inventory.update({
      where: { productId },
      data: {
        availableQuantity: newAvailable,
        reservedQuantity: newReserved,
        stockStatus,
      },
    });
  }
}
