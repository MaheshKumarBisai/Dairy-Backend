import { PrismaClient, UserRole, PlanFrequency, StockStatus, DiscountType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Reset database tables
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.dairyPlanAction.deleteMany();
  await prisma.dairyPlanItem.deleteMany();
  await prisma.dairyPlan.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.category.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.address.deleteMany();
  await prisma.deliveryPartner.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.idSequence.deleteMany();

  // Initialize strict core ID sequences
  await prisma.idSequence.createMany({
    data: [
      { prefix: 'USR', lastNumber: 100000 },
      { prefix: 'ADM', lastNumber: 100000 },
      { prefix: 'MR', lastNumber: 100000 },
      { prefix: 'DEL', lastNumber: 100000 },
      { prefix: 'CAT', lastNumber: 100000 },
      { prefix: 'PRD', lastNumber: 100000 },
      { prefix: 'IMG', lastNumber: 100000 },
      { prefix: 'ORD', lastNumber: 100000 },
      { prefix: 'DP', lastNumber: 100000 },
    ],
  });

  const passwordHash = await bcrypt.hash('Password@123', 10);

  // 1. Admin User
  const admin = await prisma.user.create({
    data: {
      userId: 'ADM-100001',
      email: 'admin@dairyplatform.com',
      passwordHash,
      name: 'Platform Administrator',
      phone: '+919999900000',
      role: UserRole.ADMIN,
    },
  });

  // 2. Merchant 1 (Farm Fresh Dairy)
  const merchantUser1 = await prisma.user.create({
    data: {
      userId: 'USR-100002',
      email: 'merchant@farmfresh.com',
      passwordHash,
      name: 'Ramesh Patel',
      phone: '+919876543210',
      role: UserRole.MERCHANT,
    },
  });

  const merchant1 = await prisma.merchant.create({
    data: {
      merchantId: 'MR-100001',
      userId: merchantUser1.userId,
      businessName: 'Farm Fresh Organic Dairy',
      address: 'Plot 12, Whitefield Dairy Road, Bangalore',
      phone: '+919876543210',
      email: 'merchant@farmfresh.com',
      commissionRate: 0.05,
      latitude: 16.5061,
      longitude: 80.6479,
    },
  });

  // 3. Merchant 2 (Green Valley Farms)
  const merchantUser2 = await prisma.user.create({
    data: {
      userId: 'USR-100003',
      email: 'merchant@greenvalley.com',
      passwordHash,
      name: 'Sunita Sharma',
      phone: '+919876543220',
      role: UserRole.MERCHANT,
    },
  });

  const merchant2 = await prisma.merchant.create({
    data: {
      merchantId: 'MR-100002',
      userId: merchantUser2.userId,
      businessName: 'Green Valley Pure Dairy',
      address: 'Sector 8, Kanakapura Road, Bangalore',
      phone: '+919876543220',
      email: 'merchant@greenvalley.com',
      commissionRate: 0.05,
      latitude: 16.5100,
      longitude: 80.6500,
    },
  });

  // 4. Delivery Partner for Merchant 1
  const deliveryUser1 = await prisma.user.create({
    data: {
      userId: 'USR-100004',
      email: 'driver.raj@farmfresh.com',
      passwordHash,
      name: 'Raj Kumar',
      phone: '+919876543301',
      role: UserRole.DELIVERY_PARTNER,
    },
  });

  const deliveryPartner1 = await prisma.deliveryPartner.create({
    data: {
      deliveryPartnerId: 'DEL-100001',
      userId: deliveryUser1.userId,
      merchantId: merchant1.merchantId,
      vehicleType: 'Motorcycle',
      vehicleNumber: 'KA-01-AB-1234',
      isAvailable: true,
      isActive: true,
      currentLatitude: 16.5060,
      currentLongitude: 80.6478,
      lastLocationAt: new Date(),
    },
  });

  // 5. Customer 1
  const customerUser1 = await prisma.user.create({
    data: {
      userId: 'USR-100005',
      email: 'customer@example.com',
      passwordHash,
      name: 'Ananya Roy',
      phone: '+919876543401',
      role: UserRole.CUSTOMER,
      customer: { create: {} },
    },
  });

  const address1 = await prisma.address.create({
    data: {
      addressId: 'ADDR-100001',
      userId: customerUser1.userId,
      title: 'Home',
      addressLine1: 'Flat 402, Green Meadows Apartment',
      addressLine2: 'Indiranagar 100ft Road',
      city: 'Bangalore',
      state: 'Karnataka',
      postalCode: '560038',
      latitude: 12.9756,
      longitude: 77.6412,
      isDefault: true,
    },
  });

  // 6. Categories
  const catMilk = await prisma.category.create({
    data: {
      categoryId: 'CAT-100001',
      name: 'Milk',
      description: 'Fresh farm cow and buffalo milk',
    },
  });

  const catCurd = await prisma.category.create({
    data: {
      categoryId: 'CAT-100002',
      name: 'Curd & Yogurt',
      description: 'Thick, creamy and probiotic rich curd',
    },
  });

  const catPaneer = await prisma.category.create({
    data: {
      categoryId: 'CAT-100003',
      name: 'Paneer & Cheese',
      description: 'Fresh artisanal cottage cheese and butter',
    },
  });

  const catGhee = await prisma.category.create({
    data: {
      categoryId: 'CAT-100004',
      name: 'Ghee & Butter',
      description: 'Traditional bilona A2 cow ghee',
    },
  });

  // 7. Products for Merchant 1
  const img1 = await prisma.productImage.create({
    data: {
      imageId: 'IMG-100001',
      merchantId: merchant1.merchantId,
      originalUrl: 'http://localhost:4000/uploads/MR-100001/IMG-100001_orig.jpg',
      processedUrl: 'https://cdn.example.com/products/IMG-100001.webp',
      status: 'READY',
    },
  });

  const img2 = await prisma.productImage.create({
    data: {
      imageId: 'IMG-100002',
      merchantId: merchant1.merchantId,
      originalUrl: 'http://localhost:4000/uploads/MR-100001/IMG-100002_orig.jpg',
      processedUrl: 'https://cdn.example.com/products/IMG-100002.webp',
      status: 'READY',
    },
  });

  const p1 = await prisma.product.create({
    data: {
      productId: 'PRD-100001',
      merchantId: merchant1.merchantId,
      categoryId: catMilk.categoryId,
      name: 'Fresh Cow Milk',
      description: 'Fresh farm cow milk, delivered daily.',
      price: 30,
      currency: 'INR',
      unit: '500ml',
      imageId: img1.imageId,
      imageUrl: img1.processedUrl,
      subscriptionAllowed: true,
      availableSchedules: ['DAILY', 'SELECTED_DAYS', 'WEEKLY'],
      isActive: true,
      inventory: {
        create: {
          merchantId: merchant1.merchantId,
          availableQuantity: 150,
          reservedQuantity: 0,
          stockStatus: StockStatus.IN_STOCK,
        },
      },
    },
  });

  const p2 = await prisma.product.create({
    data: {
      productId: 'PRD-100002',
      merchantId: merchant1.merchantId,
      categoryId: catCurd.categoryId,
      name: 'Fresh Curd',
      description: 'Thick and fresh dairy curd.',
      price: 45,
      currency: 'INR',
      unit: '500g',
      imageId: img2.imageId,
      imageUrl: img2.processedUrl,
      subscriptionAllowed: true,
      availableSchedules: ['DAILY', 'SELECTED_DAYS'],
      isActive: true,
      inventory: {
        create: {
          merchantId: merchant1.merchantId,
          availableQuantity: 80,
          reservedQuantity: 0,
          stockStatus: StockStatus.IN_STOCK,
        },
      },
    },
  });

  const p3 = await prisma.product.create({
    data: {
      productId: 'PRD-100003',
      merchantId: merchant1.merchantId,
      categoryId: catGhee.categoryId,
      name: 'A2 Cow Vedic Ghee',
      description: 'Pure Vedic Bilona method A2 cow ghee.',
      price: 650,
      currency: 'INR',
      unit: '500ml',
      imageUrl: 'https://cdn.example.com/products/PRD-100003.webp',
      subscriptionAllowed: false,
      availableSchedules: ['ONE_TIME'],
      isActive: true,
      inventory: {
        create: {
          merchantId: merchant1.merchantId,
          availableQuantity: 30,
          reservedQuantity: 0,
          stockStatus: StockStatus.IN_STOCK,
        },
      },
    },
  });

  // 8. Coupons
  await prisma.coupon.create({
    data: {
      couponId: 'CPN-100001',
      merchantId: null, // Platform-wide coupon
      code: 'DAIRY20',
      description: '20% off on all dairy essentials',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      minOrderValue: 100,
      maxDiscount: 60,
      validFrom: new Date('2026-01-01'),
      validUntil: new Date('2026-12-31'),
      usageLimit: 1000,
      isActive: true,
    },
  });

  // Update sequences to reflect seed records
  await prisma.idSequence.update({ where: { prefix: 'USR' }, data: { lastNumber: 100005 } });
  await prisma.idSequence.update({ where: { prefix: 'ADM' }, data: { lastNumber: 100001 } });
  await prisma.idSequence.update({ where: { prefix: 'MR' }, data: { lastNumber: 100002 } });
  await prisma.idSequence.update({ where: { prefix: 'DEL' }, data: { lastNumber: 100001 } });
  await prisma.idSequence.update({ where: { prefix: 'CAT' }, data: { lastNumber: 100004 } });
  await prisma.idSequence.update({ where: { prefix: 'PRD' }, data: { lastNumber: 100003 } });
  await prisma.idSequence.update({ where: { prefix: 'IMG' }, data: { lastNumber: 100002 } });
  await prisma.idSequence.update({ where: { prefix: 'ORD' }, data: { lastNumber: 100000 } });
  await prisma.idSequence.update({ where: { prefix: 'DP' }, data: { lastNumber: 100000 } });

  console.log('✅ Database seed completed successfully!');
  console.log('---------------------------------------------------------');
  console.log('Admin User:            admin@dairyplatform.com / Password@123 (ADM-100001)');
  console.log('Merchant User 1:       merchant@farmfresh.com / Password@123 (MR-100001)');
  console.log('Merchant User 2:       merchant@greenvalley.com / Password@123 (MR-100002)');
  console.log('Delivery Partner 1:    driver.raj@farmfresh.com / Password@123 (DEL-100001)');
  console.log('Customer User 1:       customer@example.com / Password@123 (USR-100005)');
  console.log('---------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
