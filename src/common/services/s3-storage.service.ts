import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-2');
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME', '');

    this.s3Client = new S3Client({
      region: this.region,
    });

    if (this.bucketName) {
      this.logger.log(`S3StorageService initialized with bucket: ${this.bucketName} (${this.region})`);
    } else {
      this.logger.warn('AWS_S3_BUCKET_NAME is not defined. S3 upload will be unavailable.');
    }
  }

  /**
   * Upload buffer directly to S3
   */
  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string = 'image/png',
  ): Promise<string> {
    if (!this.bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME environment variable is not configured');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);

    const publicUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    this.logger.log(`Uploaded file to S3: ${publicUrl}`);
    return publicUrl;
  }

  /**
   * Generate pre-signed URL for direct browser/app upload to S3
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string = 'image/png',
    expiresInSeconds: number = 300,
  ): Promise<{ uploadUrl: string; fileUrl: string }> {
    if (!this.bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME environment variable is not configured');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    return { uploadUrl, fileUrl };
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    if (!this.bucketName) return;

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
    this.logger.log(`Deleted file from S3: ${key}`);
  }
}

