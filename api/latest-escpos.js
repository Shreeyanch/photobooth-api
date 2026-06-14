const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region:   process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId:     process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

// GET /api/latest-escpos  (also reachable at /api/photos/latest/escpos via vercel.json rewrite)
//
// Returns the most recent ESC/POS .bin file as application/octet-stream.
// Supports ETag-based conditional requests:
//   - ESP32 sends:   If-None-Match: "<etag-from-last-response>"
//   - If unchanged:  304 Not Modified  (empty body — do not print)
//   - If new job:    200 + binary body + ETag header
//
// ESP32 flow:
//   GET /api/latest-escpos
//   ├─ 304 → already printed, skip
//   └─ 200 → stream body to printer TCP :9100, store ETag for next poll
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // List bins, sorted newest-first
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
      Prefix: 'photobooth/jobs/',
    }));

    const bins = (list.Contents || [])
      .filter(obj => obj.Key !== 'photobooth/jobs/' && obj.Key.endsWith('.bin'))
      .sort((a, b) => b.LastModified - a.LastModified);

    if (bins.length === 0) {
      return res.status(404).json({ error: 'No print jobs found' });
    }

    const latest = bins[0];
    // S3 ETag is already quoted: '"<md5hex>"'. Use it directly.
    const etag = latest.ETag || `"${latest.Key}-${latest.LastModified.getTime()}"`;

    // Conditional request: if ESP32 already has this job, return 304
    const clientETag = req.headers['if-none-match'];
    if (clientETag && clientETag === etag) {
      res.setHeader('ETag', etag);
      return res.status(304).end();
    }

    // Download binary from S3
    const obj = await s3.send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key:    latest.Key,
    }));

    // Collect stream into buffer (safe for Vercel serverless environment)
    const chunks = [];
    for await (const chunk of obj.Body) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${latest.Key.split('/').pop()}"`);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(buffer);

  } catch (err) {
    console.error('[latest-escpos]', err);
    res.status(500).json({ error: err.message });
  }
};
