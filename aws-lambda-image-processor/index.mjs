import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import sharp from 'sharp';

const { Client } = pg;
const s3 = new S3Client();

// Database connection config (RDS PostgreSQL in Private Subnet)
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
};

export const handler = async (event) => {
  console.log('Received S3 Event:', JSON.stringify(event, null, 2));

  // Extract bucket and object key from S3 Event
  const record = event.Records?.[0];
  if (!record) {
    return { statusCode: 400, body: 'No record found' };
  }

  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  // Avoid infinite loops: skip images that are already processed thumbnails
  if (key.includes('/thumbnails/') || key.startsWith('processed/')) {
    console.log('Skipping already processed image:', key);
    return { statusCode: 200, body: 'Skipped processed image' };
  }

  // Expecting key format: "uploads/products/{productId}/{filename}"
  const keyParts = key.split('/');
  const entityType = keyParts[1]; // e.g. "products"
  const entityId = keyParts[2];   // e.g. "prod_123"

  const dbClient = new Client(dbConfig);

  try {
    // 1. Connect to RDS PostgreSQL
    await dbClient.connect();
    console.log('Connected to RDS PostgreSQL');

    // 2. Validate that the record exists in DB
    let isValidInDb = false;
    if (entityType === 'products' && entityId) {
      const result = await dbClient.query(
        'SELECT "productId", "status" FROM "Product" WHERE "productId" = $1',
        [entityId]
      );
      if (result.rows.length > 0) {
        isValidInDb = true;
      }
    } else {
      // General uploads
      isValidInDb = true;
    }

    if (!isValidInDb) {
      console.warn(`Entity ${entityId} does not exist in RDS. Deleting unapproved S3 object: ${key}`);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return { statusCode: 403, body: 'Rejected: No matching database record' };
    }

    // 3. Fetch image buffer from S3
    const getObjRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const streamToBuffer = (stream) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    const imageBuffer = await streamToBuffer(getObjRes.Body);

    // 4. Validate image with Sharp (format, corrupt image check)
    const metadata = await sharp(imageBuffer).metadata();
    console.log(`Image Validated: format=${metadata.format}, width=${metadata.width}, height=${metadata.height}`);

    const allowedFormats = ['jpeg', 'png', 'webp', 'jpg'];
    if (!allowedFormats.includes(metadata.format)) {
      console.warn(`Invalid format ${metadata.format}. Deleting file.`);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return { statusCode: 400, body: 'Invalid image format' };
    }

    // 5. Generate Thumbnail (optimized web quality)
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const thumbnailKey = `processed/thumbnails/${keyParts.slice(1).join('/')}.webp`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/webp',
      })
    );
    console.log(`Thumbnail created and stored at: ${thumbnailKey}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Image validated and processed successfully',
        thumbnailKey,
      }),
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  } finally {
    await dbClient.end();
  }
};

