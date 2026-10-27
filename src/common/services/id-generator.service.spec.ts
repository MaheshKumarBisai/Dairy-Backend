import { Test, TestingModule } from '@nestjs/testing';
import { IdGeneratorService, IdPrefix } from './id-generator.service';
import { PrismaService } from '../../database/prisma.service';

describe('IdGeneratorService', () => {
  let service: IdGeneratorService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdGeneratorService,
        {
          provide: PrismaService,
          useValue: {
            idSequence: {
              upsert: jest.fn().mockImplementation(({ where }) => {
                return Promise.resolve({
                  prefix: where.prefix,
                  lastNumber: BigInt(100001),
                });
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<IdGeneratorService>(IdGeneratorService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should generate properly formatted User ID (USR-100001)', async () => {
    const id = await service.generateId(IdPrefix.USER);
    expect(id).toBe('USR-100001');
  });

  it('should generate properly formatted Merchant ID (MR-100001)', async () => {
    const id = await service.generateId(IdPrefix.MERCHANT);
    expect(id).toBe('MR-100001');
  });

  it('should generate properly formatted Product ID (PRD-100001)', async () => {
    const id = await service.generateId(IdPrefix.PRODUCT);
    expect(id).toBe('PRD-100001');
  });

  it('should generate properly formatted Order ID (ORD-100001)', async () => {
    const id = await service.generateId(IdPrefix.ORDER);
    expect(id).toBe('ORD-100001');
  });
});
