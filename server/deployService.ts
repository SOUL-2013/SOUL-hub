import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getDataDir, getGitRepoDiskPath } from './patService.ts';
import { isValidSafeSegment, resolveConfinedPath, sanitizeOutputDirectory } from './gitValidation.ts';

const execFileAsync = promisify(execFile);
const DEPLOY_DIR = path.join(getDataDir(), 'deployments');

export interface DeploymentBuildResult {
  deploymentId: string;
  commitSha: string;
  url: string;
  previewUrl: string;
  filesCount: number;
  totalBytes: number;
  buildLogs: string;
  status: 'live' | 'failed';
}

const BLOCKED_STATIC_EXTS = new Set(['.sh', '.exe', '.dll', '.so', '.php', '.py', '.rb']);

function copyStaticDirectory(srcDir: string, dstDir: string, stats: { count: number; bytes: number }): void {
  fs.mkdirSync(dstDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyStaticDirectory(srcPath, dstPath, stats);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (BLOCKED_STATIC_EXTS.has(ext)) continue;
      const stat = fs.statSync(srcPath);
      if (stats.bytes + stat.size > 20 * 1024 * 1024) {
        throw new Error('Static deployment exceeds 20 MB bundle quota.');
      }
      fs.copyFileSync(srcPath, dstPath);
      stats.count += 1;
      stats.bytes += stat.size;
    }
  }
}

