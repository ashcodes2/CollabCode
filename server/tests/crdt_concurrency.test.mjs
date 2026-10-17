import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';

// Common prefix/suffix differential updater used in EditorPage.jsx
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

test('CRDT Simulation: User A pastes 50-line JS function while User B simultaneously deletes from top', () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const textA = docA.getText('content');
  const textB = docB.getText('content');

  // Initial document state
  const initialCode = `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
}`;

  textA.insert(0, initialCode);
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  assert.equal(textA.toString(), initialCode);
  assert.equal(textB.toString(), initialCode);

  // User A pastes 50-line JavaScript function
  const fiftyLineFunc = Array.from({ length: 50 }, (_, i) => `  const line_${i + 1} = "item data " + ${i + 1};`).join('\n');
  const userAEditedCode = `function calculateTotal(items) {\n${fiftyLineFunc}\n  let total = 0;\n  return total;\n}`;

  // User B simultaneously deletes characters from the top of the file (e.g. deletes "function ")
  const userBEditedCode = initialCode.replace(/^function /, '');

  // Apply User A edit locally using differential update
  applyTextDiff(textA, userAEditedCode);
  const updateFromA = Y.encodeStateAsUpdate(docA);

  // Apply User B edit locally using differential update
  applyTextDiff(textB, userBEditedCode);
  const updateFromB = Y.encodeStateAsUpdate(docB);

  // Cross-replicate concurrent updates across the network
  Y.applyUpdate(docB, updateFromA);
  Y.applyUpdate(docA, updateFromB);

  // Assert CRDT mathematical convergence
  const finalA = textA.toString();
  const finalB = textB.toString();

  assert.equal(finalA, finalB, 'Both documents must converge to the exact same string state');
  assert.ok(finalA.includes('line_50'), 'User A pasted 50-line content must be preserved');
  assert.ok(!finalA.startsWith('function '), 'User B deletion from top must be preserved');
  assert.ok(finalA.length > 500, 'Content must not be truncated or wiped');
});

test('CRDT Edge Case: Rapid consecutive keystrokes do not duplicate text', () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const textA = docA.getText('content');
  const textB = docB.getText('content');

  textA.insert(0, 'hello');
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  // User A types ' world'
  applyTextDiff(textA, 'hello world');
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  // User B appends '!'
  applyTextDiff(textB, 'hello world!');
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

  assert.equal(textA.toString(), 'hello world!');
  assert.equal(textB.toString(), 'hello world!');
});
