import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryStatus } from '@prisma/client';

export class AssignDeliveryDto {
  @ApiProperty({ example: 'DEL-100001', description: 'Delivery Partner ID' })
  @IsString()
  @IsNotEmpty()
  deliveryPartnerId: string;
}

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus, example: DeliveryStatus.PICKED_UP })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;

  @ApiPropertyOptional({ example: 'Customer not reachable at location' })
  @IsOptional()
  @IsString()
  failedReason?: string;
}

export class AvailableDeliveriesQueryDto {
  @ApiPropertyOptional({ example: 16.5062, description: 'Current driver latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 80.6480, description: 'Current driver longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Search radius in meters (e.g. 50m, 500m, 5000m)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  radiusInMeters?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Alias for radiusInMeters' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxDistanceMeters?: number;

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
}

export class UpdateLocationDto {
  @ApiProperty({ example: 16.5062, description: 'Latitude' })
  @IsNumber()
  @IsNotEmpty()
  latitude: number;

  @ApiProperty({ example: 80.6480, description: 'Longitude' })
  @IsNumber()
  @IsNotEmpty()
  longitude: number;
}
