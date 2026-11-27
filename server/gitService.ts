import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import type { Request, Response } from 'express';
import { detectLanguageFromFilename, isValidBranchOrTagName, sanitizeRelativeRepoPath } from '../src/lib/validation.ts';
import { resolveConfinedPath } from './gitValidation.ts';
import { getGitRepoDiskPath } from './patService.ts';

const execFileAsync = promisify(execFile);

export interface TreeEntry {
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size: number;
  name: string;
  path: string;
  language: string;
  lastCommitMessage?: string;
  lastCommitDate?: string;
  lastCommitSha?: string;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  parents: string[];
}

export interface BranchInfo {
  name: string;
  sha: string;
  updatedAt: string;
  authorName: string;
  message: string;
}

export interface TagInfo {
  name: string;
  sha: string;
  date: string;
  message: string;
}

export interface FileMutation {
  action: 'upsert' | 'delete' | 'rename';
  path: string;
  oldPath?: string;
  contentBase64?: string;
}

function getRepoDirOrThrow(owner: string, repo: string): string {
  const repoDir = getGitRepoDiskPath(owner, repo);
  if (!repoDir || !fs.existsSync(repoDir)) {
    throw new Error('Repository not found on Git storage.');
  }
  return repoDir;
}

export function repoExistsOnDisk(owner: string, repo: string): boolean {
  const repoDir = getGitRepoDiskPath(owner, repo);
  return Boolean(repoDir && fs.existsSync(repoDir));
}

export async function initBareRepo(
  owner: string,
  repo: string,
  defaultBranch: string,
  initialFiles: Array<{ path: string; content: string }>,
  authorName: string,
  authorEmail: string
): Promise<{ commitSha: string | null }> {
  if (!isValidBranchOrTagName(defaultBranch)) {
    throw new Error('Invalid default branch name.');
  }
  const repoDir = getGitRepoDiskPath(owner, repo);
  if (!repoDir) throw new Error('Invalid repository path.');
  fs.mkdirSync(path.dirname(repoDir), { recursive: true });
  if (fs.existsSync(repoDir)) {
    throw new Error('Repository already exists on disk.');
  }

  await execFileAsync('git', ['init', '--bare', `--initial-branch=${defaultBranch}`, repoDir]);
  await execFileAsync('git', ['--git-dir', repoDir, 'config', 'http.receivepack', 'true']);

  if (initialFiles.length === 0) {
    return { commitSha: null };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soulhub-init-'));
  try {
    await execFileAsync('git', ['init', `--initial-branch=${defaultBranch}`, tmpDir]);
    await execFileAsync('git', ['-C', tmpDir, 'config', 'user.name', authorName]);
    await execFileAsync('git', ['-C', tmpDir, 'config', 'user.email', authorEmail]);

    for (const file of initialFiles) {
      const cleanRel = sanitizeRelativeRepoPath(file.path);
      if (!cleanRel) continue;
      const targetPath = resolveConfinedPath(tmpDir, cleanRel);
      if (!targetPath) continue;
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, file.content, 'utf8');
    }

    await execFileAsync('git', ['-C', tmpDir, 'add', '-A']);
    await execFileAsync('git', ['-C', tmpDir, 'commit', '-m', 'Initial commit via SOUL HUB']);
    await execFileAsync('git', ['-C', tmpDir, 'push', repoDir, `HEAD:refs/heads/${defaultBranch}`]);
    const { stdout } = await execFileAsync('git', ['--git-dir', repoDir, 'rev-parse', `refs/heads/${defaultBranch}`]);
    return { commitSha: stdout.trim() };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function forkBareRepo(
  srcOwner: string,
  srcRepo: string,
  dstOwner: string,
  dstRepo: string
): Promise<void> {
  const srcDir = getRepoDirOrThrow(srcOwner, srcRepo);
  const dstDir = getGitRepoDiskPath(dstOwner, dstRepo);
  if (!dstDir) throw new Error('Invalid destination repository path.');
  if (fs.existsSync(dstDir)) throw new Error('Destination repository already exists.');
  fs.mkdirSync(path.dirname(dstDir), { recursive: true });
  await execFileAsync('git', ['clone', '--bare', srcDir, dstDir]);
  await execFileAsync('git', ['--git-dir', dstDir, 'config', 'http.receivepack', 'true']);
}

export function deleteBareRepo(owner: string, repo: string): void {
  const repoDir = getGitRepoDiskPath(owner, repo);
  if (repoDir && fs.existsSync(repoDir)) {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

export async function listBranches(owner: string, repo: string): Promise<BranchInfo[]> {
  const repoDir = getRepoDirOrThrow(owner, repo);
  try {
    const { stdout } = await execFileAsync('git', [
      '--git-dir',
      repoDir,
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname:short)%09%(objectname)%09%(committerdate:iso8601)%09%(authorname)%09%(subject)',
      'refs/heads',
    ]);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, sha, updatedAt, authorName, ...msgParts] = line.split('\t');
        return {
          name,
          sha,
          updatedAt,
          authorName,
          message: msgParts.join('\t'),
        };
      });
  } catch {
    return [];
  }
}

