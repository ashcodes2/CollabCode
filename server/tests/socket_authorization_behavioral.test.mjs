import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import * as Y from 'yjs';

const SERVER_URL = 'http://localhost:3001';

function createClient() {
  return io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
}

function waitForEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event: ${eventName}`)), timeoutMs);
    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function ensureConnected(socket) {
  if (socket.connected) return Promise.resolve();
  return waitForEvent(socket, 'connect');
}

test('Behavioral Socket Authorization: Real multi-client socket lifecycle test', async (t) => {
  const testRoomId = `BEHAVIORAL_TEST_${Date.now()}`;
  const clientA = createClient();
  const clientB = createClient();

  let clientAAdminToken = null;

  await t.test('Client A joins room and receives cryptographic adminToken', async () => {
    await ensureConnected(clientA);
    clientA.emit('join-room', { roomId: testRoomId });
    const roleData = await waitForEvent(clientA, 'room-role');

    assert.equal(roleData.isAdmin, true, 'First client to join must be admin');
    assert.equal(roleData.canEdit, true, 'Admin must have edit rights');
    assert.ok(roleData.adminToken && roleData.adminToken.length === 64, 'Must receive 256-bit hex adminToken');
    clientAAdminToken = roleData.adminToken;
  });

  await t.test('Client B joins room as unprivileged read-only guest', async () => {
    await ensureConnected(clientB);
    clientB.emit('join-room', { roomId: testRoomId });
    const roleDataB = await waitForEvent(clientB, 'room-role');

    assert.equal(roleDataB.isAdmin, false, 'Second client must not be admin');
    assert.equal(roleDataB.canEdit, false, 'Guest must default to read-only');
    assert.equal(roleDataB.adminToken, undefined, 'Guest must NOT receive adminToken');
  });

  await t.test('Server blocks unauthorized sync-update from read-only guest', async () => {
    let receivedUnauthorized = false;
    const listener = () => { receivedUnauthorized = true; };
    clientA.on('sync-update', listener);

    // Malicious guest tries to inject an update
    clientB.emit('sync-update', testRoomId, {
      fileName: 'index.html',
      update: [1, 2, 3, 4],
    });

    await new Promise(r => setTimeout(r, 400));
    clientA.off('sync-update', listener);
    assert.equal(receivedUnauthorized, false, 'Server must block unauthorized sync-update');
  });

  await t.test('Server blocks unauthorized tree-change from read-only guest', async () => {
    let receivedTreeChange = false;
    const listener = () => { receivedTreeChange = true; };
    clientA.on('tree-change', listener);

    // Malicious guest tries to delete a file
    clientB.emit('tree-change', testRoomId, {
      op: 'delete',
      path: 'index.html',
    });

    await new Promise(r => setTimeout(r, 400));
    clientA.off('tree-change', listener);
    assert.equal(receivedTreeChange, false, 'Server must block unauthorized tree deletion');
  });

  await t.test('Admin grants edit access to guest; guest can now mutate successfully', async () => {
    const editReqPromise = waitForEvent(clientA, 'edit-request');
    clientB.emit('request-edit', { roomId: testRoomId, requesterName: 'Guest_B' });
    const req = await editReqPromise;
    assert.equal(req.requesterSocketId, clientB.id);

    // Admin grants edit
    const grantPromise = waitForEvent(clientB, 'edit-granted');
    clientA.emit('grant-edit', { requesterSocketId: clientB.id, roomId: testRoomId });
    await grantPromise;

    // Guest now emits a valid Yjs binary update
    const sampleDoc = new Y.Doc();
    sampleDoc.getText('content').insert(0, 'Hello from authorized guest!');
    const validUpdate = Array.from(Y.encodeStateAsUpdate(sampleDoc));

    const updatePromise = waitForEvent(clientA, 'sync-update');
    clientB.emit('sync-update', testRoomId, {
      fileName: 'index.html',
      update: validUpdate,
    });

    const received = await updatePromise;
    assert.equal(received.fileName, 'index.html');
    assert.deepEqual(received.update, validUpdate);
  });

  await t.test('Admin reconnect with adminToken restores admin and editor permissions', async () => {
    clientA.disconnect();

    const reconnectAdmin = createClient();
    await ensureConnected(reconnectAdmin);

    reconnectAdmin.emit('join-room', {
      roomId: testRoomId,
      adminToken: clientAAdminToken,
    });

    const roleData = await waitForEvent(reconnectAdmin, 'room-role');
    assert.equal(roleData.isAdmin, true, 'Reconnecting user with valid adminToken must be restored as admin');
    assert.equal(roleData.canEdit, true, 'Restored admin must have edit rights');
    assert.equal(roleData.adminToken, clientAAdminToken, 'Admin token must be preserved');

    reconnectAdmin.disconnect();
  });

  await t.test('Attacker presenting invalid adminToken is rejected as admin', async () => {
    const attacker = createClient();
    await ensureConnected(attacker);

    attacker.emit('join-room', {
      roomId: testRoomId,
      adminToken: 'deadbeef_fake_token_1234567890abcdef',
    });

    const roleData = await waitForEvent(attacker, 'room-role');
    assert.equal(roleData.isAdmin, false, 'Attacker with fake token must NOT be given admin rights');
    assert.equal(roleData.canEdit, false, 'Attacker must be read-only');
    assert.equal(roleData.adminToken, undefined, 'Attacker must not receive genuine adminToken');

    attacker.disconnect();
  });

  clientA.disconnect();
  clientB.disconnect();
});
