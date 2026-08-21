import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MEDIA_DIR = fileURLToPath(new URL('../media/', import.meta.url));
const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION, AWS_BUCKET } = process.env;
export const useS3 = !!(AWS_BUCKET && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);

let s3 = null, PutObjectCommand, GetObjectCommand;
if (useS3) {
  const m = await import('@aws-sdk/client-s3');
  ({ PutObjectCommand, GetObjectCommand } = m);
  s3 = new m.S3Client({
    region: AWS_DEFAULT_REGION || 'ap-southeast-1',
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    forcePathStyle: process.env.AWS_USE_PATH_STYLE_ENDPOINT === 'true',
  });
  console.log('Media store: S3 bucket', AWS_BUCKET);
}

const EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', mp4: 'video/mp4', pdf: 'application/pdf' };
const mimeOf = (name) => EXT_MIME[name.split('.').pop()?.toLowerCase()] || 'application/octet-stream';

// simpan buffer, return path publik lewat app: /media/<name>
export async function storeMedia(name, buffer, contentType) {
  if (useS3) {
    await s3.send(new PutObjectCommand({ Bucket: AWS_BUCKET, Key: `media/${name}`, Body: buffer, ContentType: contentType || mimeOf(name) }));
  } else {
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(MEDIA_DIR + name, buffer);
  }
  return '/media/' + name;
}

// baca balik buat route /media/:name (proxy — jalan walau bucket private)
export async function readMedia(name) {
  if (useS3) {
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: AWS_BUCKET, Key: `media/${name}` }));
      return { buffer: Buffer.from(await r.Body.transformToByteArray()), contentType: r.ContentType || mimeOf(name) };
    } catch { /* fallback ke disk lokal (file lama sebelum S3) */ }
  }
  return { buffer: await readFile(MEDIA_DIR + name), contentType: mimeOf(name) };
}
