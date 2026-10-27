import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Serve processed uploaded images statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 4000);
  const apiPrefix = configService.get<string>('apiPrefix', 'api/v1');

  app.setGlobalPrefix(apiPrefix);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dairy Marketplace Platform API')
    .setDescription(
      'Authoritative REST API documentation for the Multi-Merchant Dairy Marketplace Platform (Customer, Merchant, Delivery Partner & Admin apps)',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Authentication', 'Customer and Merchant registration, login, and token refresh')
    .addTag('Users', 'User profile and credentials management')
    .addTag('Merchants', 'Merchant storefronts and tenant profiles')
    .addTag('Products', 'Product catalog, customer browse API, and merchant stock')
    .addTag('Categories', 'Product categories')
    .addTag('Inventory', 'Stock management and availability')
    .addTag('Cart', 'Customer cart with authoritative price recalculations')
    .addTag('Addresses', 'Customer delivery addresses')
    .addTag('Coupons', 'Discounts and promo codes')
    .addTag('Orders', 'Order placement, checkout, and merchant order management')
    .addTag('Dairy Plans', 'Recurring dairy subscriptions, skip, pause, resume, extra delivery')
    .addTag('Deliveries', 'Delivery partner assignments and status transitions')
    .addTag('Payments', 'Server-controlled payments and webhooks')
    .addTag('Reports', 'Merchant business analytics and order summaries')
    .addTag('Admin', 'Platform governance and audit logs')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`=======================================================`);
  logger.log(`🚀 Dairy Marketplace Platform is running on: http://0.0.0.0:${port}/${apiPrefix}`);
  logger.log(`📚 Swagger API Documentation is live at: http://localhost:${port}/api/docs`);
  logger.log(`=======================================================`);
}

bootstrap();
