import path from 'node:path';

export function resolveConfinedPath(baseDir: string, ...segments: string[]): string | null {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, ...segments);
  if (resolvedTarget === resolvedBase || !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolvedTarget;
}

export function isValidSafeSegment(seg: string): boolean {
  return typeof seg === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(seg) && !seg.includes('..') && seg !== '.';
}

export function isAllowedUploadMime(mime: string): boolean {
  const allowedPrefixes = ['image/', 'text/'];
  const allowedExact = new Set([
    'application/pdf',
    'application/json',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'application/yaml',
    'application/x-yaml',
  ]);
  if (typeof mime !== 'string') return false;
  if (mime === 'image/svg+xml') return false; // Block raw SVG uploads to avoid stored XSS when served directly
  return allowedPrefixes.some((p) => mime.startsWith(p)) || allowedExact.has(mime);
}

export function sanitizeOutputDirectory(dir: string): string | null {
  if (!dir || dir.trim() === '' || dir.trim() === '.') return '.';
  const cleaned = dir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleaned || cleaned === '.') return '.';
  const parts = cleaned.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part === '.git') return null;
  }
  return parts.join('/');
}
