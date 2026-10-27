import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class CreatePaymentIntentDto {
  @ApiProperty({ example: 'ORD-100001', description: 'Order ID' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.ONLINE })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'idem-key-9921203', description: 'Unique idempotency key' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class PaymentWebhookDto {
  @ApiProperty({ example: 'ORD-100001' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ example: 'TXN-RAZORPAY-998822' })
  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.COMPLETED })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @ApiPropertyOptional({ example: 'sig_mock_signature_hash' })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional({ example: 'event_id_unique_123' })
  @IsOptional()
  @IsString()
  eventId?: string;
}
