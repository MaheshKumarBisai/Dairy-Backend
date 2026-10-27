export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  appName: process.env.APP_NAME || 'DairyMarketplacePlatform',
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'super-secret-dairy-jwt-access-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'super-secret-dairy-jwt-refresh-key',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'MOCK',
    apiKey: process.env.PAYMENT_API_KEY || 'test_payment_api_key',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_key',
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'LOCAL',
    baseUrl: process.env.STORAGE_BASE_URL || 'http://localhost:4000/uploads',
    cdnBaseUrl: process.env.CDN_BASE_URL || 'https://cdn.example.com',
  },
});
