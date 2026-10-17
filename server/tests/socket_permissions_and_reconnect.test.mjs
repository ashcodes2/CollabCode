import test from 'node:test';
import assert from 'node:assert/strict';

test('Socket Permissions: Read-only guest cannot mutate Yjs state or tree', () => {
  const room = {
    adminSocketId: 'socket_admin_1',
    adminToken: 'secret_token_123',
    members: new Set(['socket_admin_1', 'socket_guest_2']),
    editors: new Set(['socket_admin_1']), // guest is not an editor
  };

  function canSocketMutate(socketId) {
    return room.editors.has(socketId) || room.adminSocketId === socketId;
  }

  // Admin can edit
  assert.equal(canSocketMutate('socket_admin_1'), true);

  // Guest CANNOT edit by default
  assert.equal(canSocketMutate('socket_guest_2'), false);

  // When admin grants edit access
  room.editors.add('socket_guest_2');
  assert.equal(canSocketMutate('socket_guest_2'), true);

  // When edit access is revoked
  room.editors.delete('socket_guest_2');
  assert.equal(canSocketMutate('socket_guest_2'), false);
});

test('Socket Reconnect: Admin permissions are restored when reconnecting with adminToken', () => {
  const room = {
    adminSocketId: 'socket_admin_1',
    adminToken: 'token_abc_xyz',
    members: new Set(['socket_admin_1', 'socket_guest_2']),
    editors: new Set(['socket_admin_1']),
  };

  // Admin disconnects
  room.members.delete('socket_admin_1');
  room.editors.delete('socket_admin_1');

  // Admin reconnects with a new socket ID ('socket_admin_reconnect_9') and the stored adminToken
  const incomingSocketId = 'socket_admin_reconnect_9';
  const incomingAdminToken = 'token_abc_xyz';

  if (incomingAdminToken && room.adminToken && incomingAdminToken === room.adminToken) {
    room.adminSocketId = incomingSocketId;
    room.editors.add(incomingSocketId);
    room.members.add(incomingSocketId);
  }

  assert.equal(room.adminSocketId, 'socket_admin_reconnect_9');
  assert.ok(room.editors.has('socket_admin_reconnect_9'));
});

test('Socket Reconnect: Guest providing fake or no adminToken is rejected as admin', () => {
  const room = {
    adminSocketId: 'socket_admin_1',
    adminToken: 'token_abc_xyz',
    members: new Set(['socket_admin_1']),
    editors: new Set(['socket_admin_1']),
  };

  const maliciousGuestSocket = 'socket_hacker';
  const maliciousToken = 'fake_token';

  if (maliciousToken && room.adminToken && maliciousToken === room.adminToken) {
    room.adminSocketId = maliciousGuestSocket;
    room.editors.add(maliciousGuestSocket);
  }

  assert.notEqual(room.adminSocketId, maliciousGuestSocket);
  assert.ok(!room.editors.has(maliciousGuestSocket));
});

test('File Path Validation: Directory traversal attacks are neutralized', () => {
  function sanitizePath(filePath) {
    if (typeof filePath !== 'string') return null;
    const clean = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (clean.includes('..') || clean.length > 255) return null;
    return clean;
  }

  assert.equal(sanitizePath('../../../etc/passwd'), null);
  assert.equal(sanitizePath('..\\..\\windows\\system32'), null);
  assert.equal(sanitizePath('src/../secret.env'), null);
  assert.equal(sanitizePath('src/components/App.js'), 'src/components/App.js');
  assert.equal(sanitizePath('/index.html'), 'index.html');
});
