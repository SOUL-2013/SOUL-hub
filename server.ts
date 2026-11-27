import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  getGitignoreTemplate,
  getLicenseTemplate,
  isValidBranchOrTagName,
  isValidRepoSlug,
  isValidUsername,
  slugifyRepoName,
} from './src/lib/validation.ts';
import {
  deployStaticSiteFromGit,
  resolveDeployedSiteFile,
  rollbackDeployment,
} from './server/deployService.ts';
import {
  commitFiles,
  compareRefs,
  createBranch,
  createTag,
  deleteBareRepo,
  deleteBranch,
  deleteTag,
  forkBareRepo,
  getCommitDetail,
  getFileBlame,
  getLanguageStats,
  handleSmartHttpInfoRefs,
  handleSmartHttpService,
  initBareRepo,
  listAllFilePaths,
  listBranches,
  listCommits,
  listTags,
  listTree,
  mergeRefs,
  readBlob,
  repoExistsOnDisk,
  searchCodeInRepo,
  streamArchiveZip,
} from './server/gitService.ts';
import { isValidSafeSegment } from './server/gitValidation.ts';
import {
  canUserReadRepo,
  canUserWriteRepo,
  createPat,
  deleteRepoManifest,
  getAllManifestEntries,
  getRepoManifest,
  listPatsForUser,
  revokePat,
  upsertRepoManifest,
  verifyPat,
} from './server/patService.ts';
import { ensureShowcaseReposSeeded, SHOWCASE_REPOS } from './server/seedRepos.ts';
import {
  getStoredObject,
  getUserStorageUsage,
  MAX_STORAGE_FILE_BYTES,
  saveUploadedObject,
  USER_STORAGE_QUOTA_BYTES,
} from './server/storageService.ts';

const firebaseConfigPath = path.resolve('./firebase-applet-config.json');
const firebaseConfig = fs.existsSync(firebaseConfigPath)
  ? (JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8')) as { projectId?: string })
  : {};

const adminApp =
  firebaseConfig.projectId && firebaseConfig.projectId !== 'remixed-project-id'
    ? getApps().length
      ? getApp()
      : initializeApp({ projectId: firebaseConfig.projectId })
    : null;

interface AuthenticatedUser {
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

interface AuthedRequest extends Request {
  authUser?: AuthenticatedUser;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.baseUrl}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait before retrying.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

async function extractAuthUser(req: Request): Promise<AuthenticatedUser | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ') || !adminApp) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await getAuth(adminApp).verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      name: (decoded.name as string | undefined) || decoded.email?.split('@')[0] || 'Developer',
      emailVerified: Boolean(decoded.email_verified),
    };
  } catch {
    return null;
  }
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const user = await extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  if (!user.emailVerified) {
    res.status(403).json({ error: 'Verified email required for this operation.' });
    return;
  }
  req.authUser = user;
  next();
}

async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  req.authUser = (await extractAuthUser(req)) ?? undefined;
  next();
}

function parseBasicAuthPat(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) return null;
    const password = decoded.slice(colonIdx + 1);
    const username = decoded.slice(0, colonIdx);
    return password.startsWith('soul_pat_') ? password : username.startsWith('soul_pat_') ? username : null;
  } catch {
    return null;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_STORAGE_FILE_BYTES },
});

