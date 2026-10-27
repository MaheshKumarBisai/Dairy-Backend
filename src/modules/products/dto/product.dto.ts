import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty({ example: 'CAT-100001', description: 'Category ID' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: 'Fresh Cow Milk', description: 'Product title' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Fresh farm cow milk, delivered daily.', description: 'Product description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 30, description: 'Product price in INR' })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: '500ml', description: 'Measurement unit' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  quantityValue?: number;

  @ApiPropertyOptional({ example: 'IMG-100001', description: 'Pre-uploaded and processed Image ID' })
  @IsOptional()
  @IsString()
  imageId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/products/cow-milk.webp' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  subscriptionAllowed?: boolean;

  @ApiPropertyOptional({ example: ['DAILY', 'SELECTED_DAYS', 'WEEKLY'] })
  @IsOptional()
  @IsArray()
  availableSchedules?: string[];

  @ApiPropertyOptional({ example: 100, description: 'Initial inventory quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialStock?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'CAT-100001' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Pure Cow Milk 500ml' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '100% pure organic cow milk' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 32 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @ApiPropertyOptional({ example: '500ml' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 'IMG-100002' })
  @IsOptional()
  @IsString()
  imageId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/products/cow-milk-v2.webp' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  subscriptionAllowed?: boolean;

  @ApiPropertyOptional({ example: ['DAILY', 'SELECTED_DAYS'] })
  @IsOptional()
  @IsArray()
  availableSchedules?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'CAT-100001' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'MR-100001' })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ example: 'Milk' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  subscriptionAllowed?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;
}
