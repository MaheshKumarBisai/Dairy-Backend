import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import { PrismaService } from '../../../database/prisma.service';
import { IdGeneratorService, IdPrefix } from '../../../common/services/id-generator.service';
import { S3StorageService } from '../../../common/services/s3-storage.service';

@Injectable()
export class ProductImageService {
  private readonly logger = new Logger(ProductImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly idGenerator: IdGeneratorService,
    private readonly s3StorageService: S3StorageService,
  ) {}

  /**
   * Processes uploaded image:
   * 1. Stores original privately
   * 2. Removes original background using AI segmentation
   * 3. Composites isolated product cleanly onto pure solid #FFFFFF white background
   * 4. Resizes and saves as optimized PNG/WebP for e-commerce marketing strategy
   * 5. Assigns unique IMG-xxxx ID and creates database record
   */
  async processAndStoreImage(
    merchantId: string,
    originalFilename: string,
    fileBuffer?: Buffer,
  ) {
    const imageId = await this.idGenerator.generateId(IdPrefix.IMAGE);
    const storageBase = this.configService.get<string>(
      'storage.baseUrl',
      '/uploads',
    );

    const uploadsDir = path.join(process.cwd(), 'uploads', merchantId);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    let processedUrl = `/uploads/${merchantId}/${imageId}.png`;
    let originalUrl = `/uploads/${merchantId}/${imageId}_orig_${originalFilename}`;

    if (fileBuffer && fileBuffer.length > 0) {
      const origFilePath = path.join(uploadsDir, `${imageId}_orig_${originalFilename}`);
      fs.writeFileSync(origFilePath, fileBuffer);

      try {
        this.logger.log(`[ImageProcessing] Removing background for ${originalFilename} (${imageId})...`);

        // 1. Prepare buffer resized to 600px for fast segmentation
        const preparedBuffer = await sharp(fileBuffer)
          .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
          .toBuffer();

        // 2. Remove background using AI model
        const blobInput = new Blob([preparedBuffer], { type: 'image/jpeg' });
        const transparentBlob = await removeBackground(blobInput);
        const arrayBuf = await transparentBlob.arrayBuffer();
        const transparentPng = Buffer.from(arrayBuf);

        // 3. Trim transparency & fit onto pure white canvas with marketing padding
        const productMeta = await sharp(transparentPng).trim().toBuffer();

        const canvasSize = 600;
        const padding = Math.round(canvasSize * 0.12);
        const maxProductSize = canvasSize - padding * 2;

        const fittedProduct = await sharp(productMeta)
          .resize(maxProductSize, maxProductSize, {
            fit: 'inside',
            withoutEnlargement: false,
          })
          .toBuffer();

        let processedBuffer: Buffer;
        try {
          processedBuffer = await sharp({
            create: {
              width: canvasSize,
              height: canvasSize,
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            },
          })
            .composite([{ input: fittedProduct, gravity: 'center' }])
            .png()
            .toBuffer();
        } catch {
          processedBuffer = await sharp(fileBuffer)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .resize(600, 600, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
            .png()
            .toBuffer();
        }

        const processedPath = path.join(uploadsDir, `${imageId}.png`);
        fs.writeFileSync(processedPath, processedBuffer);

        // Upload to S3 if bucket is configured
        const bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME');
        if (bucketName) {
          try {
            const s3OrigKey = `uploads/products/${merchantId}/${imageId}_orig_${originalFilename}`;
            const s3ProcKey = `uploads/products/${merchantId}/${imageId}.png`;

            originalUrl = await this.s3StorageService.uploadFile(s3OrigKey, fileBuffer, 'image/jpeg');
            processedUrl = await this.s3StorageService.uploadFile(s3ProcKey, processedBuffer, 'image/png');
            this.logger.log(`[ImageProcessing] Synced product image to S3: ${processedUrl}`);
          } catch (s3Err: any) {
            this.logger.warn(`[ImageProcessing] S3 upload skipped/failed: ${s3Err.message}`);
          }
        }
      } catch (procErr: any) {
        this.logger.error(`[ImageProcessing] Processing error: ${procErr.message}`);
      }
    } else {
      processedUrl = `/uploads/${merchantId}/${imageId}.png`;
    }

    const record = await this.prisma.productImage.create({
      data: {
        imageId,
        merchantId,
        originalUrl,
        processedUrl,
        status: 'READY',
      },
    });

    return {
      imageId: record.imageId,
      imageUrl: record.processedUrl,
      originalUrl: record.originalUrl,
      status: record.status,
    };
  }

  async verifyMerchantImageOwnership(merchantId: string, imageId: string): Promise<boolean> {
    const img = await this.prisma.productImage.findFirst({
      where: { imageId, merchantId },
    });
    return !!img;
  }
}
