import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { DiscountType } from '@prisma/client';

export class CreateCouponDto {
  @ApiProperty({ example: 'DAIRY20' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: '20% off on all fresh milk and curd' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENTAGE })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ example: 20, description: 'Percentage discount or fixed amount in INR' })
  @IsNumber()
  @IsPositive()
  discountValue: number;

  @ApiPropertyOptional({ example: 100, description: 'Minimum order amount in INR' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @ApiPropertyOptional({ example: 50, description: 'Max cap on percentage discount in INR' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxDiscount?: number;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiProperty({ example: '2026-12-31T23:59:59.000Z' })
  @IsDateString()
  @IsNotEmpty()
  validUntil: string;

  @ApiPropertyOptional({ example: 500, description: 'Total global usage quota' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  usageLimit?: number;
}

export class ValidateCouponDto {
  @ApiProperty({ example: 'DAIRY20' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 250, description: 'Current cart subtotal in INR' })
  @IsNumber()
  @IsPositive()
  subtotal: number;

  @ApiPropertyOptional({ example: 'MR-100001' })
  @IsOptional()
  @IsString()
  merchantId?: string;
}
