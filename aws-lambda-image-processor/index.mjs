import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import Jimp from 'jimp';

const { Client } = pg;
const s3 = new S3Client();

export const handler = async (event) => {
  console.log('Received S3 Event:', JSON.stringify(event, null, 2));

  const record = event.Records?.[0];
  if (!record) {
    console.log('No record found in event');
    return { statusCode: 400, body: 'No record found' };
  }

  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  console.log(`Processing S3 Object from bucket "${bucket}": ${key}`);

  // Avoid infinite loops: skip images that are already processed thumbnails
  if (key.includes('/thumbnails/') || key.startsWith('processed/')) {
    console.log('Skipping already processed thumbnail:', key);
    return { statusCode: 200, body: 'Skipped processed image' };
  }

  // Parse path components (e.g., "uploads/products/MR-100001/PRD_front_123.png")
  const keyParts = key.split('/');
  const entityType = keyParts[1] || 'general';
  const entityId = keyParts[2] || 'unknown';

  // 1. Fetch image buffer from S3
  let imageBuffer;
  try {
    const getObjRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const streamToBuffer = (stream) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    imageBuffer = await streamToBuffer(getObjRes.Body);
    console.log(`Fetched object from S3 (${imageBuffer.length} bytes)`);
  } catch (err) {
    console.error('Failed to fetch object from S3:', err);
    return { statusCode: 404, body: 'Object not found in S3' };
  }

  // 2. Validate and process image using Jimp (100% pure JavaScript, zero native C++ bindings)
  let image;
  try {
    image = await Jimp.read(imageBuffer);
    console.log(`Image parsed successfully: ${image.bitmap.width}x${image.bitmap.height}, MIME: ${image.getMIME()}`);
  } catch (err) {
    console.error(`Invalid image format for key: ${key}`, err);
    return { statusCode: 400, body: 'Invalid or unsupported image format' };
  }

  // 3. Optional DB record check if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    let dbClient;
    try {
      dbClient = new Client({ connectionString: process.env.DATABASE_URL });
      await dbClient.connect();
      console.log('Connected to RDS PostgreSQL');

      if (entityId && entityId !== 'unknown') {
        const res = await dbClient.query(
          'SELECT "merchantId" AS id FROM "Merchant" WHERE "merchantId" = $1 UNION SELECT "productId" AS id FROM "Product" WHERE "productId" = $1',
          [entityId]
        );
        if (res.rows.length > 0) {
          console.log(`Validated entity against RDS: ${entityId}`);
        } else {
          console.log(`Entity ${entityId} not yet committed in RDS (new draft product)`);
        }
      }
    } catch (dbErr) {
      console.warn('RDS connection warning (continuing processing):', dbErr.message);
    } finally {
      if (dbClient) {
        try { await dbClient.end(); } catch (_) {}
      }
    }
  }

  // 4. Generate optimized Thumbnail (fit within 400x400)
  image.scaleToFit(400, 400);
  const thumbnailBuffer = await image.getBufferAsync(Jimp.MIME_PNG);

  const thumbnailKey = `processed/thumbnails/${keyParts.slice(1).join('/')}`;

  console.log(`Uploading thumbnail to: ${thumbnailKey} (${thumbnailBuffer.length} bytes)`);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/png',
    })
  );

  console.log(`Thumbnail successfully generated and saved to: ${thumbnailKey}`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Thumbnail generated successfully',
      thumbnailKey,
    }),
  };
};
