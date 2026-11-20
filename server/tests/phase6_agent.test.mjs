/**
 * server/tests/phase6_agent.test.mjs
 *
 * Automated test suite for Phase 6: Multi-Step Task Execution Agent in CollabCode.
 *
 * Tests:
 * 1. Plan generation with structured steps, dependencies, target files, and verification criteria
 * 2. Dependency resolution and cycle detection (DAG validation)
 * 3. User plan approval gateway (awaiting_user_approval -> approve, reject)
 * 4. Plan modification with re-validation of dependency graph
 * 5. State persistence and recovery (serialization/deserialization without state loss)
 * 6. Approval-aware sequential execution and prerequisite gating
 * 7. Idempotency and duplicate execution prevention
 * 8. Automatic failure recovery with strict max 2 attempts and blocked state enforcement
 * 9. Execution controls: Pause, Resume, and Cancel
 * 10. Final execution summary generation and project tool integration
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createExecutionPlan,
  validateStepDependencies,
  handlePlanUserDecision,
  checkStepPrerequisites,
  updatePlanStep,
  controlPlanExecution,
  recordStepFailureAndCheckRecovery,
  generateExecutionSummary,
  createStepSignature,
  PLAN_STATUS,
  STEP_STATUS,
  MAX_RECOVERY_ATTEMPTS,
} from '../tools/taskExecutionEngine.js';

import {
  TOOL_DEFINITIONS,
  executeTool,
} from '../tools/projectTools.js';

describe('Phase 6: Multi-Step Task Execution Agent', () => {

  // ── Scenario 1: Plan Generation & Schema Validation ───────────────────────
  it('Scenario 1: creates structured execution plan with dependencies and initial awaiting_approval status', () => {
    const rawSteps = [
      {
        id: 'STEP-1',
        title: 'Structure Quiz HTML layout',
        description: 'Add quiz container, question card, and answer buttons to index.html',
        actionType: 'modify_file',
        targetFiles: ['index.html'],
        dependencies: [],
        verificationCriteria: 'HTML contains #quiz-container and #answer-buttons',
      },
      {
        id: 'STEP-2',
        title: 'Style Quiz Component',
        description: 'Add CSS styling for active question and button hover effects',
        actionType: 'modify_file',
        targetFiles: ['style.css'],
        dependencies: ['STEP-1'],
        verificationCriteria: 'CSS classes .quiz-card and .btn-answer exist',
      },
      {
        id: 'STEP-3',
        title: 'Implement Quiz Logic & Score Tracking',
        description: 'Add score calculation and question navigation in script.js',
        actionType: 'modify_file',
        targetFiles: ['script.js'],
        dependencies: ['STEP-1', 'STEP-2'],
        verificationCriteria: 'script.js defines loadQuestion and checkAnswer',
      },
    ];

    const plan = createExecutionPlan({
      title: 'Interactive Quiz Feature',
      goal: 'Build interactive multi-question quiz with score tracking and responsive styling',
      steps: rawSteps,
      roomId: 'room-phase6-test',
    });

    assert.ok(plan.planId.startsWith('plan-'), 'Plan should have unique ID starting with plan-');
    assert.equal(plan.title, 'Interactive Quiz Feature');
    assert.equal(plan.status, PLAN_STATUS.AWAITING_APPROVAL, 'Initial plan must await user approval');
    assert.equal(plan.steps.length, 3, 'Must retain all 3 planned steps');
    assert.equal(plan.steps[0].id, 'STEP-1');
    assert.equal(plan.steps[0].status, STEP_STATUS.PENDING);
    assert.deepEqual(plan.steps[1].dependencies, ['STEP-1']);
    assert.deepEqual(plan.allTargetFiles.sort(), ['index.html', 'script.js', 'style.css'].sort());
    assert.equal(plan.stats.progressPercent, 0);
  });

  // ── Scenario 2: Dependency Resolution & Cycle Detection ───────────────────
  it('Scenario 2: validates dependency ordering and detects cyclic dependencies', () => {
    // Valid linear dependencies
    const validSteps = [
      { id: 'A', dependencies: [] },
      { id: 'B', dependencies: ['A'] },
      { id: 'C', dependencies: ['B'] },
    ];
    const validResult = validateStepDependencies(validSteps);
    assert.equal(validResult.valid, true);
    assert.deepEqual(validResult.executionOrder, ['A', 'B', 'C']);

    // Circular dependency: A -> B -> C -> A
    const cyclicSteps = [
      { id: 'A', dependencies: ['C'] },
      { id: 'B', dependencies: ['A'] },
      { id: 'C', dependencies: ['B'] },
    ];
    const cyclicResult = validateStepDependencies(cyclicSteps);
    assert.equal(cyclicResult.valid, false);
    assert.match(cyclicResult.error, /Circular dependency detected/i);

    // Self dependency: A -> A
    const selfDepSteps = [
      { id: 'A', dependencies: ['A'] },
    ];
    const selfResult = validateStepDependencies(selfDepSteps);
    assert.equal(selfResult.valid, false);
    assert.match(selfResult.error, /cannot depend on itself/i);

    // Unknown dependency: B depends on non-existent X
    const unknownDepSteps = [
      { id: 'B', dependencies: ['X'] },
    ];
    const unknownResult = validateStepDependencies(unknownDepSteps);
    assert.equal(unknownResult.valid, false);
    assert.match(unknownResult.error, /depends on unknown step "X"/i);
  });

  // ── Scenario 3: Plan Approval Gateway (Approve & Reject) ───────────────────
  it('Scenario 3: enforces plan approval gateway before execution starts', () => {
    const plan = createExecutionPlan({
      title: 'Dark Mode Switcher',
      goal: 'Add dark mode theme toggle with localStorage persistence',
      steps: [
        { id: 'STEP-1', title: 'Add toggle markup', actionType: 'modify_file', targetFiles: ['index.html'], dependencies: [] },
      ],
    });

    assert.equal(plan.status, PLAN_STATUS.AWAITING_APPROVAL);

    // Approve Plan
    const approvedPlan = handlePlanUserDecision(plan, 'approve', { feedback: 'Looks good' });
    assert.equal(approvedPlan.status, PLAN_STATUS.APPROVED);
    assert.equal(approvedPlan.userApproval.status, 'approved');
    assert.ok(approvedPlan.userApproval.approvedAt);

    // Reject Plan
    const rejectedPlan = handlePlanUserDecision(plan, 'reject', { rejectionReason: 'Too complex' });
    assert.equal(rejectedPlan.status, PLAN_STATUS.REJECTED);
    assert.equal(rejectedPlan.userApproval.status, 'rejected');
    assert.equal(rejectedPlan.userApproval.rejectionReason, 'Too complex');
  });

  // ── Scenario 4: Plan Modification with Dependency Re-Validation ───────────
  it('Scenario 4: modifies plan and safely regenerates dependency graph', () => {
    const plan = createExecutionPlan({
      title: 'Counter App',
      goal: 'Build counter with increment and decrement',
      steps: [
        { id: 'STEP-1', title: 'Markup', actionType: 'modify_file', targetFiles: ['index.html'], dependencies: [] },
      ],
    });

    const modifiedSteps = [
      { id: 'STEP-1', title: 'Markup', actionType: 'modify_file', targetFiles: ['index.html'], dependencies: [] },
      { id: 'STEP-2', title: 'Styles', actionType: 'modify_file', targetFiles: ['style.css'], dependencies: ['STEP-1'] },
      { id: 'STEP-3', title: 'JS Logic', actionType: 'modify_file', targetFiles: ['script.js'], dependencies: ['STEP-2'] },
    ];

    const modifiedPlan = handlePlanUserDecision(plan, 'modify', {
      modifiedSteps,
      feedback: 'Add style and JS steps',
    });

    assert.equal(modifiedPlan.steps.length, 3);
    assert.equal(modifiedPlan.status, PLAN_STATUS.AWAITING_APPROVAL, 'Modified plan must await user approval again');
    assert.equal(modifiedPlan.userApproval.status, 'modified');
    assert.deepEqual(modifiedPlan.executionOrder, ['STEP-1', 'STEP-2', 'STEP-3']);
  });

  // ── Scenario 5: Persistent State & Refresh Recovery ───────────────────────
  it('Scenario 5: preserves task plan and execution state across serialization/deserialization', () => {
    const plan = createExecutionPlan({
      title: 'Persistent Task Test',
      goal: 'Validate state persistence across page reload or API reconnect',
      steps: [
        { id: 'STEP-1', title: 'Step 1', actionType: 'modify_file', targetFiles: ['index.html'], dependencies: [] },
        { id: 'STEP-2', title: 'Step 2', actionType: 'modify_file', targetFiles: ['style.css'], dependencies: ['STEP-1'] },
      ],
    });

    const approved = handlePlanUserDecision(plan, 'approve');
    const running = updatePlanStep(approved, 'STEP-1', {
      status: STEP_STATUS.COMPLETED,
      outputSummary: 'Added index.html header',
      proposalId: 'prop-12345',
      proposalStatus: 'applied',
    });

    // Simulate serialization to localStorage or JSON session storage
    const serialized = JSON.stringify(running);
    const restored = JSON.parse(serialized);

    assert.equal(restored.planId, plan.planId);
    assert.equal(restored.steps[0].status, STEP_STATUS.COMPLETED);
    assert.equal(restored.steps[0].proposals[0].id, 'prop-12345');
    assert.equal(restored.stats.completedSteps, 1);
    assert.equal(restored.stats.progressPercent, 50);
    assert.equal(restored.currentStepIndex, 1, 'Restored pointer must point to next pending step STEP-2');
  });

  // ── Scenario 6: Approval-Aware Execution & Prerequisite Gating ────────────
  it('Scenario 6: prevents execution of dependent steps while prerequisite steps are incomplete', () => {
    const plan = createExecutionPlan({
      title: 'Prerequisite Test',
      goal: 'Ensure step 2 cannot run until step 1 finishes',
      steps: [
        { id: 'STEP-1', title: 'Base Step', actionType: 'modify_file', targetFiles: ['index.html'], dependencies: [] },
        { id: 'STEP-2', title: 'Dependent Step', actionType: 'modify_file', targetFiles: ['script.js'], dependencies: ['STEP-1'] },
      ],
    });

    // Step 2 should be blocked because Step 1 is pending
    const checkBefore = checkStepPrerequisites(plan, 'STEP-2');
    assert.equal(checkBefore.allowed, false);
    assert.match(checkBefore.reason, /Prerequisite step\(s\) not completed/i);

    // Complete Step 1
    const step1Done = updatePlanStep(plan, 'STEP-1', {
      status: STEP_STATUS.COMPLETED,
      outputSummary: 'Step 1 completed successfully',
    });

    // Step 2 should now be allowed
    const checkAfter = checkStepPrerequisites(step1Done, 'STEP-2');
    assert.equal(checkAfter.allowed, true);
  });

  // ── Scenario 7: Idempotency & Duplicate Prevention ────────────────────────
  it('Scenario 7: generates deterministic step signatures to prevent duplicate execution', () => {
    const planId = 'plan-test-123';
    const stepId = 'STEP-1';
    const data1 = { targetFiles: ['index.html'], action: 'create' };
    const data2 = { targetFiles: ['index.html'], action: 'create' };
    const data3 = { targetFiles: ['style.css'], action: 'modify' };

    const sig1 = createStepSignature(planId, stepId, data1);
    const sig2 = createStepSignature(planId, stepId, data2);
    const sig3 = createStepSignature(planId, stepId, data3);

    assert.equal(sig1, sig2, 'Identical plan step and input must produce identical signature');
    assert.notEqual(sig1, sig3, 'Different step input must produce different signature');
  });

  // ── Scenario 8: Automatic Failure Recovery (Max 2 Attempts) ───────────────
  it('Scenario 8: permits up to 2 recovery attempts before marking step as BLOCKED without silent skipping', () => {
    const plan = createExecutionPlan({
      title: 'Recovery Test',
      goal: 'Test automatic recovery limit',
      steps: [
        { id: 'STEP-1', title: 'Faulty Step', actionType: 'modify_file', targetFiles: ['script.js'], dependencies: [] },
      ],
    });

    // Failure attempt 1
    const attempt1 = recordStepFailureAndCheckRecovery(plan, 'STEP-1', 'SyntaxError: Unexpected token');
    assert.equal(attempt1.canRetry, true);
    assert.equal(attempt1.attempt, 1);
    assert.equal(attempt1.plan.steps[0].status, STEP_STATUS.FAILED);
    assert.match(attempt1.message, /attempt 1\/2/i);

    // Failure attempt 2
    const attempt2 = recordStepFailureAndCheckRecovery(attempt1.plan, 'STEP-1', 'TypeError: Cannot read properties of null');
    assert.equal(attempt2.canRetry, true);
    assert.equal(attempt2.attempt, 2);
    assert.equal(attempt2.plan.steps[0].status, STEP_STATUS.FAILED);
    assert.match(attempt2.message, /attempt 2\/2/i);

    // Failure attempt 3: Exceeded limit -> BLOCKED
    const attempt3 = recordStepFailureAndCheckRecovery(attempt2.plan, 'STEP-1', 'Still failing after recovery');
    assert.equal(attempt3.canRetry, false, 'Cannot retry after reaching max recovery attempts');
    assert.equal(attempt3.attempt, 3);
    assert.equal(attempt3.plan.steps[0].status, STEP_STATUS.BLOCKED, 'Step must be explicitly marked BLOCKED');
    assert.equal(attempt3.plan.status, PLAN_STATUS.BLOCKED, 'Overall plan status must become BLOCKED');
    assert.match(attempt3.message, /BLOCKED/i);
  });

  // ── Scenario 9: Execution Controls: Pause, Resume, and Cancel ─────────────
  it('Scenario 9: correctly pauses, resumes, and cancels active plans', () => {
    const plan = createExecutionPlan({
      title: 'Controls Test',
      goal: 'Verify Pause, Resume, and Cancel execution controls',
      steps: [
        { id: 'STEP-1', title: 'Step 1', actionType: 'modify_file', targetFiles: ['index.html'], dependencies: [] },
        { id: 'STEP-2', title: 'Step 2', actionType: 'modify_file', targetFiles: ['style.css'], dependencies: ['STEP-1'] },
      ],
    });

    const approved = handlePlanUserDecision(plan, 'approve');
    const running = updatePlanStep(approved, 'STEP-1', { status: STEP_STATUS.IN_PROGRESS });
    assert.equal(running.status, PLAN_STATUS.IN_PROGRESS);

    // Pause
    const paused = controlPlanExecution(running, 'pause', 'User requested pause');
    assert.equal(paused.status, PLAN_STATUS.PAUSED);
    assert.equal(paused.pauseReason, 'User requested pause');

    // Resume
    const resumed = controlPlanExecution(paused, 'resume');
    assert.equal(resumed.status, PLAN_STATUS.IN_PROGRESS);
    assert.equal(resumed.pauseReason, null);

    // Cancel
    const cancelled = controlPlanExecution(resumed, 'cancel', 'User stopped the task');
    assert.equal(cancelled.status, PLAN_STATUS.CANCELLED);
    assert.equal(cancelled.steps[0].status, STEP_STATUS.SKIPPED);
    assert.equal(cancelled.steps[1].status, STEP_STATUS.SKIPPED);
  });

  // ── Scenario 10: Final Execution Summary & Project Tools Integration ──────
  it('Scenario 10: generates comprehensive execution summary and verifies tool integration', () => {
    // Verify tool definitions include Phase 6 tools
    const planTool = TOOL_DEFINITIONS.find(t => t.function.name === 'create_task_plan');
    const stepTool = TOOL_DEFINITIONS.find(t => t.function.name === 'update_task_step');

    assert.ok(planTool, 'create_task_plan must be defined in TOOL_DEFINITIONS');
    assert.ok(stepTool, 'update_task_step must be defined in TOOL_DEFINITIONS');

    // Execute create_task_plan via executeTool
    const fileTree = {
      'index.html': { content: '<html><body></body></html>', type: 'file' },
      'style.css': { content: 'body { color: black; }', type: 'file' },
    };

    const toolResult = executeTool('create_task_plan', {
      title: 'Full E2E Task',
      goal: 'Create responsive card with styles',
      steps: [
        { id: 'STEP-1', title: 'Add Card HTML', actionType: 'modify_file', targetFiles: ['index.html'], dependencies: [] },
        { id: 'STEP-2', title: 'Add Card CSS', actionType: 'modify_file', targetFiles: ['style.css'], dependencies: ['STEP-1'] },
      ],
    }, fileTree, 'room-e2e-summary');

    assert.equal(toolResult.success, true);
    assert.ok(toolResult.taskPlan);
    assert.equal(toolResult.taskPlan.steps.length, 2);

    // Simulate completion of both steps
    let plan = toolResult.taskPlan;
    plan = updatePlanStep(plan, 'STEP-1', { status: STEP_STATUS.COMPLETED });
    plan = updatePlanStep(plan, 'STEP-2', { status: STEP_STATUS.COMPLETED });

    assert.equal(plan.status, PLAN_STATUS.COMPLETED);

    // Generate execution summary
    const summary = generateExecutionSummary(plan, {
      modifiedFiles: ['index.html', 'style.css'],
      testResults: { summary: { passed: 4, failed: 0, notTested: 0, total: 4 } },
    });

    assert.equal(summary.isSuccess, true);
    assert.equal(summary.stats.completedSteps, 2);
    assert.equal(summary.stats.failedSteps, 0);
    assert.deepEqual(summary.modifiedFiles, ['index.html', 'style.css']);
    assert.equal(summary.tests.passed, 4);
    assert.match(summary.summaryText, /Successfully executed all 2 planned steps/i);
  });

});
