import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@ApiTags('Addresses')
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  @ApiOperation({ summary: 'Customer adds a new delivery address' })
  @ApiResponse({ status: 201, description: 'Address created' })
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    const data = await this.addressesService.create(userId, dto);
    return {
      data,
      __message: 'Address saved successfully',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Customer lists all saved delivery addresses' })
  @ApiResponse({ status: 200, description: 'List of addresses' })
  async findAll(@CurrentUser('userId') userId: string) {
    const data = await this.addressesService.findAllForUser(userId);
    return {
      data,
      __message: 'Addresses retrieved successfully',
    };
  }

  @Get(':addressId')
  @ApiOperation({ summary: 'Get single address details' })
  @ApiResponse({ status: 200, description: 'Address details' })
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('addressId') addressId: string,
  ) {
    const data = await this.addressesService.findOne(userId, addressId);
    return {
      data,
      __message: 'Address retrieved successfully',
    };
  }

  @Patch(':addressId')
  @ApiOperation({ summary: 'Update an existing address' })
  @ApiResponse({ status: 200, description: 'Address updated' })
  async update(
    @CurrentUser('userId') userId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const data = await this.addressesService.update(userId, addressId, dto);
    return {
      data,
      __message: 'Address updated successfully',
    };
  }

  @Delete(':addressId')
  @ApiOperation({ summary: 'Delete a saved address' })
  @ApiResponse({ status: 200, description: 'Address deleted' })
  async delete(
    @CurrentUser('userId') userId: string,
    @Param('addressId') addressId: string,
  ) {
    const data = await this.addressesService.delete(userId, addressId);
    return {
      data,
      __message: 'Address deleted successfully',
    };
  }
}
