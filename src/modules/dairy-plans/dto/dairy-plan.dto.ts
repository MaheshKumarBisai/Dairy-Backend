import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { PlanFrequency, PlanStatus } from '@prisma/client';

export class DairyPlanItemDto {
  @ApiProperty({ example: 'PRD-100001' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateDairyPlanDto {
  @ApiProperty({ example: 'ADDR-100001' })
  @IsString()
  @IsNotEmpty()
  addressId: string;

  @ApiProperty({ enum: PlanFrequency, example: PlanFrequency.DAILY })
  @IsEnum(PlanFrequency)
  frequency: PlanFrequency;

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5], description: 'Selected days (1=Mon, ..., 7=Sun)' })
  @IsOptional()
  @IsArray()
  selectedDays?: number[];

  @ApiProperty({ example: '2026-09-25T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ type: [DairyPlanItemDto] })
  @IsArray()
  items: DairyPlanItemDto[];
}

export class UpdateDairyPlanDto {
  @ApiPropertyOptional({ enum: PlanFrequency })
  @IsOptional()
  @IsEnum(PlanFrequency)
  frequency?: PlanFrequency;

  @ApiPropertyOptional({ example: [1, 3, 5] })
  @IsOptional()
  @IsArray()
  selectedDays?: number[];

  @ApiPropertyOptional({ example: 'ADDR-100002' })
  @IsOptional()
  @IsString()
  addressId?: string;

  @ApiPropertyOptional({ type: [DairyPlanItemDto] })
  @IsOptional()
  @IsArray()
  items?: DairyPlanItemDto[];
}

export class SkipDeliveryDto {
  @ApiPropertyOptional({ example: '2026-09-25', description: 'Date to skip (YYYY-MM-DD). Defaults to tomorrow.' })
  @IsOptional()
  @IsString()
  targetDate?: string;

  @ApiPropertyOptional({ example: 'Traveling out of town' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ExtraDeliveryDto {
  @ApiPropertyOptional({ example: '2026-09-25', description: 'Target delivery date (YYYY-MM-DD). Defaults to tomorrow.' })
  @IsOptional()
  @IsString()
  targetDate?: string;

  @ApiProperty({ example: 2, description: 'Extra quantity to add for the selected day' })
  @IsInt()
  @IsPositive()
  extraQuantity: number;

  @ApiPropertyOptional({ example: 'Family gathering' })
  @IsOptional()
  @IsString()
  reason?: string;
}
