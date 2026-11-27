import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  resolveConfinedPath,
  isValidSafeSegment,
  isAllowedUploadMime,
  sanitizeOutputDirectory,
} from './gitValidation';

test('resolveConfinedPath strictly contains paths inside baseDir', () => {
  const base = '/tmp/soulhub-data';
  assert.equal(resolveConfinedPath(base, 'alice', 'repo.git'), path.resolve(base, 'alice', 'repo.git'));
  assert.equal(resolveConfinedPath(base, '..', 'etc', 'passwd'), null);
  assert.equal(resolveConfinedPath(base, '.'), null);
});

test('safe segment and MIME upload allowlists', () => {
  assert.equal(isValidSafeSegment('orbit-ui'), true);
  assert.equal(isValidSafeSegment('..'), false);
  assert.equal(isAllowedUploadMime('image/png'), true);
  assert.equal(isAllowedUploadMime('image/svg+xml'), false);
  assert.equal(isAllowedUploadMime('application/javascript'), false);
  assert.equal(sanitizeOutputDirectory('/dist/'), 'dist');
  assert.equal(sanitizeOutputDirectory('.'), '.');
  assert.equal(sanitizeOutputDirectory('../outside'), null);
});
