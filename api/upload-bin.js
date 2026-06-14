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

// POST /api/upload-bin
// Body: { escpos: "<base64>", ts: "<timestamp>" }
// Uploads raw ESC/POS bytes to S3 at photobooth/jobs/<ts>.bin
// The ESP32 polls /api/photos and downloads the latest .bin to print.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { escpos, ts } = req.body;
  if (!escpos) return res.status(400).json({ error: 'No escpos data provided' });
  if (!ts)     return res.status(400).json({ error: 'No timestamp provided' });

  const key    = `photobooth/jobs/${ts}.bin`;
  const buffer = Buffer.from(escpos, 'base64');

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      process.env.S3_BUCKET_NAME,
      Key:         key,
      Body:        buffer,
      ContentType: 'application/octet-stream',
      ACL:         'public-read',
    }));

    const url = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${key}`;
    res.status(200).json({ success: true, url, key });
  } catch (err) {
    console.error('[upload-bin]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