export async function createBranch(owner: string, repo: string, newBranch: string, fromRef: string): Promise<BranchInfo> {
  if (!isValidBranchOrTagName(newBranch) || !isValidBranchOrTagName(fromRef)) {
    throw new Error('Invalid branch reference name.');
  }
  const repoDir = getRepoDirOrThrow(owner, repo);
  const { stdout: sha } = await execFileAsync('git', ['--git-dir', repoDir, 'rev-parse', fromRef]);
  const cleanSha = sha.trim();
  await execFileAsync('git', ['--git-dir', repoDir, 'update-ref', `refs/heads/${newBranch}`, cleanSha]);
  const branches = await listBranches(owner, repo);
  const created = branches.find((b) => b.name === newBranch);
  if (!created) throw new Error('Branch creation failed.');
  return created;
}

export async function deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
  if (!isValidBranchOrTagName(branch)) throw new Error('Invalid branch name.');
  const repoDir = getRepoDirOrThrow(owner, repo);
  await execFileAsync('git', ['--git-dir', repoDir, 'update-ref', '-d', `refs/heads/${branch}`]);
}

export async function listTags(owner: string, repo: string): Promise<TagInfo[]> {
  const repoDir = getRepoDirOrThrow(owner, repo);
  try {
    const { stdout } = await execFileAsync('git', [
      '--git-dir',
      repoDir,
      'for-each-ref',
      '--sort=-creatordate',
      '--format=%(refname:short)%09%(objectname)%09%(creatordate:iso8601)%09%(subject)',
      'refs/tags',
    ]);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, sha, date, ...msgParts] = line.split('\t');
        return { name, sha, date, message: msgParts.join('\t') };
      });
  } catch {
    return [];
  }
}

export async function createTag(
  owner: string,
  repo: string,
  tagName: string,
  targetRef: string,
  message: string,
  authorName: string,
  authorEmail: string
): Promise<TagInfo> {
  if (!isValidBranchOrTagName(tagName) || !isValidBranchOrTagName(targetRef)) {
    throw new Error('Invalid tag or target reference.');
  }
  const repoDir = getRepoDirOrThrow(owner, repo);
  const { stdout: shaOut } = await execFileAsync('git', ['--git-dir', repoDir, 'rev-parse', targetRef]);
  const sha = shaOut.trim();
  await execFileAsync(
    'git',
    ['--git-dir', repoDir, 'tag', '-a', tagName, sha, '-m', message || `Release ${tagName}`],
    {
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: authorName,
        GIT_COMMITTER_EMAIL: authorEmail,
      },
    }
  );
  const tags = await listTags(owner, repo);
  return tags.find((t) => t.name === tagName) ?? { name: tagName, sha, date: new Date().toISOString(), message };
}

export async function deleteTag(owner: string, repo: string, tagName: string): Promise<void> {
  if (!isValidBranchOrTagName(tagName)) throw new Error('Invalid tag name.');
  const repoDir = getRepoDirOrThrow(owner, repo);
  await execFileAsync('git', ['--git-dir', repoDir, 'tag', '-d', tagName]);
}

