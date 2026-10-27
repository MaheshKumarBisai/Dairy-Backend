import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { PlanFrequency } from '@prisma/client';

export class AddToCartDto {
  @ApiProperty({ example: 'PRD-100001', description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2, description: 'Quantity of the item' })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ enum: PlanFrequency, default: PlanFrequency.ONE_TIME })
  @IsOptional()
  @IsEnum(PlanFrequency)
  deliverySchedule?: PlanFrequency;

  @ApiPropertyOptional({ example: [1, 3, 5], description: 'Selected day indices (0=Sun, 1=Mon, ..., 6=Sat)' })
  @IsOptional()
  @IsArray()
  selectedDays?: number[];
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 3, description: 'Updated quantity' })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ enum: PlanFrequency })
  @IsOptional()
  @IsEnum(PlanFrequency)
  deliverySchedule?: PlanFrequency;

  @ApiPropertyOptional({ example: [1, 3, 5] })
  @IsOptional()
  @IsArray()
  selectedDays?: number[];
}

export class CalculateCartDto {
  @ApiPropertyOptional({ example: 'DAIRY20', description: 'Coupon code to apply' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ example: 'ADDR-100001', description: 'Delivery address ID' })
  @IsOptional()
  @IsString()
  addressId?: string;
}