export async function deployStaticSiteFromGit(
  owner: string,
  repo: string,
  branch: string,
  rawOutputDir: string
): Promise<DeploymentBuildResult> {
  if (!isValidSafeSegment(owner) || !isValidSafeSegment(repo)) {
    throw new Error('Invalid repository identifier.');
  }
  const repoGitDir = getGitRepoDiskPath(owner, repo);
  if (!repoGitDir || !fs.existsSync(repoGitDir)) {
    throw new Error('Git repository does not exist on server.');
  }
  const outputDir = sanitizeOutputDirectory(rawOutputDir);
  if (!outputDir) {
    throw new Error('Invalid output directory path.');
  }

  const deploymentId = `dep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const logs: string[] = [];
  logs.push(`[${new Date().toISOString()}] Starting static deployment ${deploymentId} for ${owner}/${repo}@${branch}`);

  const tempWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'soulhub-deploy-'));
  try {
    const { stdout: shaOut } = await execFileAsync('git', ['--git-dir', repoGitDir, 'rev-parse', `refs/heads/${branch}`]);
    const commitSha = shaOut.trim();
    logs.push(`Resolved branch ${branch} -> ${commitSha.slice(0, 12)}`);

    const tarPath = path.join(tempWorktree, 'bundle.tar');
    await execFileAsync('git', ['--git-dir', repoGitDir, 'archive', '--format=tar', '-o', tarPath, commitSha]);
    const extractDir = path.join(tempWorktree, 'src');
    fs.mkdirSync(extractDir, { recursive: true });
    await execFileAsync('tar', ['-xf', tarPath, '-C', extractDir]);

    let effectiveOutputDir = outputDir;
    let sourceOutputPath = outputDir === '.' ? extractDir : resolveConfinedPath(extractDir, outputDir);
    if (outputDir === '.' && sourceOutputPath) {
      const rootIndex = path.join(extractDir, 'index.html');
      const distDir = path.join(extractDir, 'dist');
      const distIndex = path.join(distDir, 'index.html');
      if (fs.existsSync(distIndex)) {
        const rootHtml = fs.existsSync(rootIndex) ? fs.readFileSync(rootIndex, 'utf8') : '';
        if (!rootHtml || /\/src\/main\.(tsx?|jsx?)/.test(rootHtml)) {
          sourceOutputPath = distDir;
          effectiveOutputDir = 'dist';
          logs.push('Detected Vite source root with prebuilt dist/ bundle; publishing dist/ static assets.');
        }
      }
    }

    if (!sourceOutputPath || !fs.existsSync(sourceOutputPath)) {
      logs.push(`ERROR: Output directory "${effectiveOutputDir}" not found in commit ${commitSha.slice(0, 12)}.`);
      return {
        deploymentId,
        commitSha,
        url: `/sites/${owner}/${repo}/`,
        previewUrl: `/sites/${owner}/${repo}/preview/${deploymentId}/`,
        filesCount: 0,
        totalBytes: 0,
        buildLogs: logs.join('\n'),
        status: 'failed',
      };
    }

    const siteRoot = resolveConfinedPath(DEPLOY_DIR, owner, repo);
    if (!siteRoot) throw new Error('Invalid deployment storage path.');
    const targetDir = resolveConfinedPath(siteRoot, 'releases', deploymentId);
    if (!targetDir) throw new Error('Invalid release path.');

    const stats = { count: 0, bytes: 0 };
    copyStaticDirectory(sourceOutputPath, targetDir, stats);

    // Rewrite root-relative asset URLs inside HTML files when those files exist in targetDir
    // so Vite/React dist builds work cleanly under /sites/:owner/:repo/ without white-screening.
    const rewriteHtmlDir = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          rewriteHtmlDir(full);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
          const html = fs.readFileSync(full, 'utf8');
          const rewritten = html.replace(
            /(src|href)=["']\/(?!\/|sites\/|api\/)([^"']+)["']/gi,
            (match, attr: string, assetPath: string) => {
              const localTarget = resolveConfinedPath(targetDir, assetPath.split('?')[0]);
              if (localTarget && fs.existsSync(localTarget)) {
                return `${attr}="./${assetPath}"`;
              }
              return match;
            }
          );
          if (rewritten !== html) {
            fs.writeFileSync(full, rewritten, 'utf8');
          }
        }
      }
    };
    rewriteHtmlDir(targetDir);

    if (stats.count === 0) {
      logs.push('ERROR: No deployable static assets found in output directory.');
      return {
        deploymentId,
        commitSha,
        url: `/sites/${owner}/${repo}/`,
        previewUrl: `/sites/${owner}/${repo}/preview/${deploymentId}/`,
        filesCount: 0,
        totalBytes: 0,
        buildLogs: logs.join('\n'),
        status: 'failed',
      };
    }

    const activeFile = path.join(siteRoot, 'active.json');
    fs.writeFileSync(
      activeFile,
      JSON.stringify({ deploymentId, commitSha, branch, outputDir: effectiveOutputDir, updatedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );

    logs.push(`Copied ${stats.count} static files (${stats.bytes} bytes) from "${effectiveOutputDir}".`);
    logs.push(`Published live at /sites/${owner}/${repo}/`);

    return {
      deploymentId,
      commitSha,
      url: `/sites/${owner}/${repo}/`,
      previewUrl: `/sites/${owner}/${repo}/preview/${deploymentId}/`,
      filesCount: stats.count,
      totalBytes: stats.bytes,
      buildLogs: logs.join('\n'),
      status: 'live',
    };
  } finally {
    fs.rmSync(tempWorktree, { recursive: true, force: true });
  }
}

export function rollbackDeployment(owner: string, repo: string, deploymentId: string): boolean {
  if (!isValidSafeSegment(owner) || !isValidSafeSegment(repo) || !isValidSafeSegment(deploymentId)) {
    return false;
  }
  const siteRoot = resolveConfinedPath(DEPLOY_DIR, owner, repo);
  if (!siteRoot) return false;
  const releaseDir = resolveConfinedPath(siteRoot, 'releases', deploymentId);
  if (!releaseDir || !fs.existsSync(releaseDir)) return false;
  const activeFile = path.join(siteRoot, 'active.json');
  fs.writeFileSync(
    activeFile,
    JSON.stringify({ deploymentId, updatedAt: new Date().toISOString(), rolledBack: true }, null, 2),
    'utf8'
  );
  return true;
}

export function resolveDeployedSiteFile(
  owner: string,
  repo: string,
  reqPath: string,
  previewDeploymentId?: string
): string | null {
  if (!isValidSafeSegment(owner) || !isValidSafeSegment(repo)) return null;
  const siteRoot = resolveConfinedPath(DEPLOY_DIR, owner, repo);
  if (!siteRoot) return null;

  let deploymentId = previewDeploymentId;
  if (!deploymentId) {
    const activeFile = path.join(siteRoot, 'active.json');
    if (!fs.existsSync(activeFile)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(activeFile, 'utf8')) as { deploymentId?: string };
      deploymentId = parsed.deploymentId;
    } catch {
      return null;
    }
  }
  if (!deploymentId || !isValidSafeSegment(deploymentId)) return null;

  const releaseDir = resolveConfinedPath(siteRoot, 'releases', deploymentId);
  if (!releaseDir || !fs.existsSync(releaseDir)) return null;

  const cleanSub = reqPath.replace(/^\/+/, '') || 'index.html';
  const candidate = resolveConfinedPath(releaseDir, cleanSub);
  if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  const indexCandidate = resolveConfinedPath(releaseDir, cleanSub, 'index.html');
  if (indexCandidate && fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
    return indexCandidate;
  }
  const rootFallback = path.join(releaseDir, 'index.html');
  if ((cleanSub === 'index.html' || !path.extname(cleanSub)) && fs.existsSync(rootFallback)) {
    return rootFallback;
  }
  return null;
}
