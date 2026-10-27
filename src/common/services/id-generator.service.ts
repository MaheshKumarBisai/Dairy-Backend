import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export enum IdPrefix {
  USER = 'USR',
  ADMIN = 'ADM',
  MERCHANT = 'MR',
  DELIVERY_PARTNER = 'DEL',
  CATEGORY = 'CAT',
  PRODUCT = 'PRD',
  IMAGE = 'IMG',
  ORDER = 'ORD',
  DAIRY_PLAN = 'DP',
}

@Injectable()
export class IdGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically increments and generates the next strictly monotonic sequential ID.
   * Format: PREFIX-100001
   */
  async generateId(prefix: IdPrefix | string): Promise<string> {
    const sequence = await this.prisma.idSequence.upsert({
      where: { prefix },
      update: {
        lastNumber: {
          increment: 1,
        },
      },
      create: {
        prefix,
        lastNumber: 100001,
      },
    });

    return `${prefix}-${sequence.lastNumber.toString()}`;
  }
}
