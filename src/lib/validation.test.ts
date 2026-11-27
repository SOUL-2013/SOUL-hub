import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidId,
  isValidUsername,
  isValidRepoSlug,
  slugifyRepoName,
  sanitizeRelativeRepoPath,
  isValidBranchOrTagName,
  detectLanguageFromFilename,
  formatBytes,
  checkStorageQuota,
  parseWorkflowYamlSummary,
} from './validation';

test('username and repo slug validation', () => {
  assert.equal(isValidUsername('soumadip-dev'), true);
  assert.equal(isValidUsername('ab'), false);
  assert.equal(isValidUsername('Upper_Case'), false);
  assert.equal(isValidRepoSlug('orbit-ui'), true);
  assert.equal(isValidRepoSlug('../secret'), false);
  assert.equal(isValidRepoSlug('repo.git'), false);
  assert.equal(slugifyRepoName('  My Awesome App! '), 'my-awesome-app');
  assert.equal(isValidId('repo_123-abc'), true);
  assert.equal(isValidId('bad/id'), false);
});

test('relative repo path sanitization blocks traversal and .git', () => {
  assert.equal(sanitizeRelativeRepoPath('/src/components/App.tsx'), 'src/components/App.tsx');
  assert.equal(sanitizeRelativeRepoPath('src/../secret.txt'), null);
  assert.equal(sanitizeRelativeRepoPath('.git/config'), null);
  assert.equal(sanitizeRelativeRepoPath('src/.git/hooks'), null);
  assert.equal(sanitizeRelativeRepoPath(''), null);
});

test('branch and tag ref validation rejects unsafe git refs', () => {
  assert.equal(isValidBranchOrTagName('main'), true);
  assert.equal(isValidBranchOrTagName('feat/code-review-v2'), true);
  assert.equal(isValidBranchOrTagName('v1.2.0'), true);
  assert.equal(isValidBranchOrTagName('-rf'), false);
  assert.equal(isValidBranchOrTagName('main..other'), false);
  assert.equal(isValidBranchOrTagName('bad ref'), false);
});

test('language detection, bytes formatting, and quota enforcement', () => {
  assert.equal(detectLanguageFromFilename('src/index.tsx'), 'TypeScript');
  assert.equal(detectLanguageFromFilename('main.rs'), 'Rust');
  assert.equal(detectLanguageFromFilename('Dockerfile'), 'Shell');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1.5 KB');

  const ok = checkStorageQuota(10 * 1024 * 1024, 5 * 1024 * 1024);
  assert.equal(ok.allowed, true);
  const exceeded = checkStorageQuota(48 * 1024 * 1024, 5 * 1024 * 1024);
  assert.equal(exceeded.allowed, false);
});

test('workflow YAML summary parser extracts triggers and jobs', () => {
  const yaml = `name: Build & Test
on: [push, pull_request]
jobs:
  lint_and_test:
    runs-on: ubuntu-latest
  build_bundle:
    runs-on: ubuntu-latest
`;
  const parsed = parseWorkflowYamlSummary(yaml);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.name, 'Build & Test');
  assert.deepEqual(parsed.triggers, ['push', 'pull_request']);
  assert.deepEqual(parsed.jobs, ['lint_and_test', 'build_bundle']);

  const invalid = parseWorkflowYamlSummary('name: Broken\non: push\n');
  assert.equal(invalid.valid, false);
});
