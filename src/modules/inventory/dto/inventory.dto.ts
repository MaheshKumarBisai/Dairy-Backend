import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsPositive, Min } from 'class-validator';

export class UpdateStockDto {
  @ApiProperty({ example: 50, description: 'New available stock quantity' })
  @IsInt()
  @Min(0)
  availableQuantity: number;
}

export class AdjustStockDto {
  @ApiProperty({ example: 20, description: 'Quantity to add (positive) or deduct (negative)' })
  @IsInt()
  adjustment: number;
}
