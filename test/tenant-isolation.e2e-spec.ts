import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Marketplace Platform & Tenant Isolation E2E Tests', () => {
  let app: INestApplication;
  let customerToken: string;
  let merchant1Token: string;
  let merchant2Token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Authentication & Token Issuance', () => {
    it('should authenticate Customer and return USR-100005 user profile', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'customer@example.com',
          password: 'Password@123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.accessToken).toBeDefined();
      customerToken = res.body.data.accessToken;
    });

    it('should authenticate Merchant 1 (MR-100001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'merchant@farmfresh.com',
          password: 'Password@123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.merchantId).toBe('MR-100001');
      merchant1Token = res.body.data.accessToken;
    });

    it('should authenticate Merchant 2 (MR-100002)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'merchant@greenvalley.com',
          password: 'Password@123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.merchantId).toBe('MR-100002');
      merchant2Token = res.body.data.accessToken;
    });
  });

  describe('2. Customer Product Browse API (Section 14A Contract)', () => {
    it('should return products adhering strictly to Section 14A response format', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.products).toBeInstanceOf(Array);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);

      const firstProduct = res.body.data.products[0];
      expect(firstProduct.productId).toMatch(/^PRD-/);
      expect(firstProduct.merchantId).toMatch(/^MR-/);
      expect(firstProduct.category).toBeDefined();
      expect(firstProduct.pricing.price).toBeGreaterThan(0);
      expect(firstProduct.pricing.currency).toBe('INR');
      expect(firstProduct.availability.isAvailable).toBeDefined();
      expect(firstProduct.delivery.subscriptionAllowed).toBeDefined();
    });
  });

  describe('3. Multi-Tenant Data Isolation (Section 12 & 13)', () => {
    it('Merchant 1 should only see products belonging to MR-100001', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products/merchant/inventory')
        .set('Authorization', `Bearer ${merchant1Token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      for (const p of res.body.data.products) {
        expect(p.merchantId).toBe('MR-100001');
      }
    });

    it('Merchant 2 should not be able to update Merchant 1 product', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/products/PRD-100001')
        .set('Authorization', `Bearer ${merchant2Token}`)
        .send({ price: 99 })
        .expect(404); // Tenant isolation prevents finding product
    });

    it('Merchant 2 should not be able to adjust Merchant 1 inventory stock', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/inventory/PRD-100001/stock')
        .set('Authorization', `Bearer ${merchant2Token}`)
        .send({ availableQuantity: 500 })
        .expect(404);
    });
  });

  describe('4. Cart, Checkout & Authoritative Price Verification', () => {
    let customerAddressId: string;

    beforeAll(async () => {
      const addrRes = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`);
      customerAddressId = addrRes.body.data[0].addressId;
    });

    it('Customer adds Cow Milk to cart and retrieves calculated summary', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: 'PRD-100001',
          quantity: 2,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.subtotal).toBe(60); // 2 * 30
      expect(res.body.data.summary.deliveryFee).toBe(25);
      expect(res.body.data.summary.total).toBe(85);
    });

    it('Customer checks out and backend atomically reserves inventory and creates order', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          addressId: customerAddressId,
          couponCode: 'DAIRY20',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      const order = Array.isArray(res.body.data) ? res.body.data[0] : res.body.data;
      expect(order.orderId).toMatch(/^ORD-/);
      expect(order.merchantId).toBe('MR-100001');
      expect(order.total).toBeGreaterThan(0);
    });
  });

  describe('5. Dairy Subscription Plans & Actions (Section 18)', () => {
    let planId: string;

    it('Customer creates a recurring daily milk subscription', async () => {
      const addrRes = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`);
      const customerAddressId = addrRes.body.data[0].addressId;

      const res = await request(app.getHttpServer())
        .post('/api/v1/dairy-plans')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          addressId: customerAddressId,
          frequency: 'DAILY',
          startDate: '2026-09-25T00:00:00.000Z',
          items: [{ productId: 'PRD-100001', quantity: 2 }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.planId).toMatch(/^DP-/);
      expect(res.body.data.status).toBe('ACTIVE');
      planId = res.body.data.planId;
    });

    it('Customer skips tomorrow delivery without deactivating subscription', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/dairy-plans/${planId}/skip`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ targetDate: '2026-09-26' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.actionType).toBe('SKIP');
    });

    it('Customer adds extra delivery for a special date', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/dairy-plans/${planId}/extra-delivery`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ targetDate: '2026-09-27', extraQuantity: 3 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.extraQuantity).toBe(3);
    });
  });

  describe('6. Delivery Partner Geolocation & Proximity Dispatch (Section 20 & 20A)', () => {
    let deliveryPartnerToken: string;
    let createdOrderId: string;

    it('should authenticate Delivery Partner (DEL-100001)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'driver.raj@farmfresh.com',
          password: 'Password@123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('DELIVERY_PARTNER');
      expect(res.body.data.user.deliveryPartnerId).toBe('DEL-100001');
      deliveryPartnerToken = res.body.data.accessToken;
    });

    it('Delivery partner updates real-time GPS location', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/deliveries/partner/location')
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .send({
          latitude: 16.5060,
          longitude: 80.6478,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.currentLatitude).toBe(16.506);
      expect(res.body.data.currentLongitude).toBe(80.6478);
    });

    it('Merchant prepares an order and marks it READY for dispatch', async () => {
      const merchantOrdersRes = await request(app.getHttpServer())
        .get('/api/v1/orders/merchant/orders')
        .set('Authorization', `Bearer ${merchant1Token}`)
        .expect(200);

      createdOrderId = merchantOrdersRes.body.data.orders[0].orderId;

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${merchant1Token}`)
        .send({ status: 'READY' })
        .expect(200);

      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.data.status).toBe('READY');
    });

    it('Delivery partner discovers available nearby order strictly adhering to Section 20A JSON format', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/deliveries/partner/available?maxDistanceMeters=5000')
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Available delivery orders retrieved successfully');
      expect(res.body.data.orders).toBeInstanceOf(Array);
      expect(res.body.data.orders.length).toBeGreaterThan(0);

      const targetOrder = res.body.data.orders.find((o: any) => o.orderId === createdOrderId);
      expect(targetOrder).toBeDefined();
      expect(targetOrder.merchantId).toBe('MR-100001');
      expect(targetOrder.status).toBe('READY');
      expect(targetOrder.delivery).toBeDefined();
      expect(targetOrder.delivery.status).toBe('AVAILABLE');
      expect(targetOrder.customer).toBeDefined();
      expect(targetOrder.customer.name).toBeDefined();
      expect(targetOrder.deliveryAddress).toBeDefined();
      expect(targetOrder.deliveryAddress.latitude).toBeDefined();
      expect(targetOrder.deliveryAddress.longitude).toBeDefined();
      expect(targetOrder.items).toBeInstanceOf(Array);
      expect(targetOrder.deliverySlot).toBeDefined();
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
    });

    it('Delivery partner claims/accepts the available order atomically', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/deliveries/partner/accept/${createdOrderId}`)
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.deliveryPartnerId).toBe('DEL-100001');
      expect(res.body.data.status).toBe('ACCEPTED');
    });
  });
});
