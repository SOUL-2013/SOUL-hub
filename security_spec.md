# SOUL HUB Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation**: User email, blocked/muted lists, and quota counters reside exclusively in `/users_private/{uid}` and are readable/writable only by `request.auth.uid == uid` or `isAdmin()`. Public profiles in `/public_profiles/{uid}` contain zero PII.
2. **Username Uniqueness**: `/usernames/{username}` binds a lowercase slug `^[a-z0-9][a-z0-9\-]{1,30}[a-z0-9]$` immutably to a single `uid`.
3. **Private Repository Isolation**: A repository with `visibility == 'private'` and all its subcollections (`issues`, `pull_requests`, `projects`, `discussions`, `releases`, `deployments`, `workflow_runs`, `members`) can ONLY be read by the `ownerId`, an existing member in `/repositories/{repoId}/members/{uid}`, or `isAdmin()`.
4. **Role & Privilege Integrity**: Users cannot grant themselves `admin` privileges or modify `isSuspended` / `quotaLimitBytes`. Admin status is checked exclusively via `isAdmin()` (`request.auth.token.email == 'quantum20007@gmail.com' && request.auth.token.email_verified == true` or `/admins/{uid}`).
5. **Strict Key & Size Boundaries**: Every write enforces `keys().hasAll(...)` + `keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, strict string `.size()` limits, bounded array `.size() <= MAX`, and `request.time` on `createdAt`/`updatedAt`.
6. **Immutable Ownership**: `ownerId`, `authorId`, `actorId`, and `createdAt` cannot be modified after document creation.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on Profile**: Creating `/public_profiles/{uid}` with an extra `"isAdmin": true` field -> MUST fail (`hasOnly`).
2. **Email Spoofing Admin Bypass**: Request with `email == 'quantum20007@gmail.com'` and `email_verified == false` writing to `/platform_config/global` -> MUST fail (`email_verified == true` required).
3. **PII Leak Attempt**: Signed-in non-owner reading `/users_private/{otherUid}` -> MUST fail (`isOwner` or `isAdmin` required).
4. **Private Repository Scrape**: Signed-in non-member running `list` on `/repositories` without `visibility == 'public'` or `ownerId == request.auth.uid` -> MUST fail (`allow list` enforces visibility/ownership).
5. **Subcollection Orphan Bypass**: Non-member creating an issue under `/repositories/{privateRepoId}/issues/{id}` -> MUST fail (Master Gate `get()` checks repository visibility/membership).
6. **Author Spoofing**: User A creating an issue with `authorId: "userB"` -> MUST fail (`authorId == request.auth.uid`).
7. **ID Poisoning**: Creating a document with ID containing 500 characters or `/../` -> MUST fail (`isValidId` regex & size <= 128).
8. **Timestamp Forgery**: Creating a repository with backdated `createdAt` != `request.time` -> MUST fail (`createdAt == request.time`).
9. **Owner Hijack on Update**: Repository collaborator updating `ownerId` to their own UID -> MUST fail (`incoming().ownerId == existing().ownerId`).
10. **Terminal State Bypass**: Re-editing a `merged` pull request's `sourceBranch` or `targetBranch` -> MUST fail (terminal state lock on `merged`).
11. **Value Poisoning on Update**: Updating issue `title` with a 50KB string or non-string -> MUST fail (`isValidIssue(incoming())` wraps entire update).
12. **Self-Unblocking / Quota Tampering**: User updating `quotaLimitBytes` or `isSuspended` in `/users_private/{uid}` -> MUST fail (`affectedKeys().hasOnly(...)` excludes protected fields).
