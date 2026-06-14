const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region:   process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, ts } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  // If the caller supplies a timestamp, use it as the key so the JPEG and its
  // companion .bin share the same stem (pairable by /api/photos).
  const stem   = ts || Date.now().toString();
  const key    = `photobooth/${stem}.jpg`;
  const base64 = image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      process.env.S3_BUCKET_NAME,
      Key:         key,
      Body:        buffer,
      ContentType: 'image/jpeg',
      ACL:         'public-read',
    }));

    const url = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${key}`;
    res.status(200).json({ success: true, url, key });
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
