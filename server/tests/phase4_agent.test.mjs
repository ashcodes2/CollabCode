/**
 * server/tests/phase4_agent.test.mjs
 *
 * Automated verification suite for Phase 4: Testing Agent – CollabCode.
 * Tests all 8 verification scenarios:
 * 1. Generate test cases for a login form (normal login, invalid email, empty fields).
 * 2. Identify missing validation for empty inputs.
 * 3. Test a JavaScript counter (increment, decrement, initial value, string concatenation check).
 * 4. Identify edge cases for a calculator (division by zero, decimal precision, consecutive operators, negative numbers).
 * 5. Analyze a failing test and explain its cause with clear root cause analysis.
 * 6. Verify that rejected fixes leave files unchanged (Phase 2 proposal rejection).
 * 7. Verify that approved fixes use existing Phase 2 workflow (Phase 2 proposal approval).
 * 8. Regression verification of Phase 1, Phase 2, and Phase 3 tools.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomFeatures,
  analyzeJsValidation,
  generateTestPlan,
  runProjectTests,
} from '../tools/testEngine.js';
import {
  executeTool,
  TOOL_DEFINITIONS,
} from '../tools/projectTools.js';
import {
  createProposal,
  applyProposal,
  rejectProposal,
} from '../tools/proposalManager.js';

describe('Phase 4: Testing Agent – CollabCode', () => {

  // ── Scenario 1: Generate test cases for a login form ──────────────────────
  test('Scenario 1: Generate test cases for a login form (normal, invalid email, empty fields)', () => {
    const loginTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: `<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <form id="login-form">
    <input type="email" id="email" name="email" required placeholder="Enter email" />
    <input type="password" id="password" name="password" required placeholder="Enter password" />
    <button type="submit" id="submit-btn">Sign In</button>
  </form>
  <div id="error-msg"></div>
</body>
</html>`,
      },
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: `const form = document.getElementById('login-form');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  if (!email.trim() || !password.trim()) {
    document.getElementById('error-msg').textContent = 'Please fill in all fields.';
    return;
  }
  if (!email.includes('@')) {
    document.getElementById('error-msg').textContent = 'Invalid email format.';
    return;
  }
  console.log('Login successful');
});`,
      },
    };

    const plan = executeTool('generate_test_plan', { feature: 'login' }, loginTree);
    assert.equal(plan.success, true);
    assert.ok(plan.testPlan);
    assert.ok(plan.testPlan.testCases.length >= 3);

    // Verify presence of normal test case
    const normalCase = plan.testPlan.testCases.find(t => t.type === 'normal');
    assert.ok(normalCase, 'Should include normal login test case');
    assert.ok(normalCase.name.toLowerCase().includes('valid') || normalCase.name.toLowerCase().includes('submission'));
    assert.ok(normalCase.expectedResult);
    assert.ok(Array.isArray(normalCase.manualSteps));

    // Verify presence of invalid input test case (malformed email)
    const invalidCase = plan.testPlan.testCases.find(t => t.type === 'invalid_input');
    assert.ok(invalidCase, 'Should include invalid email test case');
    assert.ok(invalidCase.name.toLowerCase().includes('email'));
    assert.ok(invalidCase.expectedResult);

    // Verify presence of edge case (empty/whitespace inputs)
    const emptyCase = plan.testPlan.testCases.find(t => t.type === 'edge_case');
    assert.ok(emptyCase, 'Should include empty inputs edge case');
    assert.ok(emptyCase.name.toLowerCase().includes('empty'));
  });

  // ── Scenario 2: Identify missing validation for empty inputs ──────────────
  test('Scenario 2: Identify missing validation for empty inputs', () => {
    // Project with form that does NOT validate empty inputs
    const unvalidatedFormTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: `<!DOCTYPE html>
<html>
<body>
  <form id="contact-form">
    <input type="text" id="username" name="username" />
    <input type="password" id="password" name="password" />
    <button type="submit" id="btn-submit">Submit</button>
  </form>
</body>
</html>`,
      },
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: `const form = document.getElementById('contact-form');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  // BUG: submits values without checking if empty!
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;
  fetch('/api/login', { method: 'POST', body: JSON.stringify({ user, pass }) });
});`,
      },
    };

    const results = executeTool('run_project_tests', {}, unvalidatedFormTree);
    assert.equal(results.success, true);
    assert.ok(results.testResults);

    // Should flag missing validation in missingScenarios
    assert.ok(results.testResults.missingScenarios.length >= 1);
    const emptyGap = results.testResults.missingScenarios.find(s => s.issue.toLowerCase().includes('empty'));
    assert.ok(emptyGap, 'Should identify missing empty input validation');
    assert.ok(emptyGap.recommendation.includes('.trim()') || emptyGap.recommendation.includes('empty'));

    // The empty input test case should have status 'failed'
    const failedEmptyTest = results.testResults.results.find(r => r.id === 'TC-LOGIN-003');
    assert.ok(failedEmptyTest, 'Should have empty input test case');
    assert.equal(failedEmptyTest.status, 'failed');
    assert.ok(failedEmptyTest.errorDetails.includes('Missing validation for empty inputs'));
  });

  // ── Scenario 3: Test a JavaScript counter ──────────────────────────────────
  test('Scenario 3: Test a JavaScript counter (increment, decrement, string concatenation check)', () => {
    // Counter with string concatenation bug
    const buggyCounterTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: `<!DOCTYPE html>
<html>
<body>
  <span id="counter">0</span>
  <button id="increment">+1</button>
  <button id="decrement">-1</button>
  <script src="counter.js"></script>
</body>
</html>`,
      },
      'counter.js': {
        type: 'file',
        name: 'counter.js',
        value: `const countEl = document.getElementById('counter');
document.getElementById('increment').addEventListener('click', () => {
  // BUG: reads textContent as string without parseInt -> "0" + 1 = "01"
  countEl.textContent = countEl.textContent + 1;
});
document.getElementById('decrement').addEventListener('click', () => {
  countEl.textContent = countEl.textContent - 1;
});`,
      },
    };

    const results = executeTool('run_project_tests', { test_suite: 'counter' }, buggyCounterTree);
    assert.equal(results.success, true);
    assert.ok(results.testResults);
    assert.ok(results.testResults.featuresDetected.includes('JavaScript Counter'));

    // Should detect string concatenation failure
    const failedIncrement = results.testResults.results.find(r => r.id === 'TC-COUNT-001');
    assert.ok(failedIncrement);
    assert.equal(failedIncrement.status, 'failed');
    assert.ok(failedIncrement.actual.includes('"01"') || failedIncrement.errorDetails.includes('parseInt'));

    // Should include missing scenario recommendation
    const counterBug = results.testResults.missingScenarios.find(s => s.feature === 'Counter');
    assert.ok(counterBug);
    assert.ok(counterBug.issue.toLowerCase().includes('string concatenation'));
  });

  // ── Scenario 4: Identify edge cases for a calculator ───────────────────────
  test('Scenario 4: Identify edge cases for a calculator (division by zero, decimal precision, consecutive ops, negative numbers)', () => {
    const calculatorTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: `<!DOCTYPE html>
<html>
<body>
  <div id="calculator">
    <div id="display">0</div>
    <button class="digit">7</button><button class="digit">8</button><button class="digit">9</button>
    <button class="digit">4</button><button class="digit">5</button><button class="digit">6</button>
    <button class="digit">1</button><button class="digit">2</button><button class="digit">3</button>
    <button class="digit">0</button><button id="decimal">.</button>
    <button class="op" id="add">+</button><button class="op" id="sub">-</button>
    <button class="op" id="mul">*</button><button class="op" id="div">/</button>
    <button id="equals">=</button>
  </div>
  <script src="calc.js"></script>
</body>
</html>`,
      },
      'calc.js': {
        type: 'file',
        name: 'calc.js',
        value: `let current = '';
function compute(a, b, op) {
  // BUG: no check for b === 0 when op === '/'
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') return a / b;
}
console.log('Calculator ready');`,
      },
    };

    const plan = executeTool('generate_test_plan', { feature: 'calculator' }, calculatorTree);
    assert.equal(plan.success, true);
    assert.ok(plan.testPlan.featuresDetected.includes('Calculator'));

    // Check edge case 1: Division by zero
    const divZero = plan.testPlan.testCases.find(t => t.id === 'TC-CALC-002');
    assert.ok(divZero, 'Should include division by zero edge case');
    assert.ok(divZero.description.toLowerCase().includes('zero'));
    assert.equal(divZero.status, 'failed', 'Should detect missing division by zero check');

    // Check edge case 2: Multiple decimals
    const multiDec = plan.testPlan.testCases.find(t => t.id === 'TC-CALC-003');
    assert.ok(multiDec, 'Should include multiple decimal points edge case');

    // Check edge case 3: Consecutive operators
    const consecOps = plan.testPlan.testCases.find(t => t.id === 'TC-CALC-004');
    assert.ok(consecOps, 'Should include consecutive operators edge case');

    // Check edge case 4: Negative numbers
    const negNum = plan.testPlan.testCases.find(t => t.id === 'TC-CALC-005');
    assert.ok(negNum, 'Should include negative numbers edge case');

    // Verify checklist includes calculator items
    assert.ok(plan.testPlan.checklist.some(c => c.item.includes('Division by Zero')));
    assert.ok(plan.testPlan.checklist.some(c => c.item.includes('Decimal Precision')));
  });

  // ── Scenario 5: Analyze a failing test and explain its cause ───────────────
  test('Scenario 5: Analyze a failing test and explain its cause with root cause analysis', () => {
    const failingTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: `<!DOCTYPE html>
<html>
<body>
  <div id="counter">0</div>
  <button id="increment">+1</button>
  <button id="decrement">-1</button>
  <script src="script.js"></script>
</body>
</html>`,
      },
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: `const counter = document.getElementById('counter');
document.getElementById('increment').addEventListener('click', () => {
  counter.textContent = counter.textContent + 1;
});`,
      },
    };

    const run = executeTool('run_project_tests', {}, failingTree);
    assert.equal(run.success, true);
    assert.ok(run.testResults.summary.failed >= 1);

    const failed = run.testResults.results.find(r => r.status === 'failed');
    assert.ok(failed);
    assert.ok(failed.expected, 'Must include expected result');
    assert.ok(failed.actual, 'Must include actual result');
    assert.ok(failed.errorDetails, 'Must include clear error details');
    assert.ok(failed.errorDetails.includes('parseInt') || failed.errorDetails.includes('string'));
  });

  // ── Scenario 6: Verify that rejected fixes leave files unchanged ────────────
  test('Scenario 6: Verify that rejected fixes leave files unchanged', () => {
    const originalTree = {
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: 'let count = counter.textContent + 1;',
      },
    };

    // Agent proposes a fix
    const propRes = executeTool('propose_file_edit', {
      path: 'script.js',
      content: 'let count = parseInt(counter.textContent, 10) + 1;',
      explanation: 'Fix string concatenation bug by parsing integer.',
    }, originalTree, 'room-test-reject');

    assert.equal(propRes.success, true);
    const proposalId = propRes.proposal.proposalId;

    // User rejects the proposal
    const rejectRes = rejectProposal(proposalId);
    assert.equal(rejectRes.success, true);

    // Attempting to apply a rejected proposal must fail
    const applyAttempt = applyProposal(proposalId, { currentFileTree: originalTree });
    assert.equal(applyAttempt.success, false);
    assert.ok(applyAttempt.error.includes('rejected'));

    // Confirm file content was NOT changed
    assert.equal(originalTree['script.js'].value, 'let count = counter.textContent + 1;');
  });

  // ── Scenario 7: Verify that approved fixes use existing Phase 2 workflow ───
  test('Scenario 7: Verify that approved fixes use existing Phase 2 workflow', () => {
    const targetTree = {
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: 'let count = counter.textContent + 1;',
      },
    };

    // Agent proposes a bug fix for the failing test
    const propRes = executeTool('propose_file_edit', {
      path: 'script.js',
      content: 'let count = parseInt(counter.textContent, 10) + 1;',
      explanation: 'Fix string concatenation bug using parseInt.',
    }, targetTree, 'room-test-approve');

    assert.equal(propRes.success, true);
    assert.ok(propRes.proposal);
    assert.ok(propRes.proposal.changes[0].diff);

    // Apply the proposal (simulating user clicking Approve)
    const applyRes = applyProposal(propRes.proposal.proposalId, { currentFileTree: targetTree });
    assert.equal(applyRes.success, true);
    assert.ok(applyRes.appliedChanges);
    assert.equal(applyRes.appliedChanges[0].content, 'let count = parseInt(counter.textContent, 10) + 1;');

    // Sync to targetTree as the client / server handler does
    for (const change of applyRes.appliedChanges) {
      targetTree[change.path].value = change.content;
    }

    // Verify the file was updated with the exact reviewed fix
    assert.equal(targetTree['script.js'].value, 'let count = parseInt(counter.textContent, 10) + 1;');
  });

  // ── Scenario 8: Regression verification of Phase 1, Phase 2, and Phase 3 ──
  test('Scenario 8: Run all Phase 1, Phase 2, and Phase 3 regression tests', () => {
    const sampleTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: '<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body><h1 id="title">Hello</h1><script src="app.js"></script></body></html>',
      },
      'style.css': {
        type: 'file',
        name: 'style.css',
        value: '#title { color: blue; }',
      },
      'app.js': {
        type: 'file',
        name: 'app.js',
        value: 'const t = document.getElementById("title");\nconsole.log(t.textContent);',
      },
      '.env': {
        type: 'file',
        name: '.env',
        value: 'SECRET_KEY=leak_me',
      },
    };

    // Phase 1 regression: list_files excludes .env
    const listRes = executeTool('list_files', {}, sampleTree);
    assert.equal(listRes.success, true);
    assert.ok(!listRes.files.some(f => f.path.includes('.env')), 'Must not expose .env');

    // Phase 1 regression: read_file blocks traversal & sensitive files
    const readEnvRes = executeTool('read_file', { path: '.env' }, sampleTree);
    assert.equal(readEnvRes.success, false);
    const readTraversalRes = executeTool('read_file', { path: '../../etc/passwd' }, sampleTree);
    assert.equal(readTraversalRes.success, false);

    // Phase 1 regression: search_code works
    const searchRes = executeTool('search_code', { query: 'Hello' }, sampleTree);
    assert.equal(searchRes.success, true);
    assert.ok(searchRes.results.length >= 1);

    // Phase 2 regression: propose_file_edit generates diff
    const propRes = executeTool('propose_file_edit', {
      path: 'style.css',
      content: '#title { color: red; }',
    }, sampleTree, 'regression-room');
    assert.equal(propRes.success, true);
    assert.ok(propRes.proposal.changes[0].diff);

    // Phase 3 regression: diagnose_code works
    const diagRes = executeTool('diagnose_code', {}, sampleTree);
    assert.equal(diagRes.success, true);
    assert.equal(diagRes.diagnostics.summary.confirmedErrorCount, 0);

    // Phase 4 tool definitions are present
    const planTool = TOOL_DEFINITIONS.find(t => t.function.name === 'generate_test_plan');
    const runTool = TOOL_DEFINITIONS.find(t => t.function.name === 'run_project_tests');
    assert.ok(planTool, 'generate_test_plan definition exists');
    assert.ok(runTool, 'run_project_tests definition exists');
  });

});
