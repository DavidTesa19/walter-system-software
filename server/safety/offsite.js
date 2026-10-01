// Off-site copies of backups, in any S3-compatible bucket (Cloudflare R2 is the
// intended one). A copy outside Railway is the only thing that survives losing
// the database or the whole Railway project.
//
// Configuration (all on the Railway server service):
//   BACKUP_S3_ENDPOINT           https://<account-id>.r2.cloudflarestorage.com
//   BACKUP_S3_BUCKET             bucket name
//   BACKUP_S3_ACCESS_KEY_ID      R2 API token: Access Key ID
//   BACKUP_S3_SECRET_ACCESS_KEY  R2 API token: Secret Access Key
//   BACKUP_S3_REGION             optional, default "auto" (right for R2)
//   BACKUP_S3_PREFIX             optional, default "walter-backups"
//   BACKUP_ENCRYPTION_KEY        optional passphrase; when set, everything sent
//                                off-site is AES-256-GCM encrypted first. Keep a
//                                copy somewhere safe: without it the off-site
//                                backups cannot be read.

import crypto from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const MAGIC = Buffer.from('WALTERE1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey = null;
let cachedPassphrase = null;

function encryptionKey() {
  const passphrase = process.env.BACKUP_ENCRYPTION_KEY;
  if (!passphrase) return null;
  if (cachedPassphrase !== passphrase) {
    cachedKey = crypto.scryptSync(passphrase, 'walter-backup-v1', 32);
    cachedPassphrase = passphrase;
  }
  return cachedKey;
}

export const isEncryptionConfigured = () => Boolean(process.env.BACKUP_ENCRYPTION_KEY);

export function encryptBuffer(plain) {
  const key = encryptionKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

// Reads both encrypted and plain objects, so turning encryption on later does
// not strand the files uploaded before.
export function decryptBuffer(stored) {
  if (stored.length < MAGIC.length || !stored.subarray(0, MAGIC.length).equals(MAGIC)) return stored;
  const key = encryptionKey();
  if (!key) throw new Error('Záloha je zašifrovaná, ale BACKUP_ENCRYPTION_KEY není nastaven.');
  const iv = stored.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
  const tag = stored.subarray(MAGIC.length + IV_LENGTH, MAGIC.length + IV_LENGTH + TAG_LENGTH);
  const body = stored.subarray(MAGIC.length + IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new Error('Zálohu nelze dešifrovat: BACKUP_ENCRYPTION_KEY neodpovídá klíči, kterým byla zašifrována.');
  }
}

export function getOffsiteConfig() {
  const endpoint = process.env.BACKUP_S3_ENDPOINT?.trim();
  const bucket = process.env.BACKUP_S3_BUCKET?.trim();
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
  const prefix = (process.env.BACKUP_S3_PREFIX ?? 'walter-backups').trim().replace(/^\/+|\/+$/g, '');
  return {
    configured: Boolean(endpoint && bucket && accessKeyId && secretAccessKey),
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.BACKUP_S3_REGION?.trim() || 'auto',
    prefix,
  };
}

const streamToBuffer = async (body) => {
  if (typeof body?.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

export function createOffsiteStorage() {
  const config = getOffsiteConfig();
  if (!config.configured) return null;

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Newer SDKs add CRC checksums some S3-compatible stores reject.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const fullKey = (key) => (config.prefix ? `${config.prefix}/${key}` : key);

  return {
    describe: () => ({ bucket: config.bucket, endpointHost: new URL(config.endpoint).host, prefix: config.prefix }),
    location: `${new URL(config.endpoint).host}/${config.bucket}/${config.prefix}`,
    archiveKey: (backupId, kind, createdAt) => {
      const stamp = new Date(createdAt).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      return `archives/${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/${stamp}-b${backupId}-${kind}.json.gz`;
    },
    fileKey: (sha256) => `files/${sha256}`,

    async put(key, buffer) {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: fullKey(key),
        Body: encryptBuffer(buffer),
        ContentType: 'application/octet-stream',
      }));
    },

    async get(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: fullKey(key) }));
      return decryptBuffer(await streamToBuffer(response.Body));
    },

    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: fullKey(key) }));
        return true;
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
        throw error;
      }
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: fullKey(key) }));
    },

    // Newest first. Keys carry a UTC timestamp, so name order is time order.
    async listArchives() {
      const keys = [];
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: fullKey('archives/'),
          ContinuationToken: token,
        }));
        for (const item of page.Contents ?? []) {
          keys.push({ key: item.Key.slice(fullKey('').length), size: item.Size, lastModified: item.LastModified });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys.sort((a, b) => b.key.localeCompare(a.key));
    },

    async selfTest() {
      const key = `healthcheck/${crypto.randomUUID()}.txt`;
      const payload = Buffer.from(`walter backup check ${new Date().toISOString()}`);
      await this.put(key, payload);
      const back = await this.get(key);
      await this.remove(key);
      if (!back.equals(payload)) throw new Error('Načtený soubor neodpovídá nahranému.');
      return true;
    },
  };
}