async function startServer(): Promise<void> {
  await ensureShowcaseReposSeeded();

  const app = express();
  app.set('trust proxy', 1);

  // Git Smart HTTP endpoints MUST be mounted before express.json() so raw packfile streams work!
  app.get('/git/:owner/:repoDotGit/info/refs', (req, res) => {
    const owner = String(req.params.owner || '');
    const rawRepo = String(req.params.repoDotGit || '');
    const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
    const service = String(req.query.service || '');

    if (!isValidSafeSegment(owner) || !isValidRepoSlug(repo)) {
      res.status(400).send('Invalid repository identifier.');
      return;
    }
    const manifest = getRepoManifest(owner, repo);
    if (!manifest || !repoExistsOnDisk(owner, repo)) {
      res.status(404).send('Repository not found.');
      return;
    }

    const rawPat = parseBasicAuthPat(req);
    const patRecord = rawPat ? verifyPat(rawPat) : null;
    const uid = patRecord?.uid ?? null;

    if (service === 'git-receive-pack') {
      if (!patRecord || !canUserWriteRepo(manifest, uid)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="SOUL HUB Git"');
        res.status(401).send('Personal Access Token with write permission required.');
        return;
      }
    } else if (!canUserReadRepo(manifest, uid)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="SOUL HUB Git"');
      res.status(401).send('Authentication required for private repository.');
      return;
    }

    handleSmartHttpInfoRefs(owner, repo, service, res);
  });

  app.post('/git/:owner/:repoDotGit/:service', (req, res) => {
    const owner = String(req.params.owner || '');
    const rawRepo = String(req.params.repoDotGit || '');
    const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
    const service = String(req.params.service || '');

    if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
      res.status(404).send('Unknown Git endpoint.');
      return;
    }
    if (!isValidSafeSegment(owner) || !isValidRepoSlug(repo)) {
      res.status(400).send('Invalid repository identifier.');
      return;
    }
    const manifest = getRepoManifest(owner, repo);
    if (!manifest || !repoExistsOnDisk(owner, repo)) {
      res.status(404).send('Repository not found.');
      return;
    }

    const rawPat = parseBasicAuthPat(req);
    const patRecord = rawPat ? verifyPat(rawPat) : null;
    const uid = patRecord?.uid ?? null;

    if (service === 'git-receive-pack') {
      if (!patRecord || !canUserWriteRepo(manifest, uid)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="SOUL HUB Git"');
        res.status(401).send('Write access denied.');
        return;
      }
    } else if (!canUserReadRepo(manifest, uid)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="SOUL HUB Git"');
      res.status(401).send('Read access denied.');
      return;
    }

    handleSmartHttpService(owner, repo, service, req, res);
  });

  app.use(express.json({ limit: '12mb' }));

  // -------------------------------------------------------
  // Health & Public Showcase Endpoints
  // -------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'SOUL HUB',
      vendor: 'Soumadip Orbit Universal Labs',
      gitTransport: 'smart-http',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/public/showcase', async (_req, res) => {
    const enriched = await Promise.all(
      SHOWCASE_REPOS.map(async (repo) => {
        const [branches, commits, lang] = await Promise.all([
          listBranches(repo.ownerUsername, repo.slug),
          listCommits(repo.ownerUsername, repo.slug, repo.defaultBranch, undefined, 5),
          getLanguageStats(repo.ownerUsername, repo.slug, repo.defaultBranch),
        ]);
        return {
          ...repo,
          branchesCount: branches.length,
          latestCommit: commits[0] ?? null,
          totalBytes: lang.totalBytes,
          languages: lang.languages,
        };
      })
    );
    res.json({ repositories: enriched });
  });

  // -------------------------------------------------------
  // Personal Access Tokens (PAT) API
  // -------------------------------------------------------
  app.get('/api/tokens', requireAuth, (req: AuthedRequest, res) => {
    res.json({ tokens: listPatsForUser(req.authUser!.uid) });
  });

  app.post('/api/tokens', rateLimit(20, 60_000), requireAuth, (req: AuthedRequest, res) => {
    const { name, username, scopes } = req.body as {
      name?: string;
      username?: string;
      scopes?: string[];
    };
    const safeUsername = username && isValidUsername(username) ? username : req.authUser!.uid.slice(0, 16);
    const created = createPat(
      req.authUser!.uid,
      safeUsername,
      typeof name === 'string' ? name : 'CLI Token',
      Array.isArray(scopes) ? scopes.slice(0, 5) : ['repo:read', 'repo:write']
    );
    res.status(201).json(created);
  });

  app.delete('/api/tokens/:id', requireAuth, (req: AuthedRequest, res) => {
    const ok = revokePat(req.authUser!.uid, String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Token not found.' });
      return;
    }
    res.json({ revoked: true });
  });

  // -------------------------------------------------------
  // Storage Upload & Quota API
  // -------------------------------------------------------
  app.get('/api/storage/usage', requireAuth, (req: AuthedRequest, res) => {
    const usedBytes = getUserStorageUsage(req.authUser!.uid);
    res.json({
      usedBytes,
      quotaLimitBytes: USER_STORAGE_QUOTA_BYTES,
      maxFileBytes: MAX_STORAGE_FILE_BYTES,
    });
  });

  app.post('/api/storage/upload', rateLimit(30, 60_000), requireAuth, upload.single('file'), (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }
    const bucket = String((req.body as { bucket?: string }).bucket || 'attachments');
    try {
      const record = saveUploadedObject(
        req.authUser!.uid,
        bucket,
        req.file.originalname,
        req.file.mimetype,
        req.file.buffer
      );
      res.status(201).json({
        object: record,
        url: `/api/storage/${record.bucket}/${record.id}`,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload rejected.' });
    }
  });

  app.get('/api/storage/:bucket/:id', (req, res) => {
    const found = getStoredObject(String(req.params.bucket), String(req.params.id));
    if (!found) {
      res.status(404).json({ error: 'Object not found.' });
      return;
    }
    res.setHeader('Content-Type', found.meta.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(found.filePath);
  });

  // -------------------------------------------------------
  // Git Repository Management & Plumbing API
  // -------------------------------------------------------
  app.post('/api/git/repos/init', rateLimit(20, 60_000), requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = req.body as {
        repoId?: string;
        ownerUsername?: string;
        name?: string;
        slug?: string;
        description?: string;
        visibility?: 'public' | 'private';
        defaultBranch?: string;
        initReadme?: boolean;
        gitignoreTemplate?: string;
        licenseTemplate?: string;
        topics?: string[];
      };

      const ownerUsername = String(body.ownerUsername || '').trim();
      const slug = body.slug ? String(body.slug).trim() : slugifyRepoName(String(body.name || ''));
      const defaultBranch = String(body.defaultBranch || 'main').trim();
      const visibility = body.visibility === 'private' ? 'private' : 'public';

      if (!isValidUsername(ownerUsername) || !isValidRepoSlug(slug)) {
        res.status(400).json({ error: 'Invalid owner username or repository slug.' });
        return;
      }
      if (!isValidBranchOrTagName(defaultBranch)) {
        res.status(400).json({ error: 'Invalid default branch name.' });
        return;
      }

      const initialFiles: Array<{ path: string; content: string }> = [];
      if (body.initReadme !== false) {
        initialFiles.push({
          path: 'README.md',
          content: `# ${body.name || slug}\n\n${body.description || 'Created on SOUL HUB.'}\n`,
        });
      }
      if (body.gitignoreTemplate && body.gitignoreTemplate !== 'None') {
        initialFiles.push({
          path: '.gitignore',
          content: getGitignoreTemplate(body.gitignoreTemplate),
        });
      }
      if (body.licenseTemplate && body.licenseTemplate !== 'None') {
        initialFiles.push({
          path: 'LICENSE',
          content: getLicenseTemplate(body.licenseTemplate, req.authUser!.name),
        });
      }

      const result = await initBareRepo(
        ownerUsername,
        slug,
        defaultBranch,
        initialFiles,
        req.authUser!.name,
        req.authUser!.email
      );

      upsertRepoManifest({
        repoId: body.repoId || `${ownerUsername}-${slug}`,
        ownerId: req.authUser!.uid,
        ownerUsername,
        slug,
        fullName: `${ownerUsername}/${slug}`,
        visibility,
        memberIds: [],
        protectedBranches: [defaultBranch],
        defaultBranch,
        description: String(body.description || '').slice(0, 500),
        primaryLanguage: '',
        topics: Array.isArray(body.topics) ? body.topics.slice(0, 10) : [],
        updatedAt: new Date().toISOString(),
      });

      res.status(201).json({ initialized: true, commitSha: result.commitSha, fullName: `${ownerUsername}/${slug}` });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Repository initialization failed.' });
    }
  });

  app.post('/api/git/repos/fork', rateLimit(15, 60_000), requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { srcOwner, srcRepo, dstOwner, dstRepo, dstRepoId } = req.body as {
        srcOwner: string;
        srcRepo: string;
        dstOwner: string;
        dstRepo: string;
        dstRepoId: string;
      };
      if (!isValidUsername(srcOwner) || !isValidRepoSlug(srcRepo) || !isValidUsername(dstOwner) || !isValidRepoSlug(dstRepo)) {
        res.status(400).json({ error: 'Invalid repository identifiers.' });
        return;
      }
      const srcManifest = getRepoManifest(srcOwner, srcRepo);
      if (!canUserReadRepo(srcManifest, req.authUser!.uid)) {
        res.status(403).json({ error: 'Access denied to source repository.' });
        return;
      }

      await forkBareRepo(srcOwner, srcRepo, dstOwner, dstRepo);
      upsertRepoManifest({
        repoId: dstRepoId || `${dstOwner}-${dstRepo}`,
        ownerId: req.authUser!.uid,
        ownerUsername: dstOwner,
        slug: dstRepo,
        fullName: `${dstOwner}/${dstRepo}`,
        visibility: srcManifest!.visibility,
        memberIds: [],
        protectedBranches: [srcManifest!.defaultBranch],
        defaultBranch: srcManifest!.defaultBranch,
        description: srcManifest!.description,
        primaryLanguage: srcManifest!.primaryLanguage,
        topics: srcManifest!.topics,
        updatedAt: new Date().toISOString(),
      });

      res.status(201).json({ forked: true, fullName: `${dstOwner}/${dstRepo}` });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Fork failed.' });
    }
  });

  app.patch('/api/git/:owner/:repo/manifest', requireAuth, (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!manifest) {
      res.status(404).json({ error: 'Repository manifest not found.' });
      return;
    }
    if (manifest.ownerId !== req.authUser!.uid) {
      res.status(403).json({ error: 'Only repository owner can update manifest settings.' });
      return;
    }
    const body = req.body as Partial<{
      visibility: 'public' | 'private';
      memberIds: string[];
      protectedBranches: string[];
      defaultBranch: string;
      description: string;
    }>;
    upsertRepoManifest({
      ...manifest,
      visibility: body.visibility === 'private' ? 'private' : body.visibility === 'public' ? 'public' : manifest.visibility,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.slice(0, 50) : manifest.memberIds,
      protectedBranches: Array.isArray(body.protectedBranches) ? body.protectedBranches.slice(0, 20) : manifest.protectedBranches,
      defaultBranch: typeof body.defaultBranch === 'string' && isValidBranchOrTagName(body.defaultBranch) ? body.defaultBranch : manifest.defaultBranch,
      description: typeof body.description === 'string' ? body.description.slice(0, 500) : manifest.description,
      updatedAt: new Date().toISOString(),
    });
    res.json({ updated: true });
  });

  app.delete('/api/git/:owner/:repo', requireAuth, (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!manifest) {
      res.status(404).json({ error: 'Repository not found.' });
      return;
    }
    if (manifest.ownerId !== req.authUser!.uid) {
      res.status(403).json({ error: 'Only the repository owner can delete Git storage.' });
      return;
    }
    deleteBareRepo(owner, repo);
    deleteRepoManifest(owner, repo);
    res.json({ deleted: true });
  });

  // Read-only Git inspection endpoints (enforce private repo isolation via manifest)
  app.get('/api/git/:owner/:repo/summary', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.query.ref || 'main');
    const manifest = getRepoManifest(owner, repo);
    if (!manifest || !repoExistsOnDisk(owner, repo)) {
      res.status(404).json({ error: 'Repository not found.' });
      return;
    }
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Private repository access denied.' });
      return;
    }
    try {
      const [branches, tags, commits, langStats, tree] = await Promise.all([
        listBranches(owner, repo),
        listTags(owner, repo),
        listCommits(owner, repo, ref, undefined, 15),
        getLanguageStats(owner, repo, ref),
        listTree(owner, repo, ref, ''),
      ]);
      res.json({
        manifest,
        branches,
        tags,
        commits,
        langStats,
        entries: tree.entries,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to inspect repository.' });
    }
  });

  app.get('/api/git/:owner/:repo/tree', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.query.ref || 'main');
    const subPath = String(req.query.path || '');
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    try {
      const tree = await listTree(owner, repo, ref, subPath);
      res.json(tree);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to read tree.' });
    }
  });

  app.get('/api/git/:owner/:repo/files', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.query.ref || 'main');
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const files = await listAllFilePaths(owner, repo, ref);
    res.json({ files });
  });

  app.get('/api/git/:owner/:repo/blob', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.query.ref || 'main');
    const filePath = String(req.query.path || '');
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    try {
      const blob = await readBlob(owner, repo, ref, filePath);
      res.json({
        path: filePath,
        size: blob.size,
        isBinary: blob.isBinary,
        text: blob.isBinary ? null : blob.text,
        base64: blob.isBinary && blob.size <= 2 * 1024 * 1024 ? blob.buffer.toString('base64') : null,
      });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'File not found.' });
    }
  });

  app.get('/api/git/:owner/:repo/raw', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.query.ref || 'main');
    const filePath = String(req.query.path || '');
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    try {
      const blob = await readBlob(owner, repo, ref, filePath);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', blob.isBinary ? 'application/octet-stream' : 'text/plain; charset=utf-8');
      res.send(blob.buffer);
    } catch {
      res.status(404).send('Not found');
    }
  });

  app.get('/api/git/:owner/:repo/blame', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.query.ref || 'main');
    const filePath = String(req.query.path || '');
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    try {
      const blame = await getFileBlame(owner, repo, ref, filePath);
      res.json({ blame });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Blame failed.' });
    }
  });

  app.get('/api/git/:owner/:repo/commits', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.query.ref || 'main');
    const filePath = req.query.path ? String(req.query.path) : undefined;
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const commits = await listCommits(owner, repo, ref, filePath, 50);
    res.json({ commits });
  });

  app.get('/api/git/:owner/:repo/commit/:sha', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const sha = String(req.params.sha);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    try {
      const detail = await getCommitDetail(owner, repo, sha);
      res.json(detail);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Commit not found.' });
    }
  });

  app.get('/api/git/:owner/:repo/search', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.query.ref || 'main');
    const q = String(req.query.q || '');
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const matches = await searchCodeInRepo(owner, repo, ref, q);
    res.json({ matches });
  });

  app.get('/api/git/:owner/:repo/compare', optionalAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const base = String(req.query.base || 'main');
    const head = String(req.query.head || 'main');
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    try {
      const result = await compareRefs(owner, repo, base, head);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Compare failed.' });
    }
  });

  app.get('/api/git/:owner/:repo/archive/:ref.zip', optionalAuth, (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const ref = String(req.params.ref);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserReadRepo(manifest, req.authUser?.uid ?? null)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    streamArchiveZip(owner, repo, ref, res);
  });

  // Write Git Operations
  app.post('/api/git/:owner/:repo/commit', rateLimit(40, 60_000), requireAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserWriteRepo(manifest, req.authUser!.uid)) {
      res.status(403).json({ error: 'Write access denied for this repository.' });
      return;
    }
    try {
      const { branch, message, files } = req.body as {
        branch: string;
        message: string;
        files: Array<{ action: 'upsert' | 'delete' | 'rename'; path: string; oldPath?: string; contentBase64?: string }>;
      };
      const result = await commitFiles(
        owner,
        repo,
        branch || manifest!.defaultBranch,
        message,
        files,
        req.authUser!.name,
        req.authUser!.email
      );
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Commit failed.' });
    }
  });

  app.post('/api/git/:owner/:repo/branches', requireAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserWriteRepo(manifest, req.authUser!.uid)) {
      res.status(403).json({ error: 'Write access denied.' });
      return;
    }
    try {
      const { name, fromRef } = req.body as { name: string; fromRef: string };
      const branch = await createBranch(owner, repo, name, fromRef || manifest!.defaultBranch);
      res.status(201).json({ branch });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Branch creation failed.' });
    }
  });

  app.delete('/api/git/:owner/:repo/branches/:branch', requireAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const branch = String(req.params.branch);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserWriteRepo(manifest, req.authUser!.uid)) {
      res.status(403).json({ error: 'Write access denied.' });
      return;
    }
    if (branch === manifest!.defaultBranch || manifest!.protectedBranches.includes(branch)) {
      res.status(400).json({ error: `Branch "${branch}" is protected and cannot be deleted.` });
      return;
    }
    try {
      await deleteBranch(owner, repo, branch);
      res.json({ deleted: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Branch deletion failed.' });
    }
  });

  app.post('/api/git/:owner/:repo/tags', requireAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserWriteRepo(manifest, req.authUser!.uid)) {
      res.status(403).json({ error: 'Write access denied.' });
      return;
    }
    try {
      const { name, targetRef, message } = req.body as { name: string; targetRef: string; message?: string };
      const tag = await createTag(
        owner,
        repo,
        name,
        targetRef || manifest!.defaultBranch,
        message || '',
        req.authUser!.name,
        req.authUser!.email
      );
      res.status(201).json({ tag });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Tag creation failed.' });
    }
  });

  app.delete('/api/git/:owner/:repo/tags/:tag', requireAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserWriteRepo(manifest, req.authUser!.uid)) {
      res.status(403).json({ error: 'Write access denied.' });
      return;
    }
    try {
      await deleteTag(owner, repo, String(req.params.tag));
      res.json({ deleted: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Tag deletion failed.' });
    }
  });

  app.post('/api/git/:owner/:repo/merge', requireAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserWriteRepo(manifest, req.authUser!.uid)) {
      res.status(403).json({ error: 'Write access denied.' });
      return;
    }
    try {
      const { baseBranch, headBranch, method, message } = req.body as {
        baseBranch: string;
        headBranch: string;
        method: 'merge' | 'squash' | 'rebase';
        message?: string;
      };
      const result = await mergeRefs(
        owner,
        repo,
        baseBranch,
        headBranch,
        method || 'merge',
        message || `Merge ${headBranch} into ${baseBranch}`,
        req.authUser!.name,
        req.authUser!.email
      );
      if (!result.merged) {
        res.status(409).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Merge failed.' });
    }
  });

  // Global server-side code search across readable repositories
  app.get('/api/search/code', optionalAuth, async (req: AuthedRequest, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    const all = Object.values(getAllManifestEntries());
    const readable = all.filter((m) => canUserReadRepo(m, req.authUser?.uid ?? null)).slice(0, 20);
    const results: Array<{ fullName: string; path: string; lineNumber: number; text: string }> = [];
    for (const repo of readable) {
      const matches = await searchCodeInRepo(repo.ownerUsername, repo.slug, repo.defaultBranch, q);
      for (const m of matches.slice(0, 5)) {
        results.push({ fullName: repo.fullName, ...m });
      }
    }
    res.json({ results: results.slice(0, 40) });
  });

  // -------------------------------------------------------
  // Static Website Deployment & Live Hosting
  // -------------------------------------------------------
  app.post('/api/deployments/:owner/:repo', rateLimit(15, 60_000), requireAuth, async (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserWriteRepo(manifest, req.authUser!.uid)) {
      res.status(403).json({ error: 'Write access required to deploy this repository.' });
      return;
    }
    try {
      const { branch, outputDir } = req.body as { branch?: string; outputDir?: string };
      const result = await deployStaticSiteFromGit(
        owner,
        repo,
        branch || manifest!.defaultBranch,
        outputDir || '.'
      );
      res.status(result.status === 'live' ? 201 : 400).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Deployment failed.' });
    }
  });

  app.post('/api/deployments/:owner/:repo/rollback', requireAuth, (req: AuthedRequest, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const manifest = getRepoManifest(owner, repo);
    if (!canUserWriteRepo(manifest, req.authUser!.uid)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const { deploymentId } = req.body as { deploymentId: string };
    const ok = rollbackDeployment(owner, repo, String(deploymentId || ''));
    if (!ok) {
      res.status(404).json({ error: 'Deployment snapshot not found.' });
      return;
    }
    res.json({ rolledBack: true, url: `/sites/${owner}/${repo}/` });
  });

  app.get('/sites/:owner/:repo/preview/:deployId/*', (req, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const deployId = String(req.params.deployId);
    const subPath = String((req.params as unknown as Record<string, string>)['0'] || 'index.html');
    const resolved = resolveDeployedSiteFile(owner, repo, subPath, deployId);
    if (!resolved) {
      res.status(404).send('Deployed asset not found.');
      return;
    }
    res.sendFile(resolved);
  });

  app.get('/sites/:owner/:repo/preview/:deployId', (req, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const deployId = String(req.params.deployId);
    const resolved = resolveDeployedSiteFile(owner, repo, 'index.html', deployId);
    if (!resolved) {
      res.status(404).send('Preview deployment not found.');
      return;
    }
    res.sendFile(resolved);
  });

  app.get('/sites/:owner/:repo/*', (req, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const subPath = String((req.params as unknown as Record<string, string>)['0'] || 'index.html');
    const resolved = resolveDeployedSiteFile(owner, repo, subPath);
    if (!resolved) {
      res.status(404).send('Site asset not found.');
      return;
    }
    res.sendFile(resolved);
  });

  app.get('/sites/:owner/:repo', (req, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const resolved = resolveDeployedSiteFile(owner, repo, 'index.html');
    if (!resolved) {
      res.status(404).send('No active deployment found for this repository.');
      return;
    }
    res.sendFile(resolved);
  });

  // -------------------------------------------------------
  // Vite Dev Middleware or Production Static Bundle
  // -------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve('./dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`SOUL HUB server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SOUL HUB server:', err);
  process.exit(1);
});
