import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync('firestore.rules', 'utf8');

test('Dirty Dozen & Eight Pillars structural invariants in firestore.rules', () => {
  // Pillar 1 & Global Safety Net
  assert.match(rulesSource, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);

  // Pillar 2 & 9: Validation Blueprints wrap updates
  assert.match(rulesSource, /function isValidPublicProfile\(/);
  assert.match(rulesSource, /function isValidPrivateUser\(/);
  assert.match(rulesSource, /function isValidRepository\(/);
  assert.match(rulesSource, /function isValidIssue\(/);
  assert.match(rulesSource, /function isValidPullRequest\(/);

  // Pillar 3: Path variable ID hardening
  assert.match(rulesSource, /function isValidId\(id\)/);

  // Email spoofing test: email_verified == true required
  assert.match(rulesSource, /request\.auth\.token\.email_verified == true/);

  // PII Isolation: users_private restricted to owner or admin
  assert.match(rulesSource, /match \/users_private\/\{uid\}[\s\S]*request\.auth\.uid == uid/);

  // Terminal state lock on merged PRs
  assert.match(rulesSource, /existing\(\)\.status != 'merged'/);

  // No get() or exists() inside allow list blocks
  const listLines = rulesSource
    .split('\n')
    .filter((line) => line.includes('allow list:'));
  for (const line of listLines) {
    assert.equal(
      /\b(get|exists)\(/.test(line),
      false,
      `allow list must not call get() or exists(): ${line}`
    );
  }
});