export async function getLanguageStats(owner: string, repo: string, ref: string): Promise<{
  totalBytes: number;
  languages: Array<{ language: string; bytes: number; percentage: number }>;
}> {
  const repoDir = getRepoDirOrThrow(owner, repo);
  try {
    const { stdout } = await execFileAsync('git', ['--git-dir', repoDir, 'ls-tree', '-r', '-l', ref], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const counts = new Map<string, number>();
    let totalBytes = 0;
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      const tabIdx = line.indexOf('\t');
      if (tabIdx === -1) continue;
      const meta = line.slice(0, tabIdx).trim().split(/\s+/);
      const filePath = line.slice(tabIdx + 1);
      const size = Number(meta[3] || 0);
      if (!Number.isFinite(size) || size <= 0) continue;
      totalBytes += size;
      const lang = detectLanguageFromFilename(filePath);
      if (lang === 'Text' || lang === 'JSON' || lang === 'YAML' || lang === 'Markdown') continue;
      counts.set(lang, (counts.get(lang) ?? 0) + size);
    }
    const langTotal = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
    const languages = Array.from(counts.entries())
      .map(([language, bytes]) => ({
        language,
        bytes,
        percentage: Math.round((bytes / langTotal) * 1000) / 10,
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 8);
    return { totalBytes, languages };
  } catch {
    return { totalBytes: 0, languages: [] };
  }
}

export async function listTree(
  owner: string,
  repo: string,
  ref: string,
  subPath: string = ''
): Promise<{ entries: TreeEntry[]; totalFiles: number }> {
  const repoDir = getRepoDirOrThrow(owner, repo);
  if (!isValidBranchOrTagName(ref) && !/^[0-9a-f]{7,40}$/i.test(ref)) {
    throw new Error('Invalid Git ref.');
  }
  const cleanSub = subPath ? sanitizeRelativeRepoPath(subPath) : '';
  if (subPath && cleanSub === null) throw new Error('Invalid directory path.');

  const treeSpec = cleanSub ? `${ref}:${cleanSub}` : ref;
  let stdout = '';
  try {
    const res = await execFileAsync('git', ['--git-dir', repoDir, 'ls-tree', '-l', treeSpec], {
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = res.stdout;
  } catch {
    return { entries: [], totalFiles: 0 };
  }

  const rawEntries: TreeEntry[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const tabIdx = line.indexOf('\t');
    if (tabIdx === -1) continue;
    const [mode, type, sha, sizeStr] = line.slice(0, tabIdx).trim().split(/\s+/);
    const name = line.slice(tabIdx + 1);
    const fullPath = cleanSub ? `${cleanSub}/${name}` : name;
    rawEntries.push({
      mode,
      type: type === 'tree' ? 'tree' : 'blob',
      sha,
      size: sizeStr === '-' ? 0 : Number(sizeStr) || 0,
      name,
      path: fullPath,
      language: type === 'tree' ? 'Folder' : detectLanguageFromFilename(name),
    });
  }

  rawEntries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Fetch latest commit per visible entry (bounded to first 40 entries for fast O(1) response)
  await Promise.all(
    rawEntries.slice(0, 40).map(async (entry) => {
      try {
        const { stdout: logOut } = await execFileAsync('git', [
          '--git-dir',
          repoDir,
          'log',
          '-1',
          '--format=%h%x09%cI%x09%s',
          ref,
          '--',
          entry.path,
        ]);
        const [shortSha, date, ...msg] = logOut.trim().split('\t');
        if (shortSha) {
          entry.lastCommitSha = shortSha;
          entry.lastCommitDate = date;
          entry.lastCommitMessage = msg.join('\t');
        }
      } catch {
        // Ignore single entry log errors
      }
    })
  );

  return { entries: rawEntries, totalFiles: rawEntries.length };
}

export async function listAllFilePaths(owner: string, repo: string, ref: string): Promise<Array<{ path: string; size: number }>> {
  const repoDir = getRepoDirOrThrow(owner, repo);
  try {
    const { stdout } = await execFileAsync('git', ['--git-dir', repoDir, 'ls-tree', '-r', '-l', ref], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const tabIdx = line.indexOf('\t');
        const parts = line.slice(0, tabIdx).trim().split(/\s+/);
        return {
          path: line.slice(tabIdx + 1),
          size: Number(parts[3]) || 0,
        };
      });
  } catch {
    return [];
  }
}

export async function readBlob(
  owner: string,
  repo: string,
  ref: string,
  filePath: string
): Promise<{ buffer: Buffer; size: number; isBinary: boolean; text: string }> {
  const repoDir = getRepoDirOrThrow(owner, repo);
  const cleanPath = sanitizeRelativeRepoPath(filePath);
  if (!cleanPath) throw new Error('Invalid file path.');

  const { stdout } = await execFileAsync(
    'git',
    ['--git-dir', repoDir, 'cat-file', 'blob', `${ref}:${cleanPath}`],
    { encoding: 'buffer', maxBuffer: 15 * 1024 * 1024 }
  );

  const isBinary = stdout.subarray(0, 4096).includes(0);
  return {
    buffer: stdout,
    size: stdout.length,
    isBinary,
    text: isBinary ? '' : stdout.toString('utf8'),
  };
}

export async function commitFiles(
  owner: string,
  repo: string,
  branch: string,
  message: string,
  mutations: FileMutation[],
  authorName: string,
  authorEmail: string
): Promise<{ commitSha: string; changedFiles: number }> {
  if (!isValidBranchOrTagName(branch)) throw new Error('Invalid branch name.');
  if (!message || !message.trim()) throw new Error('Commit message is required.');
  if (!Array.isArray(mutations) || mutations.length === 0) throw new Error('At least one file change is required.');

  const repoDir = getRepoDirOrThrow(owner, repo);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soulhub-commit-'));
  try {
    const branches = await listBranches(owner, repo);
    const hasBranch = branches.some((b) => b.name === branch);
    if (hasBranch) {
      await execFileAsync('git', ['clone', '--branch', branch, '--single-branch', repoDir, tmpDir]);
    } else {
      await execFileAsync('git', ['init', `--initial-branch=${branch}`, tmpDir]);
      await execFileAsync('git', ['-C', tmpDir, 'remote', 'add', 'origin', repoDir]);
    }

    await execFileAsync('git', ['-C', tmpDir, 'config', 'user.name', authorName]);
    await execFileAsync('git', ['-C', tmpDir, 'config', 'user.email', authorEmail]);

    for (const mut of mutations) {
      if (mut.action === 'delete') {
        const cleanPath = sanitizeRelativeRepoPath(mut.path);
        if (!cleanPath) throw new Error(`Invalid file path: ${mut.path}`);
        const target = resolveConfinedPath(tmpDir, cleanPath);
        if (target && fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true });
        }
      } else if (mut.action === 'rename') {
        const cleanOld = sanitizeRelativeRepoPath(mut.oldPath || '');
        const cleanNew = sanitizeRelativeRepoPath(mut.path);
        if (!cleanOld || !cleanNew) throw new Error('Invalid rename paths.');
        const src = resolveConfinedPath(tmpDir, cleanOld);
        const dst = resolveConfinedPath(tmpDir, cleanNew);
        if (!src || !dst || !fs.existsSync(src)) throw new Error('Source file not found for rename.');
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.renameSync(src, dst);
      } else {
        const cleanPath = sanitizeRelativeRepoPath(mut.path);
        if (!cleanPath) throw new Error(`Invalid file path: ${mut.path}`);
        const target = resolveConfinedPath(tmpDir, cleanPath);
        if (!target) throw new Error('Path escaped working tree.');
        const contentBuf = Buffer.from(mut.contentBase64 || '', 'base64');
        if (contentBuf.length > 5 * 1024 * 1024) {
          throw new Error(`File ${cleanPath} exceeds 5 MB limit.`);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, contentBuf);
      }
    }

    await execFileAsync('git', ['-C', tmpDir, 'add', '-A']);
    const { stdout: statusOut } = await execFileAsync('git', ['-C', tmpDir, 'status', '--porcelain']);
    if (!statusOut.trim()) {
      throw new Error('No changes detected to commit.');
    }
    const changedFiles = statusOut.trim().split('\n').length;
    await execFileAsync('git', ['-C', tmpDir, 'commit', '-m', message.trim().slice(0, 500)]);
    await execFileAsync('git', ['-C', tmpDir, 'push', repoDir, `HEAD:refs/heads/${branch}`]);
    const { stdout: shaOut } = await execFileAsync('git', ['--git-dir', repoDir, 'rev-parse', `refs/heads/${branch}`]);
    return { commitSha: shaOut.trim(), changedFiles };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function listCommits(
  owner: string,
  repo: string,
  ref: string,
  filePath?: string,
  limit: number = 40
): Promise<CommitInfo[]> {
  const repoDir = getRepoDirOrThrow(owner, repo);
  const args = [
    '--git-dir',
    repoDir,
    'log',
    `-${Math.min(Math.max(1, limit), 100)}`,
    '--format=%H%x09%h%x09%an%x09%ae%x09%aI%x09%P%x09%s',
    ref,
  ];
  if (filePath) {
    const clean = sanitizeRelativeRepoPath(filePath);
    if (clean) args.push('--follow', '--', clean);
  }
  try {
    const { stdout } = await execFileAsync('git', args);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, authorName, authorEmail, date, parentsStr, ...msg] = line.split('\t');
        return {
          sha,
          shortSha,
          authorName,
          authorEmail,
          date,
          parents: parentsStr ? parentsStr.split(' ').filter(Boolean) : [],
          message: msg.join('\t'),
        };
      });
  } catch {
    return [];
  }
}

