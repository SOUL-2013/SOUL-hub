import { auth } from './firebase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...authHeaders,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
      if (contentType.includes('text/html') || text.trimStart().startsWith('<')) {
        throw new Error('Backend API server is not running for this route.');
      }
    }
  }
  if (!res.ok) {
    throw new Error((data.error as string | undefined) || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface GitTreeEntry {
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

export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  parents: string[];
}

export interface GitBranchInfo {
  name: string;
  sha: string;
  updatedAt: string;
  authorName: string;
  message: string;
}

export interface GitTagInfo {
  name: string;
  sha: string;
  date: string;
  message: string;
}

export interface ShowcaseRepoResponse {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  slug: string;
  fullName: string;
  description: string;
  visibility: 'public';
  defaultBranch: string;
  topics: string[];
  license: string;
  primaryLanguage: string;
  starsCount: number;
  forksCount: number;
  watchersCount: number;
  openIssuesCount: number;
  liveUrl?: string;
  branchesCount: number;
  latestCommit: GitCommitInfo | null;
  totalBytes: number;
  languages: Array<{ language: string; bytes: number; percentage: number }>;
}

export const gitApi = {
  getShowcase: () => apiRequest<{ repositories: ShowcaseRepoResponse[] }>('/api/public/showcase'),
  initRepo: (payload: {
    repoId: string;
    ownerUsername: string;
    name: string;
    slug: string;
    description: string;
    visibility: 'public' | 'private';
    defaultBranch: string;
    initReadme: boolean;
    gitignoreTemplate: string;
    licenseTemplate: string;
    topics: string[];
  }) => apiRequest<{ initialized: boolean; commitSha: string | null }>('/api/git/repos/init', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  forkRepo: (payload: {
    srcOwner: string;
    srcRepo: string;
    dstOwner: string;
    dstRepo: string;
    dstRepoId: string;
  }) => apiRequest<{ forked: boolean; fullName: string }>('/api/git/repos/fork', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateManifest: (owner: string, repo: string, payload: Record<string, unknown>) =>
    apiRequest<{ updated: boolean }>(`/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/manifest`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteRepo: (owner: string, repo: string) =>
    apiRequest<{ deleted: boolean }>(`/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      method: 'DELETE',
    }),
  getSummary: (owner: string, repo: string, ref: string) =>
    apiRequest<{
      manifest: { protectedBranches: string[]; defaultBranch: string; visibility: 'public' | 'private' };
      branches: GitBranchInfo[];
      tags: GitTagInfo[];
      commits: GitCommitInfo[];
      langStats: { totalBytes: number; languages: Array<{ language: string; bytes: number; percentage: number }> };
      entries: GitTreeEntry[];
    }>(`/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/summary?ref=${encodeURIComponent(ref)}`),
  getTree: (owner: string, repo: string, ref: string, path = '') =>
    apiRequest<{ entries: GitTreeEntry[]; totalFiles: number }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`
    ),
  getAllFiles: (owner: string, repo: string, ref: string) =>
    apiRequest<{ files: Array<{ path: string; size: number }> }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/files?ref=${encodeURIComponent(ref)}`
    ),
  getBlob: (owner: string, repo: string, ref: string, path: string) =>
    apiRequest<{ path: string; size: number; isBinary: boolean; text: string | null; base64: string | null }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`
    ),
  getBlame: (owner: string, repo: string, ref: string, path: string) =>
    apiRequest<{ blame: Array<{ lineNumber: number; sha: string; author: string; date: string; content: string }> }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blame?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`
    ),
  getCommits: (owner: string, repo: string, ref: string, path?: string) =>
    apiRequest<{ commits: GitCommitInfo[] }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?ref=${encodeURIComponent(ref)}${path ? `&path=${encodeURIComponent(path)}` : ''}`
    ),
  getCommitDetail: (owner: string, repo: string, sha: string) =>
    apiRequest<{ commit: GitCommitInfo; stats: string; patch: string }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit/${encodeURIComponent(sha)}`
    ),
  commitFiles: (
    owner: string,
    repo: string,
    payload: {
      branch: string;
      message: string;
      files: Array<{ action: 'upsert' | 'delete' | 'rename'; path: string; oldPath?: string; contentBase64?: string }>;
    }
  ) =>
    apiRequest<{ commitSha: string; changedFiles: number }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  createBranch: (owner: string, repo: string, name: string, fromRef: string) =>
    apiRequest<{ branch: GitBranchInfo }>(`/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`, {
      method: 'POST',
      body: JSON.stringify({ name, fromRef }),
    }),
  deleteBranch: (owner: string, repo: string, branch: string) =>
    apiRequest<{ deleted: boolean }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
      { method: 'DELETE' }
    ),
  createTag: (owner: string, repo: string, name: string, targetRef: string, message: string) =>
    apiRequest<{ tag: GitTagInfo }>(`/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name, targetRef, message }),
    }),
  deleteTag: (owner: string, repo: string, tag: string) =>
    apiRequest<{ deleted: boolean }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags/${encodeURIComponent(tag)}`,
      { method: 'DELETE' }
    ),
  compare: (owner: string, repo: string, base: string, head: string) =>
    apiRequest<{
      commits: GitCommitInfo[];
      diff: string;
      filesChanged: Array<{ path: string; additions: number; deletions: number }>;
      hasConflicts: boolean;
    }>(`/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`),
  merge: (owner: string, repo: string, payload: { baseBranch: string; headBranch: string; method: 'merge' | 'squash' | 'rebase'; message: string }) =>
    apiRequest<{ merged: boolean; commitSha?: string; conflict?: boolean; error?: string }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/merge`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  searchInRepo: (owner: string, repo: string, ref: string, q: string) =>
    apiRequest<{ matches: Array<{ path: string; lineNumber: number; text: string }> }>(
      `/api/git/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/search?ref=${encodeURIComponent(ref)}&q=${encodeURIComponent(q)}`
    ),
  globalCodeSearch: (q: string) =>
    apiRequest<{ results: Array<{ fullName: string; path: string; lineNumber: number; text: string }> }>(
      `/api/search/code?q=${encodeURIComponent(q)}`
    ),
  deploySite: (owner: string, repo: string, branch: string, outputDir: string) =>
    apiRequest<{
      deploymentId: string;
      commitSha: string;
      url: string;
      previewUrl: string;
      filesCount: number;
      totalBytes: number;
      buildLogs: string;
      status: 'live' | 'failed';
    }>(`/api/deployments/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      method: 'POST',
      body: JSON.stringify({ branch, outputDir }),
    }),
  rollbackSite: (owner: string, repo: string, deploymentId: string) =>
    apiRequest<{ rolledBack: boolean; url: string }>(
      `/api/deployments/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/rollback`,
      { method: 'POST', body: JSON.stringify({ deploymentId }) }
    ),
};

export const accountApi = {
  listTokens: () =>
    apiRequest<{ tokens: Array<{ id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null }> }>('/api/tokens'),
  createToken: (name: string, username: string) =>
    apiRequest<{ rawToken: string; record: { id: string; name: string; prefix: string; scopes: string[]; createdAt: string } }>('/api/tokens', {
      method: 'POST',
      body: JSON.stringify({ name, username }),
    }),
  revokeToken: (id: string) => apiRequest<{ revoked: boolean }>(`/api/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getStorageUsage: () => apiRequest<{ usedBytes: number; quotaLimitBytes: number; maxFileBytes: number }>('/api/storage/usage'),
  uploadFile: async (file: File, bucket: string) => {
    const formData = new FormData();
    formData.append('bucket', bucket);
    formData.append('file', file);
    return apiRequest<{ object: { id: string; sizeBytes: number; originalName: string }; url: string }>('/api/storage/upload', {
      method: 'POST',
      body: formData,
    });
  },
};
