import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductImageService } from './services/product-image.service';
import { S3StorageService } from '../../common/services/s3-storage.service';

@Module({
  imports: [ConfigModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductImageService, S3StorageService],
  exports: [ProductsService, ProductImageService, S3StorageService],
})
export class ProductsModule {}
