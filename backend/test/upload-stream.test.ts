import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';

import { createApp } from '../core/app';
import { resolveUploadPath } from '../modules/files/upload-stream';

const baseDir = path.join(process.cwd(), 'tmp-upload-base');

test('resolveUploadPath allows files below the upload base', () => {
  const resolved = resolveUploadPath('projects/project-1/photo.jpg', baseDir);

  assert.equal(resolved.ok, true);
  assert.equal(resolved.ok && resolved.absolutePath, path.join(baseDir, 'projects', 'project-1', 'photo.jpg'));
});

test('resolveUploadPath rejects empty paths', () => {
  const resolved = resolveUploadPath('', baseDir);

  assert.deepEqual(resolved, { ok: false, status: 403, message: 'Ni dostopa do datoteke.' });
});

test('resolveUploadPath rejects parent-directory traversal', () => {
  const resolved = resolveUploadPath('projects/../../etc/passwd', baseDir);

  assert.deepEqual(resolved, { ok: false, status: 403, message: 'Ni dostopa do datoteke.' });
});

test('resolveUploadPath rejects encoded traversal after Express decodes the path', () => {
  const resolved = resolveUploadPath('../etc/passwd', baseDir);

  assert.deepEqual(resolved, { ok: false, status: 403, message: 'Ni dostopa do datoteke.' });
});

test('resolveUploadPath rejects Windows-style traversal', () => {
  const resolved = resolveUploadPath('projects\\..\\..\\etc\\passwd', baseDir);

  assert.deepEqual(resolved, { ok: false, status: 403, message: 'Ni dostopa do datoteke.' });
});

test('resolveUploadPath rejects null bytes', () => {
  const resolved = resolveUploadPath('projects/photo.jpg\0.png', baseDir);

  assert.deepEqual(resolved, { ok: false, status: 400, message: 'Neveljavna pot datoteke.' });
});

test('GET /uploads/* requires authentication', async () => {
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    assert.notEqual(address, null);
    const { port } = address as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/uploads/projects/p1/photo.jpg`);

    assert.equal(response.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
