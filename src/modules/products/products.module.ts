import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductImageService } from './services/product-image.service';

@Module({
  imports: [ConfigModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductImageService],
  exports: [ProductsService, ProductImageService],
})
export class ProductsModule {}
