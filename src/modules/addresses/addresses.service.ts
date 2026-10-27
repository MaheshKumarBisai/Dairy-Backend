import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

function autoGeocode(city?: string, postalCode?: string): { lat: number; lng: number } {
  const c = (city || '').toLowerCase();
  const p = (postalCode || '').trim();
  if (
    c.includes('vishakapatnam') ||
    c.includes('visakhapatnam') ||
    c.includes('vizag') ||
    p.startsWith('530') ||
    p.startsWith('531')
  ) {
    return { lat: 17.6868, lng: 83.2185 };
  }
  if (c.includes('hyderabad') || p.startsWith('500') || p.startsWith('501')) {
    return { lat: 17.385, lng: 78.4867 };
  }
  if (c.includes('vijayawada') || p.startsWith('520')) {
    return { lat: 16.5062, lng: 80.648 };
  }
  if (c.includes('guntur') || p.startsWith('522')) {
    return { lat: 16.3067, lng: 80.4365 };
  }
  if (c.includes('pune') || p.startsWith('411')) {
    return { lat: 18.5204, lng: 73.8567 };
  }
  if (c.includes('mumbai') || p.startsWith('400')) {
    return { lat: 19.076, lng: 72.8777 };
  }
  if (c.includes('bangalore') || c.includes('bengaluru') || p.startsWith('560')) {
    return { lat: 12.9716, lng: 77.5946 };
  }
  if (c.includes('chennai') || p.startsWith('600')) {
    return { lat: 13.0827, lng: 80.2707 };
  }
  if (c.includes('delhi') || p.startsWith('110')) {
    return { lat: 28.6139, lng: 77.209 };
  }
  return { lat: 17.6868, lng: 83.2185 };
}

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const geo =
      dto.latitude != null && dto.longitude != null
        ? { lat: dto.latitude, lng: dto.longitude }
        : autoGeocode(dto.city, dto.postalCode);

    return this.prisma.address.create({
      data: {
        userId,
        title: dto.title,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        latitude: geo.lat,
        longitude: geo.lng,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { addressId, userId },
    });

    if (!address) {
      throw new NotFoundException(`Address ${addressId} not found`);
    }

    return address;
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.findOne(userId, addressId);

    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.update({
      where: { addressId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.addressLine1 && { addressLine1: dto.addressLine1 }),
        ...(dto.addressLine2 !== undefined && { addressLine2: dto.addressLine2 }),
        ...(dto.city && { city: dto.city }),
        ...(dto.state && { state: dto.state }),
        ...(dto.postalCode && { postalCode: dto.postalCode }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async delete(userId: string, addressId: string) {
    await this.findOne(userId, addressId);
    return this.prisma.address.delete({
      where: { addressId },
    });
  }
}