export async function getCommitDetail(
  owner: string,
  repo: string,
  sha: string
): Promise<{ commit: CommitInfo; patch: string; stats: string }> {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error('Invalid commit SHA.');
  const repoDir = getRepoDirOrThrow(owner, repo);
  const { stdout: headerOut } = await execFileAsync('git', [
    '--git-dir',
    repoDir,
    'show',
    '-s',
    '--format=%H%x09%h%x09%an%x09%ae%x09%aI%x09%P%x09%B',
    sha,
  ]);
  const [fullSha, shortSha, authorName, authorEmail, date, parentsStr, ...msg] = headerOut.trim().split('\t');
  const { stdout: stats } = await execFileAsync('git', ['--git-dir', repoDir, 'show', '--stat', '--format=', sha]);
  const { stdout: patch } = await execFileAsync('git', ['--git-dir', repoDir, 'show', '--patch', '--format=', sha], {
    maxBuffer: 5 * 1024 * 1024,
  });
  return {
    commit: {
      sha: fullSha,
      shortSha,
      authorName,
      authorEmail,
      date,
      parents: parentsStr ? parentsStr.split(' ').filter(Boolean) : [],
      message: msg.join('\t').trim(),
    },
    stats,
    patch,
  };
}

export async function getFileBlame(
  owner: string,
  repo: string,
  ref: string,
  filePath: string
): Promise<Array<{ lineNumber: number; sha: string; author: string; date: string; content: string }>> {
  const repoDir = getRepoDirOrThrow(owner, repo);
  const clean = sanitizeRelativeRepoPath(filePath);
  if (!clean) throw new Error('Invalid file path.');

  const { stdout } = await execFileAsync('git', ['--git-dir', repoDir, 'blame', '-l', '-t', '--line-porcelain', ref, '--', clean], {
    maxBuffer: 5 * 1024 * 1024,
  });

  const lines = stdout.split('\n');
  const result: Array<{ lineNumber: number; sha: string; author: string; date: string; content: string }> = [];
  let currentSha = '';
  let currentAuthor = '';
  let currentDate = '';
  let currentLine = 0;

  for (const line of lines) {
    if (/^[0-9a-f]{40}\s+\d+\s+\d+/.test(line)) {
      const parts = line.split(' ');
      currentSha = parts[0].slice(0, 8);
      currentLine = Number(parts[2]);
    } else if (line.startsWith('author ')) {
      currentAuthor = line.slice(7);
    } else if (line.startsWith('author-time ')) {
      const ts = Number(line.slice(12));
      currentDate = Number.isFinite(ts) ? new Date(ts * 1000).toISOString().slice(0, 10) : '';
    } else if (line.startsWith('\t')) {
      result.push({
        lineNumber: currentLine,
        sha: currentSha,
        author: currentAuthor,
        date: currentDate,
        content: line.slice(1),
      });
    }
  }
  return result;
}

