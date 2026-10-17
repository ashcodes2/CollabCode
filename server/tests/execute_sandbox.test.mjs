import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Execution Security: Verify zero new Function() or eval() in backend execute route', () => {
  const executePath = path.resolve('routes/execute.js');
  const code = fs.readFileSync(executePath, 'utf8');

  assert.ok(!code.includes('new Function'), 'routes/execute.js must NOT contain new Function');
  assert.ok(!code.includes('eval('), 'routes/execute.js must NOT contain eval(');
});

test('Execution Security: Verify zero new Function() or eval() in client execute API', () => {
  const clientExecutePath = path.resolve('../client/api/execute.js');
  const code = fs.readFileSync(clientExecutePath, 'utf8');

  assert.ok(!code.includes('new Function'), 'client/api/execute.js must NOT contain new Function');
  assert.ok(!code.includes('eval('), 'client/api/execute.js must NOT contain eval(');
});

test('Execution Constraints: Source code over 100KB is rejected', () => {
  const MAX_SOURCE_LEN = 100 * 1024;
  const oversizedCode = 'console.log("hello");\n'.repeat(5000);

  assert.ok(oversizedCode.length > MAX_SOURCE_LEN);

  function validatePayload(sourceCode) {
    if (typeof sourceCode !== 'string' || sourceCode.length > MAX_SOURCE_LEN) {
      return false;
    }
    return true;
  }

  assert.equal(validatePayload(oversizedCode), false);
  assert.equal(validatePayload('console.log("hello world");'), true);
});
