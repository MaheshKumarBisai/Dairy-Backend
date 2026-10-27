import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductImageService } from './services/product-image.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto/product.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly imageService: ProductImageService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Customer Product Browse API (Conforms strictly to Section 14A)' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async browseForCustomer(@Query() query: ProductQueryDto) {
    const data = await this.productsService.browseForCustomer(query);
    return {
      data,
      __message: 'Products retrieved successfully',
    };
  }

  @Public()
  @Get(':productId')
  @ApiOperation({ summary: 'Get single product details for customer app' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  async getSingleProductCustomer(@Param('productId') productId: string) {
    const data = await this.productsService.getSingleForCustomer(productId);
    return {
      data,
      __message: 'Product retrieved successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Post()
  @ApiOperation({ summary: 'Merchant creates a new product in their store' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  async createForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @Body() dto: CreateProductDto,
  ) {
    const data = await this.productsService.createForMerchant(merchantId, dto);
    return {
      data,
      __message: 'Product created successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @Post('images/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload product image: automatically removes background & moves to white background' })
  @ApiResponse({ status: 201, description: 'Image processed with white background and reference generated' })
  async uploadRealImage(
    @CurrentUser('merchantId') merchantId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const mId = merchantId || 'MR-100001';
    const filename = file?.originalname || 'product.jpg';
    const buffer = file?.buffer;
    const data = await this.imageService.processAndStoreImage(mId, filename, buffer);
    return {
      data,
      __message: 'Product image background removed and placed on clean white background successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @Post('images/upload-base64')
  @ApiOperation({ summary: 'Upload base64 image: automatically removes background & moves to white background' })
  @ApiResponse({ status: 201, description: 'Image processed with white background' })
  async uploadBase64Image(
    @CurrentUser('merchantId') merchantId: string,
    @Body() body: { base64: string; filename?: string },
  ) {
    const mId = merchantId || 'MR-100001';
    const cleanBase64 = body.base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const filename = body.filename || 'product.jpg';
    const data = await this.imageService.processAndStoreImage(mId, filename, buffer);
    return {
      data,
      __message: 'Product image background removed and placed on clean white background successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @Post('images/upload-mock')
  @ApiOperation({ summary: 'Merchant uploads product image (Processes & assigns IMG-100001)' })
  @ApiResponse({ status: 201, description: 'Image processed and reference generated' })
  async uploadImage(
    @CurrentUser('merchantId') merchantId: string,
    @Body() body: { filename: string },
  ) {
    const data = await this.imageService.processAndStoreImage(
      merchantId || 'MR-100001',
      body.filename || 'dairy_product.jpg',
    );
    return {
      data,
      __message: 'Product image processed successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Get('merchant/inventory')
  @ApiOperation({ summary: 'Merchant lists their own catalog with inventory stocks' })
  @ApiResponse({ status: 200, description: 'Merchant inventory retrieved' })
  async listForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @Query() query: ProductQueryDto,
  ) {
    const data = await this.productsService.listForMerchant(merchantId, query);
    return {
      data,
      __message: 'Merchant inventory retrieved successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Patch(':productId')
  @ApiOperation({ summary: 'Merchant updates a product in their store' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  async updateForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @CurrentUser('userId') actorId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    const data = await this.productsService.updateForMerchant(
      merchantId,
      productId,
      dto,
      actorId,
    );
    return {
      data,
      __message: 'Product updated successfully',
    };
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard, TenantGuard)
  @Roles(UserRole.MERCHANT)
  @Delete(':productId')
  @ApiOperation({ summary: 'Merchant deactivates a product from their store' })
  @ApiResponse({ status: 200, description: 'Product deactivated successfully' })
  async deleteForMerchant(
    @CurrentUser('merchantId') merchantId: string,
    @Param('productId') productId: string,
  ) {
    const data = await this.productsService.deleteForMerchant(merchantId, productId);
    return {
      data,
      __message: 'Product deactivated successfully',
    };
  }
}