export async function searchCodeInRepo(
  owner: string,
  repo: string,
  ref: string,
  query: string
): Promise<Array<{ path: string; lineNumber: number; text: string }>> {
  if (!query || query.trim().length < 2) return [];
  const repoDir = getRepoDirOrThrow(owner, repo);
  try {
    const { stdout } = await execFileAsync('git', [
      '--git-dir',
      repoDir,
      'grep',
      '-n',
      '-I',
      '-F',
      '-i',
      '--max-count',
      '5',
      query.trim(),
      ref,
    ]);
    return stdout
      .split('\n')
      .filter(Boolean)
      .slice(0, 60)
      .map((line) => {
        const firstColon = line.indexOf(':');
        const secondColon = line.indexOf(':', firstColon + 1);
        const thirdColon = line.indexOf(':', secondColon + 1);
        return {
          path: line.slice(firstColon + 1, secondColon),
          lineNumber: Number(line.slice(secondColon + 1, thirdColon)) || 1,
          text: line.slice(thirdColon + 1).trim().slice(0, 200),
        };
      });
  } catch {
    return [];
  }
}

export async function compareRefs(
  owner: string,
  repo: string,
  baseRef: string,
  headRef: string
): Promise<{
  commits: CommitInfo[];
  diff: string;
  filesChanged: Array<{ path: string; additions: number; deletions: number }>;
  hasConflicts: boolean;
}> {
  if (!isValidBranchOrTagName(baseRef) || !isValidBranchOrTagName(headRef)) {
    throw new Error('Invalid branch comparison refs.');
  }
  const repoDir = getRepoDirOrThrow(owner, repo);
  const { stdout: logOut } = await execFileAsync('git', [
    '--git-dir',
    repoDir,
    'log',
    '--format=%H%x09%h%x09%an%x09%ae%x09%aI%x09%P%x09%s',
    `${baseRef}..${headRef}`,
  ]);
  const commits = logOut
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, authorName, authorEmail, date, parentsStr, ...msg] = line.split('\t');
      return {
        sha,
        shortSha,
        authorName,
        authorEmail,
        date,
        parents: parentsStr ? parentsStr.split(' ').filter(Boolean) : [],
        message: msg.join('\t'),
      };
    });

  const { stdout: numstatOut } = await execFileAsync('git', ['--git-dir', repoDir, 'diff', '--numstat', `${baseRef}...${headRef}`]);
  const filesChanged = numstatOut
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [add, del, ...fileParts] = line.split('\t');
      return {
        path: fileParts.join('\t'),
        additions: Number(add) || 0,
        deletions: Number(del) || 0,
      };
    });

  const { stdout: diff } = await execFileAsync('git', ['--git-dir', repoDir, 'diff', `${baseRef}...${headRef}`], {
    maxBuffer: 5 * 1024 * 1024,
  });

  let hasConflicts = false;
  try {
    const { stdout: mergeBaseOut } = await execFileAsync('git', ['--git-dir', repoDir, 'merge-base', baseRef, headRef]);
    const mergeBase = mergeBaseOut.trim();
    if (mergeBase) {
      const { stdout: treeOut } = await execFileAsync('git', ['--git-dir', repoDir, 'merge-tree', mergeBase, baseRef, headRef]);
      hasConflicts = treeOut.includes('<<<<<<<') || treeOut.includes('changed in both');
    }
  } catch {
    hasConflicts = false;
  }

  return { commits, diff, filesChanged, hasConflicts };
}

