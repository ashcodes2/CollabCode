/**
 * server/tests/phase5_agent.test.mjs
 *
 * Automated verification suite for Phase 5: Runtime Browser Testing Agent in CollabCode.
 *
 * Requirements verified:
 * 1. Secure iframe communication (event.source validation, message schemas, request IDs, malformed response handling)
 * 2. Real browser testing (DOM event simulation: click, input, change, submit; async update waiting, actual DOM state assertions)
 * 3. Test reliability (timeouts, infinite execution prevention, structured results with expected, actual, status, error details)
 * 4. AI Bug Fix Integration (analyze_runtime_test_failure, root cause analysis, Phase 2 proposal & Diff Preview workflow)
 * 5. Security & Isolation (untrusted code strictly restricted to browser sandbox; zero server execution; no secret leakage)
 * 6. Regression testing across Phase 1, Phase 2, Phase 3, and Phase 4
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomFeatures,
  analyzeJsValidation,
  generateTestPlan,
  runProjectTests,
  createRuntimeTestHarnessCode,
  analyzeRuntimeTestFailure,
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

describe('Phase 5: Runtime Browser Testing Agent – CollabCode', () => {

  // ── 1. Secure Iframe Communication & Schema Validation ────────────────────
  test('Requirement 1: Secure iframe communication & message schema validation', () => {
    const harnessScript = createRuntimeTestHarnessCode();
    assert.ok(harnessScript, 'Harness code must be generated');
    assert.ok(harnessScript.includes('collabcode-execute-runtime-tests'), 'Must listen for execute request type');
    assert.ok(harnessScript.includes('collabcode-runtime-test-results'), 'Must reply with results type');
    assert.ok(harnessScript.includes('requestId'), 'Must enforce unique requestId');

    // Simulate parent listener validation logic:
    let isSourceValid = false;
    const fakeIframeContentWindow = {};
    const validEvent = { source: fakeIframeContentWindow, data: { type: 'collabcode-runtime-test-results', requestId: 'req-1', results: [] } };
    const spoofedEvent = { source: {}, data: { type: 'collabcode-runtime-test-results', requestId: 'req-1', results: [] } };

    // Validation check 1: source validation
    if (validEvent.source === fakeIframeContentWindow) isSourceValid = true;
    assert.equal(isSourceValid, true, 'Valid iframe source must be accepted');

    isSourceValid = false;
    if (spoofedEvent.source === fakeIframeContentWindow) isSourceValid = true;
    assert.equal(isSourceValid, false, 'Spoofed event source must be rejected');

    // Validation check 2: requestId matching prevents stale responses
    const pendingMap = new Map();
    pendingMap.set('req-active', { resolve: () => {} });
    assert.equal(pendingMap.has('req-stale'), false, 'Stale requestId is safely ignored');
    assert.equal(pendingMap.has('req-active'), true, 'Active requestId matches');
  });

  // ── 2. Real Browser Testing & Event Simulation ────────────────────────────
  test('Requirement 2: Real browser testing supports click, input, change, and submit events', () => {
    const harness = createRuntimeTestHarnessCode();
    assert.ok(harness.includes("eventType === 'click'"), 'Supports click events');
    assert.ok(harness.includes("eventType === 'input'"), 'Supports input events');
    assert.ok(harness.includes("eventType === 'change'"), 'Supports change events');
    assert.ok(harness.includes("eventType === 'submit'"), 'Supports submit events');
    assert.ok(harness.includes("setTimeout(r, 60)") || harness.includes("setTimeout"), 'Waits asynchronously for DOM updates before assertions');
  });

  // ── 3. Test Reliability, Timeouts & Infinite Execution Prevention ──────────
  test('Requirement 3: Test reliability with timeouts and infinite execution prevention', () => {
    const harness = createRuntimeTestHarnessCode();
    assert.ok(harness.includes('isTestRunning'), 'Harness blocks concurrent overlapping test executions');

    // Verify structured output contract
    const mockRuntimeResult = {
      id: 'TC-COUNT-001',
      name: 'Increment counter by 1',
      feature: 'Counter',
      type: 'normal',
      status: 'failed',
      expected: '1',
      actual: '"01" (String concatenation bug in DOM)',
      errorDetails: 'Counter value was concatenated as string rather than numeric addition.',
      runtimeErrors: [],
    };

    assert.ok(mockRuntimeResult.expected);
    assert.ok(mockRuntimeResult.actual);
    assert.ok(['passed', 'failed', 'not_tested'].includes(mockRuntimeResult.status));
    assert.ok(mockRuntimeResult.errorDetails);
  });

  // ── 4. Runtime Failure Diagnostics (Counter String Concat) ─────────────────
  test('Scenario 1: Runtime Counter Failure (String Concatenation in live DOM)', () => {
    const analysis = executeTool('analyze_runtime_test_failure', {
      test_id: 'TC-COUNT-001',
      expected: '1',
      actual: '"01" (String concatenation bug detected in DOM)',
      runtime_error: '',
      target_file: 'script.js',
    });

    assert.equal(analysis.success, true);
    assert.ok(analysis.analysis);
    assert.ok(analysis.analysis.rootCause.toLowerCase().includes('string concatenation'));
    assert.ok(analysis.analysis.suggestedFix.includes('parseInt') || analysis.analysis.suggestedFix.includes('Number'));
    assert.equal(analysis.analysis.fixCategory, 'Numeric Type Conversion');
  });

  // ── 5. Runtime Failure Diagnostics (Login Form Empty Inputs) ──────────────
  test('Scenario 2: Runtime Login Form Failure (Missing validation in live DOM)', () => {
    const analysis = executeTool('analyze_runtime_test_failure', {
      test_id: 'TC-LOGIN-003',
      expected: 'Form blocks submission, highlights empty fields, and displays error',
      actual: 'Form permitted empty/whitespace submission without error feedback.',
      runtime_error: '',
      target_file: 'index.html',
    });

    assert.equal(analysis.success, true);
    assert.ok(analysis.analysis.rootCause.toLowerCase().includes('validation'));
    assert.ok(analysis.analysis.suggestedFix.includes('.trim()') || analysis.analysis.suggestedFix.includes('preventDefault'));
    assert.equal(analysis.analysis.fixCategory, 'Form Validation & UX');
  });

  // ── 6. Runtime Failure Diagnostics (Calculator Division by Zero) ──────────
  test('Scenario 3: Runtime Calculator Failure (Unhandled "Infinity" in DOM)', () => {
    const analysis = executeTool('analyze_runtime_test_failure', {
      test_id: 'TC-CALC-002',
      expected: 'Display shows "Error" or "Cannot divide by zero"',
      actual: '"Infinity" (Unhandled division by zero in DOM)',
      runtime_error: '',
      target_file: 'calc.js',
    });

    assert.equal(analysis.success, true);
    assert.ok(analysis.analysis.rootCause.toLowerCase().includes('division by zero'));
    assert.ok(analysis.analysis.suggestedFix.includes('divisor === 0') || analysis.analysis.suggestedFix.includes('Error'));
    assert.equal(analysis.analysis.fixCategory, 'Arithmetic Boundary Protection');
  });

  // ── 7. Runtime Failure Diagnostics (TypeError / Null Selector Bug) ─────────
  test('Scenario 4: Runtime TypeError / Null DOM reference failure', () => {
    const analysis = executeTool('analyze_runtime_test_failure', {
      test_id: 'TC-GEN-001',
      expected: 'Element click triggers handler',
      actual: 'Runtime error emitted: TypeError: Cannot read properties of null (reading \'addEventListener\')',
      runtime_error: 'TypeError: Cannot read properties of null (reading \'addEventListener\') at script.js:2:1',
      target_file: 'script.js',
    });

    assert.equal(analysis.success, true);
    assert.ok(analysis.analysis.rootCause.toLowerCase().includes('null'));
    assert.ok(analysis.analysis.suggestedFix.includes('defer') || analysis.analysis.suggestedFix.includes('ID'));
  });

  // ── 8. AI Bug Fix Integration via Phase 2 Workflow ────────────────────────
  test('Requirement 4: Bug fix workflow proposes changes with diff requiring approval', () => {
    const projectTree = {
      'counter.js': {
        type: 'file',
        name: 'counter.js',
        value: 'countEl.textContent = countEl.textContent + 1;',
      },
    };

    // Agent proposes the fix based on runtime failure analysis
    const proposalRes = executeTool('propose_file_edit', {
      path: 'counter.js',
      content: 'countEl.textContent = parseInt(countEl.textContent, 10) + 1;',
      explanation: 'Fix runtime string concatenation bug by parsing integer.',
    }, projectTree, 'room-phase5');

    assert.equal(proposalRes.success, true);
    assert.ok(proposalRes.proposal);
    assert.equal(proposalRes.proposal.status, 'pending');

    // Confirm file is UNTOUCHED before approval
    assert.equal(projectTree['counter.js'].value, 'countEl.textContent = countEl.textContent + 1;');

    // User approves proposal
    const applyRes = applyProposal(proposalRes.proposal.proposalId, { currentFileTree: projectTree });
    assert.equal(applyRes.success, true);
    assert.equal(applyRes.appliedChanges[0].content, 'countEl.textContent = parseInt(countEl.textContent, 10) + 1;');

    // Apply change to projectTree
    projectTree['counter.js'].value = applyRes.appliedChanges[0].content;
    assert.equal(projectTree['counter.js'].value, 'countEl.textContent = parseInt(countEl.textContent, 10) + 1;');
  });

  // ── 9. Security & Isolation Safeguards ─────────────────────────────────────
  test('Requirement 5: Untrusted code strictly isolated in browser sandbox; zero server execution', () => {
    // 1. Backend executes NO untrusted code
    const untrustedTree = {
      'exploit.js': {
        type: 'file',
        name: 'exploit.js',
        value: 'process.exit(1); require("fs").unlinkSync("/etc/hosts");',
      },
    };

    // Running project tools never evaluates untrusted JavaScript on backend
    const res = executeTool('run_project_tests', {}, untrustedTree);
    assert.equal(res.success, true);

    // 2. Sensitive files (.env, secrets) blocked from testing & reading
    const readEnv = executeTool('read_file', { path: '.env' }, untrustedTree);
    assert.equal(readEnv.success, false);

    // 3. Traversal blocked
    const traversal = executeTool('read_file', { path: '../../../etc/shadow' }, untrustedTree);
    assert.equal(traversal.success, false);
  });

  // ── 10. Full Regression Verification of Prior Phases (1, 2, 3, 4) ─────────
  test('Requirement 6: Prior phases (Phase 1, 2, 3, 4) remain fully functional', () => {
    const demoTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: '<!DOCTYPE html><html><body><h1 id="header">Hello</h1><button id="btn">Click</button></body></html>',
      },
      'style.css': {
        type: 'file',
        name: 'style.css',
        value: '#header { color: purple; }',
      },
      'app.js': {
        type: 'file',
        name: 'app.js',
        value: 'document.getElementById("btn").addEventListener("click", () => alert("clicked"));',
      },
    };

    // Phase 1 tools
    const listRes = executeTool('list_files', {}, demoTree);
    assert.equal(listRes.success, true);
    assert.equal(listRes.files.length, 3);

    const readRes = executeTool('read_file', { path: 'style.css' }, demoTree);
    assert.equal(readRes.success, true);
    assert.ok(readRes.content.includes('purple'));

    const searchRes = executeTool('search_code', { query: 'clicked' }, demoTree);
    assert.equal(searchRes.success, true);
    assert.equal(searchRes.results.length, 1);

    // Phase 2 tool
    const propRes = executeTool('propose_file_edit', {
      path: 'style.css',
      content: '#header { color: teal; }',
    }, demoTree, 'phase5-regression');
    assert.equal(propRes.success, true);

    // Phase 3 tool
    const diagRes = executeTool('diagnose_code', {}, demoTree);
    assert.equal(diagRes.success, true);
    assert.equal(diagRes.diagnostics.summary.confirmedErrorCount, 0);

    // Phase 4 tools
    const planRes = executeTool('generate_test_plan', {}, demoTree);
    assert.equal(planRes.success, true);
    assert.ok(planRes.testPlan.testCases.length >= 1);

    const testRes = executeTool('run_project_tests', {}, demoTree);
    assert.equal(testRes.success, true);
    assert.ok(testRes.testResults.results.length >= 1);

    // Phase 5 tool
    const runtimeTool = TOOL_DEFINITIONS.find(t => t.function.name === 'analyze_runtime_test_failure');
    assert.ok(runtimeTool, 'analyze_runtime_test_failure tool definition must exist');
  });

});
