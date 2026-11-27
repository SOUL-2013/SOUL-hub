import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from './patService.ts';
import { isAllowedUploadMime, isValidSafeSegment, resolveConfinedPath } from './gitValidation.ts';

const STORAGE_DIR = path.join(getDataDir(), 'storage');
const META_FILE = path.join(STORAGE_DIR, 'objects-meta.json');
export const MAX_STORAGE_FILE_BYTES = 5 * 1024 * 1024;
export const USER_STORAGE_QUOTA_BYTES = 50 * 1024 * 1024;

export interface StoredObjectMeta {
  id: string;
  ownerId: string;
  bucket: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

function ensureStorageDir(): void {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

function readMeta(): Record<string, StoredObjectMeta> {
  ensureStorageDir();
  if (!fs.existsSync(META_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8')) as Record<string, StoredObjectMeta>;
  } catch {
    return {};
  }
}

function writeMeta(meta: Record<string, StoredObjectMeta>): void {
  ensureStorageDir();
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
}

export function getUserStorageUsage(ownerId: string): number {
  const meta = readMeta();
  return Object.values(meta)
    .filter((item) => item.ownerId === ownerId)
    .reduce((sum, item) => sum + item.sizeBytes, 0);
}

export function saveUploadedObject(
  ownerId: string,
  bucket: string,
  originalName: string,
  mimeType: string,
  buffer: Buffer
): StoredObjectMeta {
  if (!isValidSafeSegment(bucket)) {
    throw new Error('Invalid storage bucket name.');
  }
  if (!isAllowedUploadMime(mimeType)) {
    throw new Error(`Disallowed file MIME type: ${mimeType}`);
  }
  if (buffer.length > MAX_STORAGE_FILE_BYTES) {
    throw new Error('File exceeds 5 MB per-file upload limit.');
  }
  const currentUsage = getUserStorageUsage(ownerId);
  if (currentUsage + buffer.length > USER_STORAGE_QUOTA_BYTES) {
    throw new Error('User storage quota (50 MB free tier) exceeded.');
  }

  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  const id = `${crypto.randomUUID()}${ext}`;
  const bucketDir = resolveConfinedPath(STORAGE_DIR, bucket);
  if (!bucketDir) throw new Error('Invalid storage directory.');
  fs.mkdirSync(bucketDir, { recursive: true });

  const filePath = resolveConfinedPath(bucketDir, id);
  if (!filePath) throw new Error('Invalid storage file path.');
  fs.writeFileSync(filePath, buffer);

  const meta = readMeta();
  const record: StoredObjectMeta = {
    id,
    ownerId,
    bucket,
    originalName: originalName.slice(0, 120),
    mimeType,
    sizeBytes: buffer.length,
    createdAt: new Date().toISOString(),
  };
  meta[`${bucket}/${id}`] = record;
  writeMeta(meta);
  return record;
}

export function getStoredObject(bucket: string, id: string): { filePath: string; meta: StoredObjectMeta } | null {
  if (!isValidSafeSegment(bucket) || !isValidSafeSegment(id)) return null;
  const filePath = resolveConfinedPath(STORAGE_DIR, bucket, id);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const meta = readMeta()[`${bucket}/${id}`];
  if (!meta) return null;
  return { filePath, meta };
}
