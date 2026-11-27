import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfinedPath } from './gitValidation.ts';

const DATA_DIR = path.resolve(process.env.SOULHUB_DATA_DIR || './data');
const PAT_FILE = path.join(DATA_DIR, 'pats.json');
const MANIFEST_FILE = path.join(DATA_DIR, 'repo-manifest.json');

const EPHEMERAL_PEPPER = crypto.randomBytes(32).toString('hex');
function getPepper(): string {
  return process.env.SOULHUB_TOKEN_PEPPER || EPHEMERAL_PEPPER;
}

export interface PatRecord {
  id: string;
  uid: string;
  username: string;
  name: string;
  prefix: string;
  tokenHash: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RepoManifestEntry {
  repoId: string;
  ownerId: string;
  ownerUsername: string;
  slug: string;
  fullName: string;
  visibility: 'public' | 'private';
  memberIds: string[];
  protectedBranches: string[];
  defaultBranch: string;
  description: string;
  primaryLanguage: string;
  topics: string[];
  updatedAt: string;
}

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  ensureDataDir();
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureDataDir();
  const tempPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function hashToken(rawToken: string): string {
  return crypto.createHmac('sha256', getPepper()).update(rawToken).digest('hex');
}

export function createPat(
  uid: string,
  username: string,
  name: string,
  scopes: string[] = ['repo:read', 'repo:write']
): { rawToken: string; record: Omit<PatRecord, 'tokenHash'> } {
  const pats = readJsonFile<PatRecord[]>(PAT_FILE, []);
  const randomPart = crypto.randomBytes(24).toString('hex');
  const rawToken = `soul_pat_${randomPart}`;
  const record: PatRecord = {
    id: crypto.randomUUID(),
    uid,
    username,
    name: name.trim().slice(0, 60) || 'Personal Access Token',
    prefix: rawToken.slice(0, 16),
    tokenHash: hashToken(rawToken),
    scopes,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  pats.push(record);
  writeJsonFile(PAT_FILE, pats);
  const { tokenHash: _hidden, ...publicRecord } = record;
  return { rawToken, record: publicRecord };
}

export function listPatsForUser(uid: string): Array<Omit<PatRecord, 'tokenHash'>> {
  const pats = readJsonFile<PatRecord[]>(PAT_FILE, []);
  return pats
    .filter((p) => p.uid === uid)
    .map(({ tokenHash: _hidden, ...rest }) => rest);
}

export function revokePat(uid: string, tokenId: string): boolean {
  const pats = readJsonFile<PatRecord[]>(PAT_FILE, []);
  const next = pats.filter((p) => !(p.uid === uid && p.id === tokenId));
  if (next.length === pats.length) return false;
  writeJsonFile(PAT_FILE, next);
  return true;
}

export function verifyPat(rawToken: string): PatRecord | null {
  if (!rawToken || !rawToken.startsWith('soul_pat_')) return null;
  const candidateHash = hashToken(rawToken);
  const pats = readJsonFile<PatRecord[]>(PAT_FILE, []);
  const match = pats.find((p) => {
    const a = Buffer.from(p.tokenHash, 'hex');
    const b = Buffer.from(candidateHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  if (!match) return null;
  match.lastUsedAt = new Date().toISOString();
  writeJsonFile(PAT_FILE, pats);
  return match;
}

export function getAllManifestEntries(): Record<string, RepoManifestEntry> {
  return readJsonFile<Record<string, RepoManifestEntry>>(MANIFEST_FILE, {});
}

export function getRepoManifest(ownerUsername: string, slug: string): RepoManifestEntry | null {
  const all = getAllManifestEntries();
  return all[`${ownerUsername}/${slug}`] ?? null;
}

export function upsertRepoManifest(entry: RepoManifestEntry): void {
  const all = getAllManifestEntries();
  all[`${entry.ownerUsername}/${entry.slug}`] = entry;
  writeJsonFile(MANIFEST_FILE, all);
}

export function deleteRepoManifest(ownerUsername: string, slug: string): void {
  const all = getAllManifestEntries();
  delete all[`${ownerUsername}/${slug}`];
  writeJsonFile(MANIFEST_FILE, all);
}

export function canUserReadRepo(entry: RepoManifestEntry | null, uid: string | null): boolean {
  if (!entry) return false;
  if (entry.visibility === 'public') return true;
  if (!uid) return false;
  return entry.ownerId === uid || entry.memberIds.includes(uid);
}

export function canUserWriteRepo(entry: RepoManifestEntry | null, uid: string | null): boolean {
  if (!entry || !uid) return false;
  return entry.ownerId === uid || entry.memberIds.includes(uid);
}

export function getGitRepoDiskPath(ownerUsername: string, slug: string): string | null {
  const base = path.join(DATA_DIR, 'git-repos');
  return resolveConfinedPath(base, ownerUsername, `${slug}.git`);
}

export function getDataDir(): string {
  return DATA_DIR;
}
