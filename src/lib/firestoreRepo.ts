import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { DEFAULT_USER_QUOTA_BYTES, isValidUsername } from './validation';
import type {
  ActivityEventDoc,
  AuditLogDoc,
  CommentDoc,
  DeploymentDoc,
  DiscussionDoc,
  IssueDoc,
  NotificationDoc,
  OrganizationDoc,
  OrgMemberDoc,
  OrgTeamDoc,
  PackageDoc,
  PlatformConfigDoc,
  PrivateUser,
  ProjectTaskDoc,
  PublicProfile,
  PullRequestDoc,
  ReleaseDoc,
  ReportDoc,
  RepositoryDoc,
  ReviewDoc,
  WorkflowRunDoc,
} from '../types/domain';

function makeId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 14) : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}

export const firestoreRepo = {
  // -------------------------------------------------------
  // Profiles & Usernames
  // -------------------------------------------------------
  async checkUsernameAvailable(username: string): Promise<boolean> {
    if (!isValidUsername(username)) return false;
    const path = `usernames/${username}`;
    try {
      const snap = await getDoc(doc(db, 'usernames', username));
      return !snap.exists();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  },

  async ensureUserAccount(uid: string, email: string, displayName: string, avatarUrl?: string): Promise<{ profile: PublicProfile; privateUser: PrivateUser }> {
    const profilePath = `public_profiles/${uid}`;
    const privatePath = `users_private/${uid}`;
    try {
      const [pubSnap, privSnap] = await Promise.all([
        getDoc(doc(db, 'public_profiles', uid)),
        getDoc(doc(db, 'users_private', uid)),
      ]);

      if (pubSnap.exists() && privSnap.exists()) {
        return {
          profile: pubSnap.data() as PublicProfile,
          privateUser: privSnap.data() as PrivateUser,
        };
      }

      const baseSlug = (email.split('@')[0] || 'dev')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 20) || 'developer';
      let candidate = baseSlug.length >= 3 ? baseSlug : `${baseSlug}dev`;
      const existingName = await getDoc(doc(db, 'usernames', candidate));
      if (existingName.exists() && existingName.data()?.uid !== uid) {
        candidate = `${candidate.slice(0, 22)}-${uid.slice(0, 6).toLowerCase()}`;
      }

      const batch = writeBatch(db);
      const profilePayload: PublicProfile = {
        uid,
        username: candidate,
        displayName: (displayName || candidate).slice(0, 80),
        bio: '',
        avatarUrl: avatarUrl || '',
        coverUrl: '',
        website: '',
        company: '',
        location: '',
        statusText: '',
        socialLinks: [],
        pinnedRepoIds: [],
        profileReadme: `# Hello, I'm ${displayName || candidate}\n\nBuilding on **SOUL HUB**.`,
        isPrivateProfile: false,
        followersCount: 0,
        followingCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const privatePayload: PrivateUser = {
        uid,
        email,
        blockedUserIds: [],
        mutedUserIds: [],
        emailNotifications: true,
        securityAlerts: true,
        themePreference: 'dark',
        storageUsedBytes: 0,
        quotaLimitBytes: DEFAULT_USER_QUOTA_BYTES,
        isSuspended: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (!pubSnap.exists()) {
        batch.set(doc(db, 'public_profiles', uid), profilePayload);
        batch.set(doc(db, 'usernames', candidate), {
          uid,
          username: candidate,
          createdAt: serverTimestamp(),
        });
      }
      if (!privSnap.exists()) {
        batch.set(doc(db, 'users_private', uid), privatePayload);
      }
      await batch.commit();

      return { profile: profilePayload, privateUser: privatePayload };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, profilePath || privatePath);
    }
  },

  async getProfileByUsername(username: string): Promise<PublicProfile | null> {
    try {
      const unameSnap = await getDoc(doc(db, 'usernames', username));
      if (!unameSnap.exists()) return null;
      const uid = unameSnap.data().uid as string;
      const profSnap = await getDoc(doc(db, 'public_profiles', uid));
      return profSnap.exists() ? (profSnap.data() as PublicProfile) : null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `usernames/${username}`);
    }
  },

  async listPublicProfiles(max = 30): Promise<PublicProfile[]> {
    try {
      const q = query(collection(db, 'public_profiles'), where('isPrivateProfile', '==', false), limit(max));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as PublicProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'public_profiles');
    }
  },

  async updatePublicProfile(uid: string, patch: Partial<PublicProfile>): Promise<void> {
    try {
      await updateDoc(doc(db, 'public_profiles', uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `public_profiles/${uid}`);
    }
  },

  async updatePrivateUser(uid: string, patch: Partial<PrivateUser>): Promise<void> {
    try {
      await updateDoc(doc(db, 'users_private', uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users_private/${uid}`);
    }
  },

  // -------------------------------------------------------
  // Repositories & Social Edges
  // -------------------------------------------------------
  async createRepository(repo: Omit<RepositoryDoc, 'starsCount' | 'forksCount' | 'watchersCount' | 'openIssuesCount' | 'isArchived' | 'createdAt' | 'updatedAt'>): Promise<RepositoryDoc> {
    const path = `repositories/${repo.id}`;
    const payload: RepositoryDoc = {
      ...repo,
      isArchived: false,
      starsCount: 0,
      forksCount: 0,
      watchersCount: 0,
      openIssuesCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'repositories', repo.id), payload);
      return payload;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async listPublicRepositories(max = 50): Promise<RepositoryDoc[]> {
    try {
      const q = query(collection(db, 'repositories'), where('visibility', '==', 'public'), limit(max));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as RepositoryDoc);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'repositories');
    }
  },

  async listUserRepositories(uid: string): Promise<RepositoryDoc[]> {
    try {
      const q = query(collection(db, 'repositories'), where('ownerId', '==', uid), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as RepositoryDoc);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'repositories');
    }
  },

  async findRepositoryByFullName(ownerUsername: string, slug: string): Promise<RepositoryDoc | null> {
    try {
      const fullName = `${ownerUsername}/${slug}`;
      const q = query(collection(db, 'repositories'), where('fullName', '==', fullName), where('visibility', '==', 'public'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) return snap.docs[0].data() as RepositoryDoc;
      return null;
    } catch {
      return null;
    }
  },

  async findOwnedRepositoryByFullName(uid: string, ownerUsername: string, slug: string): Promise<RepositoryDoc | null> {
    try {
      const q = query(
        collection(db, 'repositories'),
        where('ownerId', '==', uid),
        where('fullName', '==', `${ownerUsername}/${slug}`),
        limit(1)
      );
      const snap = await getDocs(q);
      return snap.empty ? null : (snap.docs[0].data() as RepositoryDoc);
    } catch {
      return null;
    }
  },

  async updateRepository(repoId: string, patch: Partial<RepositoryDoc>): Promise<void> {
    try {
      await updateDoc(doc(db, 'repositories', repoId), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `repositories/${repoId}`);
    }
  },

  async deleteRepository(repoId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'repositories', repoId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `repositories/${repoId}`);
    }
  },

  async toggleStar(repoId: string, actorId: string): Promise<boolean> {
    const edgeId = `${repoId}_${actorId}`;
    try {
      const ref = doc(db, 'stars', edgeId);
      const snap = await getDoc(ref);
      const batch = writeBatch(db);
      if (snap.exists()) {
        batch.delete(ref);
        batch.update(doc(db, 'repositories', repoId), { starsCount: increment(-1), updatedAt: serverTimestamp() });
        await batch.commit();
        return false;
      } else {
        batch.set(ref, { actorId, targetId: repoId, createdAt: serverTimestamp() });
        batch.update(doc(db, 'repositories', repoId), { starsCount: increment(1), updatedAt: serverTimestamp() });
        await batch.commit();
        return true;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `stars/${edgeId}`);
    }
  },

  async hasStarred(repoId: string, actorId: string): Promise<boolean> {
    try {
      const snap = await getDoc(doc(db, 'stars', `${repoId}_${actorId}`));
      return snap.exists();
    } catch {
      return false;
    }
  },

  async toggleBookmark(repoId: string, actorId: string): Promise<boolean> {
    const edgeId = `${repoId}_${actorId}`;
    try {
      const ref = doc(db, 'bookmarks', edgeId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await deleteDoc(ref);
        return false;
      }
      await setDoc(ref, { actorId, targetId: repoId, createdAt: serverTimestamp() });
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bookmarks/${edgeId}`);
    }
  },

  async listUserBookmarks(actorId: string): Promise<string[]> {
    try {
      const q = query(collection(db, 'bookmarks'), where('actorId', '==', actorId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => String(d.data().targetId));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'bookmarks');
    }
  },

  async toggleFollow(targetUid: string, actorId: string): Promise<boolean> {
    const edgeId = `${actorId}_${targetUid}`;
    try {
      const ref = doc(db, 'followers', edgeId);
      const snap = await getDoc(ref);
      const batch = writeBatch(db);
      if (snap.exists()) {
        batch.delete(ref);
        batch.update(doc(db, 'public_profiles', targetUid), { followersCount: increment(-1), updatedAt: serverTimestamp() });
        batch.update(doc(db, 'public_profiles', actorId), { followingCount: increment(-1), updatedAt: serverTimestamp() });
        await batch.commit();
        return false;
      } else {
        batch.set(ref, { actorId, targetId: targetUid, createdAt: serverTimestamp() });
        batch.update(doc(db, 'public_profiles', targetUid), { followersCount: increment(1), updatedAt: serverTimestamp() });
        batch.update(doc(db, 'public_profiles', actorId), { followingCount: increment(1), updatedAt: serverTimestamp() });
        await batch.commit();
        return true;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `followers/${edgeId}`);
    }
  },

  async isFollowing(targetUid: string, actorId: string): Promise<boolean> {
    try {
      const snap = await getDoc(doc(db, 'followers', `${actorId}_${targetUid}`));
      return snap.exists();
    } catch {
      return false;
    }
  },

  // -------------------------------------------------------
  // Issues, Pull Requests, Projects, Discussions, Releases
  // -------------------------------------------------------
  async listIssues(repoId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<IssueDoc[]> {
    const path = `repositories/${repoId}/issues`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(100))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<IssueDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createIssue(repo: RepositoryDoc, data: { number: number; title: string; body: string; labels: string[]; authorId: string; authorUsername: string }): Promise<IssueDoc> {
    const id = makeId('iss');
    const path = `repositories/${repo.id}/issues/${id}`;
    const payload: Omit<IssueDoc, 'id'> = {
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      number: data.number,
      title: data.title,
      body: data.body,
      status: 'open',
      authorId: data.authorId,
      authorUsername: data.authorUsername,
      labels: data.labels.slice(0, 10),
      assigneeIds: [],
      milestone: '',
      dueDate: '',
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, `repositories/${repo.id}/issues`, id), payload);
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async updateIssue(repoId: string, issueId: string, patch: Partial<IssueDoc>): Promise<void> {
    try {
      await updateDoc(doc(db, `repositories/${repoId}/issues`, issueId), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `repositories/${repoId}/issues/${issueId}`);
    }
  },

  async listPullRequests(repoId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<PullRequestDoc[]> {
    const path = `repositories/${repoId}/pull_requests`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(100))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PullRequestDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createPullRequest(
    repo: RepositoryDoc,
    data: { number: number; title: string; body: string; sourceBranch: string; targetBranch: string; status: 'open' | 'draft'; authorId: string; authorUsername: string }
  ): Promise<PullRequestDoc> {
    const id = makeId('pr');
    const payload: Omit<PullRequestDoc, 'id'> = {
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      number: data.number,
      title: data.title,
      body: data.body,
      sourceBranch: data.sourceBranch,
      targetBranch: data.targetBranch,
      status: data.status,
      authorId: data.authorId,
      authorUsername: data.authorUsername,
      reviewerIds: [],
      approvalsCount: 0,
      mergeMethod: 'none',
      mergedCommitSha: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, `repositories/${repo.id}/pull_requests`, id), payload);
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `repositories/${repo.id}/pull_requests/${id}`);
    }
  },

  async updatePullRequest(repoId: string, prId: string, patch: Partial<PullRequestDoc>): Promise<void> {
    try {
      await updateDoc(doc(db, `repositories/${repoId}/pull_requests`, prId), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `repositories/${repoId}/pull_requests/${prId}`);
    }
  },

  async listProjectTasks(repoId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<ProjectTaskDoc[]> {
    const path = `repositories/${repoId}/projects`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(100))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectTaskDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createProjectTask(
    repo: RepositoryDoc,
    data: { title: string; description: string; column: 'todo' | 'in_progress' | 'review' | 'done'; priority: 'low' | 'medium' | 'high'; authorId: string; assigneeUsername?: string }
  ): Promise<ProjectTaskDoc> {
    const id = makeId('task');
    const payload: Omit<ProjectTaskDoc, 'id'> = {
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      title: data.title,
      description: data.description,
      column: data.column,
      priority: data.priority,
      authorId: data.authorId,
      assigneeUsername: data.assigneeUsername || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, `repositories/${repo.id}/projects`, id), payload);
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `repositories/${repo.id}/projects/${id}`);
    }
  },

  async updateProjectTask(repoId: string, taskId: string, patch: Partial<ProjectTaskDoc>): Promise<void> {
    try {
      await updateDoc(doc(db, `repositories/${repoId}/projects`, taskId), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `repositories/${repoId}/projects/${taskId}`);
    }
  },

  async listDiscussions(repoId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<DiscussionDoc[]> {
    const path = `repositories/${repoId}/discussions`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(50))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(50));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DiscussionDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createDiscussion(
    repo: RepositoryDoc,
    data: { title: string; body: string; category: 'general' | 'q_and_a' | 'ideas' | 'announcements'; authorId: string; authorUsername: string }
  ): Promise<DiscussionDoc> {
    const id = makeId('disc');
    const payload: Omit<DiscussionDoc, 'id'> = {
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      title: data.title,
      body: data.body,
      category: data.category,
      authorId: data.authorId,
      authorUsername: data.authorUsername,
      isAnswered: false,
      upvotesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, `repositories/${repo.id}/discussions`, id), payload);
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `repositories/${repo.id}/discussions/${id}`);
    }
  },

  async listReleases(repoId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<ReleaseDoc[]> {
    const path = `repositories/${repoId}/releases`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(30))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(30));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReleaseDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createRelease(
    repo: RepositoryDoc,
    data: { tagName: string; title: string; body: string; isDraft: boolean; isPrerelease: boolean; authorId: string; authorUsername: string }
  ): Promise<ReleaseDoc> {
    const id = makeId('rel');
    const payload: Omit<ReleaseDoc, 'id'> = {
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      tagName: data.tagName,
      title: data.title,
      body: data.body,
      isDraft: data.isDraft,
      isPrerelease: data.isPrerelease,
      authorId: data.authorId,
      authorUsername: data.authorUsername,
      downloadsCount: 0,
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, `repositories/${repo.id}/releases`, id), payload);
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `repositories/${repo.id}/releases/${id}`);
    }
  },

  async listDeployments(repoId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<DeploymentDoc[]> {
    const path = `repositories/${repoId}/deployments`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(25))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(25));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeploymentDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async recordDeployment(
    repo: RepositoryDoc,
    data: { deploymentId: string; branch: string; outputDir: string; commitSha: string; status: 'live' | 'failed' | 'rolled_back'; url: string; buildLogs: string; authorId: string }
  ): Promise<void> {
    try {
      await setDoc(doc(db, `repositories/${repo.id}/deployments`, data.deploymentId), {
        repoId: repo.id,
        repoVisibility: repo.visibility,
        repoOwnerId: repo.ownerId,
        branch: data.branch,
        outputDir: data.outputDir,
        commitSha: data.commitSha,
        status: data.status,
        url: data.url,
        buildLogs: data.buildLogs,
        authorId: data.authorId,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `repositories/${repo.id}/deployments/${data.deploymentId}`);
    }
  },

  async listWorkflowRuns(repoId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<WorkflowRunDoc[]> {
    const path = `repositories/${repoId}/workflow_runs`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(25))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(25));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkflowRunDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createWorkflowRun(
    repo: RepositoryDoc,
    data: { workflowName: string; trigger: 'push' | 'pull_request' | 'manual' | 'schedule'; branch: string; status: 'configured' | 'queued_external_runner'; summary: string; authorId: string }
  ): Promise<WorkflowRunDoc> {
    const id = makeId('wfr');
    const payload: Omit<WorkflowRunDoc, 'id'> = {
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      workflowName: data.workflowName,
      trigger: data.trigger,
      branch: data.branch,
      status: data.status,
      summary: data.summary,
      authorId: data.authorId,
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, `repositories/${repo.id}/workflow_runs`, id), payload);
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `repositories/${repo.id}/workflow_runs/${id}`);
    }
  },

  // -------------------------------------------------------
  // Packages, Organizations, Notifications, Activity, Admin
  // -------------------------------------------------------
  async listPublicPackages(): Promise<PackageDoc[]> {
    try {
      const q = query(collection(db, 'packages'), where('visibility', '==', 'public'), limit(50));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PackageDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'packages');
    }
  },

  async createPackage(pkg: Omit<PackageDoc, 'id' | 'downloadsCount' | 'createdAt' | 'updatedAt'>): Promise<PackageDoc> {
    const id = makeId('pkg');
    const payload: Omit<PackageDoc, 'id'> = {
      ...pkg,
      downloadsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'packages', id), payload);
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `packages/${id}`);
    }
  },

  async listOrganizations(): Promise<OrganizationDoc[]> {
    try {
      const q = query(collection(db, 'organizations'), where('slug', '!=', null), limit(50));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrganizationDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'organizations');
    }
  },

  async createOrganization(org: { slug: string; name: string; description: string; ownerId: string; ownerUsername: string }): Promise<OrganizationDoc> {
    const id = makeId('org');
    const payload: Omit<OrganizationDoc, 'id'> = {
      slug: org.slug,
      name: org.name,
      description: org.description,
      readme: `# ${org.name}\n\nOrganization workspace on SOUL HUB.`,
      avatarUrl: '',
      website: '',
      location: '',
      ownerId: org.ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'organizations', id), payload);
      await setDoc(doc(db, `organizations/${id}/members`, org.ownerId), {
        orgId: id,
        uid: org.ownerId,
        username: org.ownerUsername,
        role: 'owner',
        createdAt: serverTimestamp(),
      });
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `organizations/${id}`);
    }
  },

  async listNotifications(uid: string): Promise<NotificationDoc[]> {
    try {
      const q = query(collection(db, 'notifications'), where('userId', '==', uid), limit(50));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    }
  },

  async createNotification(data: Omit<NotificationDoc, 'id' | 'isRead' | 'createdAt'>): Promise<void> {
    const id = makeId('ntf');
    try {
      await setDoc(doc(db, 'notifications', id), {
        ...data,
        isRead: false,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Non-blocking notification failure
    }
  },

  async markNotificationRead(id: string, isRead = true): Promise<void> {
    try {
      await updateDoc(doc(db, 'notifications', id), { isRead });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  },

  async deleteNotification(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
    }
  },

  async listPublicActivity(max = 25): Promise<ActivityEventDoc[]> {
    try {
      const q = query(collection(db, 'activity_events'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(max));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityEventDoc, 'id'>) }));
    } catch {
      // Fallback without composite index if index not yet created
      try {
        const q = query(collection(db, 'activity_events'), where('visibility', '==', 'public'), limit(max));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityEventDoc, 'id'>) }));
      } catch {
        return [];
      }
    }
  },

  async logActivity(event: Omit<ActivityEventDoc, 'id' | 'createdAt'>): Promise<void> {
    const id = makeId('act');
    try {
      await setDoc(doc(db, 'activity_events', id), {
        ...event,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Non-fatal
    }
  },

  async createReport(data: { reporterId: string; targetType: 'repository' | 'user' | 'issue' | 'discussion' | 'security_advisory'; targetId: string; reason: string }): Promise<void> {
    const id = makeId('rep');
    try {
      await setDoc(doc(db, 'reports', id), {
        ...data,
        status: 'open',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `reports/${id}`);
    }
  },

  async getPlatformConfig(): Promise<PlatformConfigDoc | null> {
    try {
      const snap = await getDoc(doc(db, 'platform_config', 'global'));
      return snap.exists() ? (snap.data() as PlatformConfigDoc) : null;
    } catch {
      return null;
    }
  },

  async savePlatformConfig(cfg: Omit<PlatformConfigDoc, 'updatedAt'>): Promise<void> {
    try {
      await setDoc(doc(db, 'platform_config', 'global'), {
        ...cfg,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'platform_config/global');
    }
  },

  async writeAuditLog(entry: { actorId: string; action: string; targetType: string; targetId: string; details?: string }): Promise<void> {
    const id = makeId('aud');
    try {
      await setDoc(doc(db, 'audit_logs', id), {
        ...entry,
        details: (entry.details || '').slice(0, 500),
        createdAt: serverTimestamp(),
      });
    } catch {
      // Non-blocking
    }
  },

  async listIssueComments(repoId: string, issueId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<CommentDoc[]> {
    const path = `repositories/${repoId}/issues/${issueId}/comments`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(100))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommentDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async addIssueComment(
    repo: RepositoryDoc,
    issueId: string,
    data: { authorId: string; authorUsername: string; body: string }
  ): Promise<CommentDoc> {
    const id = makeId('cmt');
    const path = `repositories/${repo.id}/issues/${issueId}/comments/${id}`;
    const payload: Omit<CommentDoc, 'id'> = {
      parentId: issueId,
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      authorId: data.authorId,
      authorUsername: data.authorUsername,
      body: data.body,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, `repositories/${repo.id}/issues/${issueId}/comments`, id), payload);
      batch.update(doc(db, `repositories/${repo.id}/issues`, issueId), {
        commentsCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async deleteProjectTask(repoId: string, taskId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, `repositories/${repoId}/projects`, taskId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `repositories/${repoId}/projects/${taskId}`);
    }
  },

  async listDiscussionComments(repoId: string, discussionId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<CommentDoc[]> {
    const path = `repositories/${repoId}/discussions/${discussionId}/comments`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(100))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommentDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async addDiscussionComment(
    repo: RepositoryDoc,
    discussionId: string,
    data: { authorId: string; authorUsername: string; body: string }
  ): Promise<CommentDoc> {
    const id = makeId('dcmt');
    const path = `repositories/${repo.id}/discussions/${discussionId}/comments/${id}`;
    const payload: Omit<CommentDoc, 'id'> = {
      parentId: discussionId,
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      authorId: data.authorId,
      authorUsername: data.authorUsername,
      body: data.body,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, `repositories/${repo.id}/discussions/${discussionId}/comments`, id), payload);
      batch.update(doc(db, `repositories/${repo.id}/discussions`, discussionId), {
        commentsCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async upvoteDiscussion(repoId: string, discussionId: string): Promise<void> {
    try {
      await updateDoc(doc(db, `repositories/${repoId}/discussions`, discussionId), {
        upvotesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `repositories/${repoId}/discussions/${discussionId}`);
    }
  },

  async toggleDiscussionAnswered(repoId: string, discussionId: string, isAnswered: boolean): Promise<void> {
    try {
      await updateDoc(doc(db, `repositories/${repoId}/discussions`, discussionId), {
        isAnswered,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `repositories/${repoId}/discussions/${discussionId}`);
    }
  },

  async listPrReviews(repoId: string, prId: string, repoVisibility: 'public' | 'private', uid?: string): Promise<ReviewDoc[]> {
    const path = `repositories/${repoId}/pull_requests/${prId}/reviews`;
    try {
      const q =
        repoVisibility === 'public'
          ? query(collection(db, path), where('repoVisibility', '==', 'public'), limit(100))
          : query(collection(db, path), where('repoOwnerId', '==', uid || ''), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReviewDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async addPrReview(
    repo: RepositoryDoc,
    prId: string,
    data: {
      reviewerId: string;
      reviewerUsername: string;
      state: 'approved' | 'changes_requested' | 'commented';
      body: string;
      filePath?: string;
      lineNumber?: number;
    }
  ): Promise<ReviewDoc> {
    const id = makeId('rev');
    const path = `repositories/${repo.id}/pull_requests/${prId}/reviews/${id}`;
    const payload: Omit<ReviewDoc, 'id'> = {
      prId,
      repoId: repo.id,
      repoVisibility: repo.visibility,
      repoOwnerId: repo.ownerId,
      reviewerId: data.reviewerId,
      reviewerUsername: data.reviewerUsername,
      state: data.state,
      body: data.body,
      ...(data.filePath ? { filePath: data.filePath } : {}),
      ...(data.lineNumber && data.lineNumber >= 1 ? { lineNumber: data.lineNumber } : {}),
      resolved: false,
      createdAt: serverTimestamp(),
    };
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, `repositories/${repo.id}/pull_requests/${prId}/reviews`, id), payload);
      if (data.state === 'approved') {
        batch.update(doc(db, `repositories/${repo.id}/pull_requests`, prId), {
          approvalsCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async resolvePrReview(repoId: string, prId: string, reviewId: string, resolved: boolean): Promise<void> {
    try {
      await updateDoc(doc(db, `repositories/${repoId}/pull_requests/${prId}/reviews`, reviewId), { resolved });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `repositories/${repoId}/pull_requests/${prId}/reviews/${reviewId}`);
    }
  },

  async updateDeploymentStatus(repoId: string, deploymentId: string, status: 'live' | 'rolled_back'): Promise<void> {
    try {
      await updateDoc(doc(db, `repositories/${repoId}/deployments`, deploymentId), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `repositories/${repoId}/deployments/${deploymentId}`);
    }
  },

  async listOrgMembers(orgId: string): Promise<OrgMemberDoc[]> {
    const path = `organizations/${orgId}/members`;
    try {
      const q = query(collection(db, path), where('orgId', '==', orgId), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as OrgMemberDoc);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async addOrgMember(orgId: string, member: { uid: string; username: string; role: OrgMemberDoc['role'] }): Promise<void> {
    const path = `organizations/${orgId}/members/${member.uid}`;
    try {
      await setDoc(doc(db, `organizations/${orgId}/members`, member.uid), {
        orgId,
        uid: member.uid,
        username: member.username,
        role: member.role,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async listOrgTeams(orgId: string): Promise<OrgTeamDoc[]> {
    const path = `organizations/${orgId}/teams`;
    try {
      const q = query(collection(db, path), where('orgId', '==', orgId), limit(50));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrgTeamDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async createOrgTeam(orgId: string, team: { name: string; description: string; permission: 'read' | 'write' | 'admin' }): Promise<OrgTeamDoc> {
    const id = makeId('team');
    const path = `organizations/${orgId}/teams/${id}`;
    const payload: Omit<OrgTeamDoc, 'id'> = {
      orgId,
      name: team.name,
      description: team.description,
      permission: team.permission,
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, `organizations/${orgId}/teams`, id), payload);
      return { id, ...payload };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  async deletePackage(packageId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'packages', packageId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `packages/${packageId}`);
    }
  },

  async listPackagesByOwner(uid: string): Promise<PackageDoc[]> {
    try {
      const q = query(collection(db, 'packages'), where('ownerId', '==', uid), limit(50));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PackageDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'packages');
    }
  },

  async listReports(): Promise<ReportDoc[]> {
    try {
      const q = query(collection(db, 'reports'), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'reports');
    }
  },

  async updateReportStatus(reportId: string, status: 'open' | 'resolved' | 'dismissed'): Promise<void> {
    try {
      await updateDoc(doc(db, 'reports', reportId), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
    }
  },

  async listAuditLogs(max = 50): Promise<AuditLogDoc[]> {
    try {
      const q = query(collection(db, 'audit_logs'), limit(max));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogDoc, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'audit_logs');
    }
  },

  async listAllPrivateUsersForAdmin(): Promise<PrivateUser[]> {
    try {
      const q = query(collection(db, 'users_private'), limit(100));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as PrivateUser);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'users_private');
    }
  },

  async toggleUserSuspended(uid: string, isSuspended: boolean): Promise<void> {
    try {
      await updateDoc(doc(db, 'users_private', uid), { isSuspended, updatedAt: serverTimestamp() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users_private/${uid}`);
    }
  },

  async deleteAccountData(uid: string, username: string): Promise<void> {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'public_profiles', uid));
      batch.delete(doc(db, 'users_private', uid));
      if (username) {
        batch.delete(doc(db, 'usernames', username));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users_private/${uid}`);
    }
  },
};