export async function mergeRefs(
  owner: string,
  repo: string,
  baseBranch: string,
  headBranch: string,
  method: 'merge' | 'squash' | 'rebase',
  message: string,
  authorName: string,
  authorEmail: string
): Promise<{ merged: boolean; commitSha?: string; conflict?: boolean; error?: string }> {
  if (!isValidBranchOrTagName(baseBranch) || !isValidBranchOrTagName(headBranch)) {
    throw new Error('Invalid branch names.');
  }
  const repoDir = getRepoDirOrThrow(owner, repo);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soulhub-merge-'));
  try {
    await execFileAsync('git', ['clone', repoDir, tmpDir]);
    await execFileAsync('git', ['-C', tmpDir, 'config', 'user.name', authorName]);
    await execFileAsync('git', ['-C', tmpDir, 'config', 'user.email', authorEmail]);
    await execFileAsync('git', ['-C', tmpDir, 'checkout', baseBranch]);

    try {
      if (method === 'squash') {
        await execFileAsync('git', ['-C', tmpDir, 'merge', '--squash', `origin/${headBranch}`]);
        await execFileAsync('git', ['-C', tmpDir, 'commit', '-m', message || `Squash merge ${headBranch} into ${baseBranch}`]);
      } else if (method === 'rebase') {
        await execFileAsync('git', ['-C', tmpDir, 'checkout', headBranch]);
        await execFileAsync('git', ['-C', tmpDir, 'rebase', `origin/${baseBranch}`]);
        await execFileAsync('git', ['-C', tmpDir, 'checkout', baseBranch]);
        await execFileAsync('git', ['-C', tmpDir, 'merge', '--ff-only', headBranch]);
      } else {
        await execFileAsync('git', [
          '-C',
          tmpDir,
          'merge',
          '--no-ff',
          `origin/${headBranch}`,
          '-m',
          message || `Merge pull request from ${headBranch}`,
        ]);
      }
    } catch (err) {
      return {
        merged: false,
        conflict: true,
        error: err instanceof Error ? err.message : 'Merge conflict detected between branches.',
      };
    }

    await execFileAsync('git', ['-C', tmpDir, 'push', repoDir, `HEAD:refs/heads/${baseBranch}`]);
    const { stdout: shaOut } = await execFileAsync('git', ['--git-dir', repoDir, 'rev-parse', `refs/heads/${baseBranch}`]);
    return { merged: true, commitSha: shaOut.trim() };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function streamArchiveZip(owner: string, repo: string, ref: string, res: Response): void {
  if (!isValidBranchOrTagName(ref) && !/^[0-9a-f]{7,40}$/i.test(ref)) {
    res.status(400).json({ error: 'Invalid ref.' });
    return;
  }
  const repoDir = getRepoDirOrThrow(owner, repo);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${repo}-${ref}.zip"`);
  const proc = spawn('git', ['--git-dir', repoDir, 'archive', '--format=zip', ref]);
  proc.stdout.pipe(res);
  proc.on('error', () => {
    if (!res.headersSent) res.status(500).end();
  });
}

export function handleSmartHttpInfoRefs(owner: string, repo: string, service: string, res: Response): void {
  if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
    res.status(400).send('Unsupported Git service.');
    return;
  }
  const repoDir = getRepoDirOrThrow(owner, repo);
  const subCmd = service === 'git-upload-pack' ? 'upload-pack' : 'receive-pack';
  res.status(200);
  res.setHeader('Content-Type', `application/x-${service}-advertisement`);
  res.setHeader('Cache-Control', 'no-cache');

  const headerLine = `# service=${service}\n`;
  const pktLen = (headerLine.length + 4).toString(16).padStart(4, '0');
  res.write(`${pktLen}${headerLine}0000`);

  const proc = spawn('git', [subCmd, '--stateless-rpc', '--advertise-refs', repoDir]);
  proc.stdout.pipe(res);
  proc.stderr.on('data', (d) => console.error('git-http stderr:', String(d)));
  proc.on('close', () => res.end());
}

export function handleSmartHttpService(owner: string, repo: string, service: 'git-upload-pack' | 'git-receive-pack', req: Request, res: Response): void {
  const repoDir = getRepoDirOrThrow(owner, repo);
  const subCmd = service === 'git-upload-pack' ? 'upload-pack' : 'receive-pack';
  res.status(200);
  res.setHeader('Content-Type', `application/x-${service}-result`);
  res.setHeader('Cache-Control', 'no-cache');

  const proc = spawn('git', [subCmd, '--stateless-rpc', repoDir]);
  const encoding = (req.headers['content-encoding'] || '').toLowerCase();
  if (encoding === 'gzip') {
    req.pipe(zlib.createGunzip()).pipe(proc.stdin);
  } else {
    req.pipe(proc.stdin);
  }
  proc.stdout.pipe(res);
  proc.stderr.on('data', (d) => console.error('git-http service stderr:', String(d)));
  proc.on('close', () => res.end());
}
