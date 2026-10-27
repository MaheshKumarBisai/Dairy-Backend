import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Comprehensive End-to-End Dairy Lifecycle & Geolocation Dispatch Tests', () => {
  let app: INestApplication;

  let customerToken: string;
  let customerAddressId: string;
  let merchantToken: string;
  let deliveryPartnerToken: string;
  let createdOrderId: string;

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

  // ==========================================
  // STAGE 1: CUSTOMER JOURNEY
  // ==========================================
  describe('Stage 1: Customer Browse, Cart & Order Creation with Coordinates', () => {
    it('1.1 Customer logs in successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'customer@example.com',
          password: 'Password@123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('CUSTOMER');
      expect(res.body.data.user.userId).toMatch(/^USR-/);
      expect(res.body.data.accessToken).toBeDefined();
      customerToken = res.body.data.accessToken;
    });

    it('1.2 Customer fetches delivery addresses and verifies GPS coordinates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const defaultAddr = res.body.data[0];
      expect(defaultAddr.addressId).toBeDefined();
      expect(defaultAddr.city).toBe('Bangalore');
      expect(defaultAddr.latitude).toBeDefined();
      expect(defaultAddr.longitude).toBeDefined();
      customerAddressId = defaultAddr.addressId;
    });

    it('1.3 Customer browses marketplace products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.products).toBeInstanceOf(Array);
      expect(res.body.data.products.length).toBeGreaterThan(0);

      const cowMilk = res.body.data.products.find((p: any) => p.name === 'Fresh Cow Milk');
      expect(cowMilk).toBeDefined();
      expect(cowMilk.pricing.price).toBe(30);
    });

    it('1.4 Customer clears cart and adds Cow Milk and Curd', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      // Add Cow Milk (2 units)
      const milkRes = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: 'PRD-100001',
          quantity: 2,
        })
        .expect(201);

      expect(milkRes.body.success).toBe(true);

      // Add Curd (1 unit)
      const curdRes = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: 'PRD-100002',
          quantity: 1,
        })
        .expect(201);

      expect(curdRes.body.success).toBe(true);
    });

    it('1.5 Customer verifies calculated cart summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.summary.subtotal).toBe(105); // (2*30) + (1*45) = 105
      expect(res.body.data.summary.deliveryFee).toBe(25);
    });

    it('1.6 Customer performs Checkout with delivery address and coupon', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          addressId: customerAddressId,
          couponCode: 'DAIRY20',
          deliveryDate: '2026-09-30',
          notes: 'Please leave outside the door',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      const order = Array.isArray(res.body.data) ? res.body.data[0] : res.body.data;
      expect(order.orderId).toMatch(/^ORD-/);
      expect(order.merchantId).toBe('MR-100001');
      expect(order.status).toBe('CONFIRMED');
      expect(order.items.length).toBe(2);
      expect(order.address).toBeDefined();
      expect(order.address.latitude).toBeDefined();
      expect(order.address.longitude).toBeDefined();
      createdOrderId = order.orderId;
    });
  });

  // ==========================================
  // STAGE 2: MERCHANT JOURNEY
  // ==========================================
  describe('Stage 2: Merchant Store Fulfillment & Dispatch Preparation', () => {
    it('2.1 Merchant 1 logs in successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'merchant@farmfresh.com',
          password: 'Password@123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('MERCHANT');
      expect(res.body.data.user.merchantId).toBe('MR-100001');
      merchantToken = res.body.data.accessToken;
    });

    it('2.2 Merchant lists incoming orders and finds the customer order', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/merchant/orders')
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const orders = res.body.data.orders;
      const found = orders.find((o: any) => o.orderId === createdOrderId);
      expect(found).toBeDefined();
      expect(found.merchantId).toBe('MR-100001');
    });

    it('2.3 Merchant packs the order and marks status READY for dispatch', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ status: 'READY' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(createdOrderId);
      expect(res.body.data.status).toBe('READY');
    });
  });

  // ==========================================
  // STAGE 3: DELIVERY PARTNER JOURNEY
  // ==========================================
  describe('Stage 3: Delivery Partner Geolocation Discovery, Claim & Turn-by-Turn Lifecycle', () => {
    it('3.1 Delivery Partner logs in successfully', async () => {
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

    it('3.2 Delivery Partner updates real-time GPS location coordinates', async () => {
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

    it('3.3 Delivery Partner queries available nearby deliveries matching Section 20A contract', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/deliveries/partner/available?maxDistanceMeters=5000')
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Available delivery orders retrieved successfully');
      expect(res.body.data.orders).toBeInstanceOf(Array);

      const targetOrder = res.body.data.orders.find((o: any) => o.orderId === createdOrderId);
      expect(targetOrder).toBeDefined();
      expect(targetOrder.merchantId).toBe('MR-100001');
      expect(targetOrder.status).toBe('READY');
      expect(targetOrder.delivery.status).toBe('AVAILABLE');
      expect(targetOrder.delivery.distanceInMeters).toBeGreaterThanOrEqual(0);

      // Verify exact customer profile and location contract
      expect(targetOrder.customer.name).toBe('Ananya Roy');
      expect(targetOrder.customer.phone).toBe('+919876543401');
      expect(targetOrder.deliveryAddress.addressId).toBe(customerAddressId);
      expect(targetOrder.deliveryAddress.latitude).toBe(16.5062);
      expect(targetOrder.deliveryAddress.longitude).toBe(80.6480);
      expect(targetOrder.deliveryAddress.city).toBe('Bangalore');

      // Verify items array and delivery slot
      expect(targetOrder.items.length).toBe(2);
      expect(targetOrder.items[0].productId).toMatch(/^PRD-/);
      expect(targetOrder.deliverySlot.startTime).toBeDefined();
      expect(targetOrder.deliverySlot.endTime).toBeDefined();
    });

    it('3.4 Delivery Partner claims/accepts the order', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/deliveries/partner/accept/${createdOrderId}`)
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.deliveryPartnerId).toBe('DEL-100001');
      expect(res.body.data.status).toBe('ACCEPTED');
      expect(res.body.data.acceptedAt).toBeDefined();
    });

    it('3.5 Delivery Partner verifies order appears in their active assigned deliveries list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/deliveries/partner/assigned')
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const myDeliveries = res.body.data;
      const myOrder = myDeliveries.find((d: any) => d.orderId === createdOrderId);
      expect(myOrder).toBeDefined();
      expect(myOrder.status).toBe('ACCEPTED');
      expect(myOrder.order.address.latitude).toBe(16.5062);
      expect(myOrder.order.address.longitude).toBe(80.6480);
    });

    it('3.6 Delivery Partner updates status to PICKED_UP from merchant facility', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/partner/status/${createdOrderId}`)
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .send({ status: 'PICKED_UP' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PICKED_UP');
      expect(res.body.data.pickedUpAt).toBeDefined();
    });

    it('3.7 Delivery Partner updates status to OUT_FOR_DELIVERY', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/partner/status/${createdOrderId}`)
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .send({ status: 'OUT_FOR_DELIVERY' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OUT_FOR_DELIVERY');
    });

    it('3.8 Delivery Partner completes delivery and updates status to DELIVERED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/partner/status/${createdOrderId}`)
        .set('Authorization', `Bearer ${deliveryPartnerToken}`)
        .send({ status: 'DELIVERED' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DELIVERED');
      expect(res.body.data.deliveredAt).toBeDefined();
    });
  });

  // ==========================================
  // STAGE 4: CUSTOMER CONFIRMATION & ORDER STATE
  // ==========================================
  describe('Stage 4: Customer Order Verification', () => {
    it('4.1 Customer views order details and verifies DELIVERED status and tracking', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${createdOrderId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(createdOrderId);
      expect(res.body.data.status).toBe('DELIVERED');
      expect(res.body.data.delivery).toBeDefined();
      expect(res.body.data.delivery.status).toBe('DELIVERED');
      expect(res.body.data.delivery.deliveredAt).toBeDefined();
      expect(res.body.data.delivery.deliveryPartner.user.name).toBe('Raj Kumar');
    });
  });
});
