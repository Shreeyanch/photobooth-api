const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region:   process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

// GET /api/photos
// Lists photobooth/jobs/*.bin and pairs each with its JPEG by the shared
// timestamp stem (both files were uploaded with the same `ts` value).
// Response: { photos: [{ image_url, escpos_url, taken_at }] }
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const base = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}`;

  try {
    const data = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: 'photobooth/jobs/',
    }));

    const photos = (data.Contents || [])
      .filter(obj => obj.Key !== 'photobooth/jobs/' && obj.Key.endsWith('.bin'))
      .sort((a, b) => b.LastModified - a.LastModified)
      .map(obj => {
        // Key format: photobooth/jobs/<ts>.bin
        const filename = obj.Key.split('/').pop();          // "<ts>.bin"
        const ts       = filename.replace(/\.bin$/, '');    // "<ts>"

        return {
          image_url:  `${base}/photobooth/${ts}.jpg`,
          escpos_url: `${base}/${obj.Key}`,
          taken_at:   obj.LastModified,
        };
      });

    res.status(200).json({ photos });
  } catch (err) {
    console.error('[photos]', err);
    res.status(500).json({ error: err.message });
  }
};
