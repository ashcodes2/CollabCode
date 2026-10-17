import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';

// Behavioral Myers-like prefix/suffix differential updater as used in EditorPage.jsx
function applyTextDiff(yText, newStr) {
  const oldStr = yText.toString();
  if (oldStr === newStr) return;

  let start = 0;
  while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) {
    start++;
  }

  let oldEnd = oldStr.length;
  let newEnd = newStr.length;
  while (oldEnd > start && newEnd > start && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  yText.doc.transact(() => {
    const deleteCount = oldEnd - start;
    if (deleteCount > 0) {
      yText.delete(start, deleteCount);
    }
    const insertStr = newStr.slice(start, newEnd);
    if (insertStr.length > 0) {
      yText.insert(start, insertStr);
    }
  });
}

test('Behavioral Yjs Concurrency: Simultaneous 50-line paste and character deletion converges cleanly', () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const textA = docA.getText('content');
  const textB = docB.getText('content');

  const initialCode = `function main() {\n  console.log("start");\n  const x = 10;\n  return x;\n}`;
  textA.insert(0, initialCode);
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  // User A pastes 50 lines of code inside the function body
  const fiftyLines = Array.from({ length: 50 }, (_, i) => `  const item_${i} = ${i * 2};`).join('\n');
  const userAContent = `function main() {\n${fiftyLines}\n  console.log("start");\n  const x = 10;\n  return x;\n}`;

  // User B concurrently deletes 'function ' from line 1
  const userBContent = initialCode.replace('function ', '');

  // Both execute local edits without receiving the other's update yet
  applyTextDiff(textA, userAContent);
  applyTextDiff(textB, userBContent);

  // Network sync exchange
  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);

  Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docA, updateB);

  // Check convergence
  assert.equal(textA.toString(), textB.toString(), 'Peer A and Peer B must converge to identical text state');
  assert.ok(textA.toString().includes('item_49'), 'Pasted lines from User A must be present');
  assert.ok(!textA.toString().startsWith('function '), 'Top deletion from User B must be reflected');
  assert.equal(textA.toString().indexOf('item_0'), textA.toString().lastIndexOf('item_0'), 'Text must not duplicate');
});

test('Behavioral Yjs Concurrency: Rapid simultaneous keystrokes at opposite file boundaries', () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const textA = docA.getText('content');
  const textB = docB.getText('content');

  textA.insert(0, 'MIDDLE_BLOCK');
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  // User A prepends header; User B appends footer
  applyTextDiff(textA, 'HEADER\nMIDDLE_BLOCK');
  applyTextDiff(textB, 'MIDDLE_BLOCK\nFOOTER');

  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);

  Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docA, updateB);

  assert.equal(textA.toString(), textB.toString());
  assert.ok(textA.toString().startsWith('HEADER'));
  assert.ok(textA.toString().endsWith('FOOTER'));
});

test('Behavioral Yjs Offline Reconnect: Local edits made while offline reconcile deterministically', () => {
  const serverDoc = new Y.Doc();
  const clientDoc = new Y.Doc();

  serverDoc.getText('content').insert(0, 'base version');
  Y.applyUpdate(clientDoc, Y.encodeStateAsUpdate(serverDoc));

  // Client goes offline and types 3 revisions
  applyTextDiff(clientDoc.getText('content'), 'base version - offline rev 1');
  applyTextDiff(clientDoc.getText('content'), 'base version - offline rev 2');
  applyTextDiff(clientDoc.getText('content'), 'base version - offline rev final');

  // Server independently receives an edit from another user
  applyTextDiff(serverDoc.getText('content'), 'SERVER_PREFIX: base version');

  // Client reconnects and syncs
  const clientUpdate = Y.encodeStateAsUpdate(clientDoc);
  const serverUpdate = Y.encodeStateAsUpdate(serverDoc);

  Y.applyUpdate(serverDoc, clientUpdate);
  Y.applyUpdate(clientDoc, serverUpdate);

  assert.equal(clientDoc.getText('content').toString(), serverDoc.getText('content').toString());
});
