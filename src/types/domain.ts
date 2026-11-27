export interface PublicProfile {
  uid: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  website?: string;
  company?: string;
  location?: string;
  statusText?: string;
  socialLinks?: string[];
  pinnedRepoIds?: string[];
  profileReadme?: string;
  isPrivateProfile: boolean;
  followersCount: number;
  followingCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PrivateUser {
  uid: string;
  email: string;
  blockedUserIds?: string[];
  mutedUserIds?: string[];
  emailNotifications?: boolean;
  securityAlerts?: boolean;
  themePreference?: 'dark' | 'light';
  storageUsedBytes: number;
  quotaLimitBytes: number;
  isSuspended?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RepositoryDoc {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  slug: string;
  fullName: string;
  description?: string;
  visibility: 'public' | 'private';
  defaultBranch: string;
  topics?: string[];
  website?: string;
  license?: string;
  primaryLanguage?: string;
  isArchived: boolean;
  isTemplate?: boolean;
  starsCount: number;
  forksCount: number;
  watchersCount: number;
  openIssuesCount: number;
  sizeBytes?: number;
  forkedFrom?: string;
  orgId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  isShowcase?: boolean;
  liveUrl?: string;
}

export interface IssueDoc {
  id: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  number: number;
  title: string;
  body?: string;
  status: 'open' | 'closed';
  authorId: string;
  authorUsername: string;
  labels?: string[];
  assigneeIds?: string[];
  milestone?: string;
  dueDate?: string;
  commentsCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PullRequestDoc {
  id: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  number: number;
  title: string;
  body?: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'open' | 'draft' | 'merged' | 'closed';
  authorId: string;
  authorUsername: string;
  reviewerIds?: string[];
  approvalsCount: number;
  mergeMethod?: 'merge' | 'squash' | 'rebase' | 'none';
  mergedCommitSha?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProjectTaskDoc {
  id: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  title: string;
  description?: string;
  column: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  authorId: string;
  assigneeUsername?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DiscussionDoc {
  id: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  title: string;
  body: string;
  category: 'general' | 'q_and_a' | 'ideas' | 'announcements';
  authorId: string;
  authorUsername: string;
  isAnswered: boolean;
  upvotesCount: number;
  commentsCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReleaseDoc {
  id: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  tagName: string;
  title: string;
  body?: string;
  isDraft: boolean;
  isPrerelease: boolean;
  authorId: string;
  authorUsername: string;
  downloadsCount: number;
  createdAt?: unknown;
}

export interface PackageDoc {
  id: string;
  name: string;
  version: string;
  repoId: string;
  ownerId: string;
  ownerUsername: string;
  description?: string;
  visibility: 'public' | 'private';
  downloadsCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrganizationDoc {
  id: string;
  slug: string;
  name: string;
  description?: string;
  readme?: string;
  avatarUrl?: string;
  website?: string;
  location?: string;
  ownerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeploymentDoc {
  id: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  branch: string;
  outputDir: string;
  commitSha: string;
  status: 'live' | 'failed' | 'rolled_back';
  url: string;
  buildLogs?: string;
  authorId: string;
  createdAt?: unknown;
}

export interface WorkflowRunDoc {
  id: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  workflowName: string;
  trigger: 'push' | 'pull_request' | 'manual' | 'schedule';
  branch: string;
  status: 'configured' | 'queued_external_runner' | 'cancelled';
  summary?: string;
  authorId: string;
  createdAt?: unknown;
}

export interface NotificationDoc {
  id: string;
  userId: string;
  type: 'follow' | 'star' | 'fork' | 'mention' | 'issue' | 'pr_review' | 'merge' | 'release' | 'org_invite' | 'security';
  title: string;
  message?: string;
  link?: string;
  isRead: boolean;
  actorId: string;
  createdAt?: unknown;
}

export interface ActivityEventDoc {
  id: string;
  actorId: string;
  actorUsername: string;
  type: 'repo_created' | 'commit_pushed' | 'issue_opened' | 'pr_merged' | 'release_published' | 'repo_starred' | 'repo_deployed';
  repoId?: string;
  repoFullName?: string;
  summary: string;
  visibility: 'public' | 'private';
  createdAt?: unknown;
}

export interface PlatformConfigDoc {
  maintenanceMode: boolean;
  announcementBanner?: string;
  maxRepoSizeMb: number;
  maxUserStorageMb: number;
  updatedAt?: unknown;
}

export interface CommentDoc {
  id: string;
  parentId: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  authorId: string;
  authorUsername: string;
  body: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReviewDoc {
  id: string;
  prId: string;
  repoId: string;
  repoVisibility: 'public' | 'private';
  repoOwnerId: string;
  reviewerId: string;
  reviewerUsername: string;
  state: 'approved' | 'changes_requested' | 'commented';
  body?: string;
  filePath?: string;
  lineNumber?: number;
  resolved: boolean;
  createdAt?: unknown;
}

export interface OrgMemberDoc {
  orgId: string;
  uid: string;
  username: string;
  role: 'owner' | 'admin' | 'maintainer' | 'developer' | 'member' | 'read';
  createdAt?: unknown;
}

export interface OrgTeamDoc {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  permission: 'read' | 'write' | 'admin';
  createdAt?: unknown;
}

export interface ReportDoc {
  id: string;
  reporterId: string;
  targetType: 'repository' | 'user' | 'issue' | 'discussion' | 'security_advisory';
  targetId: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt?: unknown;
}

export interface AuditLogDoc {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: string;
  createdAt?: unknown;
}
