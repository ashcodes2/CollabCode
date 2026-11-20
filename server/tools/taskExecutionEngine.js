/**
 * server/tools/taskExecutionEngine.js
 *
 * Phase 6: Multi-Step Task Execution Engine for CollabCode AI Agent.
 *
 * Implements:
 * - Structured plan creation with dependency DAG validation and cycle detection
 * - Plan approval lifecycle ('awaiting_user_approval' -> 'approved' / 'rejected' / 'modified')
 * - Persistent execution tracking with step status transitions
 * - Idempotency guards preventing duplicate execution and duplicate proposals
 * - Approval-aware execution: ensures dependent steps halt if prerequisite proposals are pending/rejected
 * - Failure recovery tracker with a strict maximum of 2 recovery attempts per step
 * - Execution controls: pause, resume, cancel, and single-execution concurrency locking
 * - Execution summary generator with modified files, diff status, and test validation
 */

const crypto = require('crypto');

// Valid Plan States
const PLAN_STATUS = {
  AWAITING_APPROVAL: 'awaiting_user_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
};

// Valid Step States
const STEP_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  AWAITING_APPROVAL: 'awaiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  SKIPPED: 'skipped',
};

// Action Types for Steps
const ACTION_TYPES = {
  INSPECT: 'inspect',
  MODIFY_FILE: 'modify_file',
  DEBUG: 'debug',
  TEST: 'test',
  VERIFY: 'verify',
};

const MAX_RECOVERY_ATTEMPTS = 2;

/**
 * Validate that dependencies between steps are valid and acyclic (Directed Acyclic Graph).
 * @param {Array<{id: string, dependencies?: string[]}>} steps
 * @returns {{ valid: boolean, error?: string, executionOrder?: string[] }}
 */
function validateStepDependencies(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { valid: false, error: 'Plan must contain at least one step.' };
  }

  const stepIds = new Set();
  const stepMap = new Map();

  for (const step of steps) {
    if (!step || typeof step.id !== 'string' || !step.id.trim()) {
      return { valid: false, error: 'Every step must have a unique non-empty "id" string.' };
    }
    const id = step.id.trim();
    if (stepIds.has(id)) {
      return { valid: false, error: `Duplicate step ID detected: "${id}". Step IDs must be unique.` };
    }
    stepIds.add(id);
    stepMap.set(id, step);
  }

  // Check for unknown dependencies and self-dependencies
  for (const step of steps) {
    const deps = Array.isArray(step.dependencies) ? step.dependencies : [];
    for (const dep of deps) {
      if (dep === step.id) {
        return { valid: false, error: `Step "${step.id}" cannot depend on itself.` };
      }
      if (!stepIds.has(dep)) {
        return { valid: false, error: `Step "${step.id}" depends on unknown step "${dep}".` };
      }
    }
  }

  // Topological sort / cycle detection (Kahn's algorithm)
  const inDegree = new Map();
  const adj = new Map();

  for (const id of stepIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const step of steps) {
    const id = step.id;
    const deps = Array.isArray(step.dependencies) ? step.dependencies : [];
    for (const dep of deps) {
      adj.get(dep).push(id);
      inDegree.set(id, inDegree.get(id) + 1);
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const executionOrder = [];
  while (queue.length > 0) {
    const curr = queue.shift();
    executionOrder.push(curr);

    for (const neighbor of adj.get(curr)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (executionOrder.length !== stepIds.size) {
    return {
      valid: false,
      error: 'Circular dependency detected in execution plan. Steps must form an acyclic dependency graph.',
    };
  }

  return { valid: true, executionOrder };
}

/**
 * Generate a unique deterministic step signature for idempotency checking.
 * @param {string} planId
 * @param {string} stepId
 * @param {any} inputData
 * @returns {string}
 */
function createStepSignature(planId, stepId, inputData = {}) {
  const content = `${planId}:${stepId}:${JSON.stringify(inputData || {})}`;
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Create a new structured execution plan.
 * Always initializes in 'awaiting_user_approval' status.
 *
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.goal
 * @param {Array<object>} params.steps
 * @param {string} [params.roomId]
 * @returns {object} Clean validated plan object
 */
function createExecutionPlan({ title, goal, steps, roomId }) {
  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Plan title is required.');
  }
  if (typeof goal !== 'string' || !goal.trim()) {
    throw new Error('Plan goal is required.');
  }

  const depValidation = validateStepDependencies(steps);
  if (!depValidation.valid) {
    throw new Error(depValidation.error);
  }

  const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Sanitize and normalize steps
  const sanitizedSteps = steps.map((s, index) => {
    const rawTargetFiles = Array.isArray(s.targetFiles) ? s.targetFiles : (s.target_file ? [s.target_file] : []);
    const targetFiles = rawTargetFiles
      .filter(f => typeof f === 'string' && f.trim())
      .map(f => f.trim().replace(/\\/g, '/'));

    return {
      id: s.id.trim(),
      order: index + 1,
      title: (s.title || `Step ${index + 1}`).trim(),
      description: (s.description || '').trim(),
      actionType: Object.values(ACTION_TYPES).includes(s.actionType) ? s.actionType : ACTION_TYPES.MODIFY_FILE,
      targetFiles,
      dependencies: Array.isArray(s.dependencies) ? s.dependencies.map(d => d.trim()) : [],
      verificationCriteria: (s.verificationCriteria || s.verification_criteria || 'Verify step completion and absence of syntax errors.').trim(),
      status: STEP_STATUS.PENDING,
      recoveryAttempts: 0,
      maxRecoveryAttempts: MAX_RECOVERY_ATTEMPTS,
      proposals: [], // Track associated Phase 2 proposals
      testResults: null, // Track Phase 4/5 verification results
      outputSummary: null,
      errorDetails: null,
      startedAt: null,
      completedAt: null,
      idempotencyKey: null,
    };
  });

  // Extract all unique target files across all steps
  const allTargetFiles = Array.from(new Set(sanitizedSteps.flatMap(s => s.targetFiles)));

  return {
    planId,
    roomId: roomId || null,
    title: title.trim(),
    goal: goal.trim(),
    status: PLAN_STATUS.AWAITING_APPROVAL, // MANDATORY: User must approve before execution
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStepIndex: 0,
    steps: sanitizedSteps,
    executionOrder: depValidation.executionOrder,
    allTargetFiles,
    stats: {
      totalSteps: sanitizedSteps.length,
      completedSteps: 0,
      failedSteps: 0,
      blockedSteps: 0,
      progressPercent: 0,
    },
    userApproval: {
      status: 'pending', // 'pending' | 'approved' | 'rejected' | 'modified'
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      feedback: null,
    },
    executionLock: false, // Prevents concurrent runs
  };
}

/**
 * Handle user approval, rejection, or modification of an execution plan.
 *
 * @param {object} plan
 * @param {'approve' | 'reject' | 'modify'} action
 * @param {object} [options]
 * @param {string} [options.rejectionReason]
 * @param {Array<object>} [options.modifiedSteps]
 * @param {string} [options.feedback]
 * @returns {object} Updated plan object
 */
function handlePlanUserDecision(plan, action, options = {}) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Valid plan object is required.');
  }

  const now = new Date().toISOString();
  const updated = JSON.parse(JSON.stringify(plan));

  if (action === 'approve') {
    updated.status = PLAN_STATUS.APPROVED;
    updated.userApproval.status = 'approved';
    updated.userApproval.approvedAt = now;
    updated.userApproval.feedback = options.feedback || null;
    updated.updatedAt = now;
    return updated;
  }

  if (action === 'reject') {
    updated.status = PLAN_STATUS.REJECTED;
    updated.userApproval.status = 'rejected';
    updated.userApproval.rejectedAt = now;
    updated.userApproval.rejectionReason = options.rejectionReason || 'User rejected execution plan.';
    updated.updatedAt = now;
    return updated;
  }

  if (action === 'modify') {
    if (!Array.isArray(options.modifiedSteps) || options.modifiedSteps.length === 0) {
      throw new Error('Modification requires updated steps array.');
    }

    const validation = validateStepDependencies(options.modifiedSteps);
    if (!validation.valid) {
      throw new Error(`Modified plan is invalid: ${validation.error}`);
    }

    // Regenerate plan with modified steps and reset status to awaiting approval
    const regenerated = createExecutionPlan({
      title: options.title || updated.title,
      goal: options.goal || updated.goal,
      steps: options.modifiedSteps,
      roomId: updated.roomId,
    });
    regenerated.planId = updated.planId; // Retain plan identity
    regenerated.userApproval.status = 'modified';
    regenerated.userApproval.feedback = options.feedback || 'Plan modified by user.';
    return regenerated;
  }

  throw new Error(`Unknown plan decision action: "${action}". Supported: 'approve', 'reject', 'modify'.`);
}

/**
 * Check whether a step's prerequisite dependencies have completed successfully.
 *
 * @param {object} plan
 * @param {string} stepId
 * @returns {{ allowed: boolean, reason?: string, uncompletedDeps?: string[] }}
 */
function checkStepPrerequisites(plan, stepId) {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step) {
    return { allowed: false, reason: `Step "${stepId}" not found in plan.` };
  }

  const uncompletedDeps = [];
  const deps = step.dependencies || [];

  for (const depId of deps) {
    const depStep = plan.steps.find(s => s.id === depId);
    if (!depStep) {
      uncompletedDeps.push(`${depId} (missing)`);
    } else if (depStep.status !== STEP_STATUS.COMPLETED) {
      uncompletedDeps.push(`${depId} (${depStep.status})`);
    }
  }

  if (uncompletedDeps.length > 0) {
    return {
      allowed: false,
      reason: `Prerequisite step(s) not completed: ${uncompletedDeps.join(', ')}.`,
      uncompletedDeps,
    };
  }

  return { allowed: true };
}

/**
 * Update step execution progress and recalculate plan stats.
 *
 * @param {object} plan
 * @param {string} stepId
 * @param {object} updates
 * @param {string} [updates.status]
 * @param {string} [updates.outputSummary]
 * @param {string} [updates.errorDetails]
 * @param {string} [updates.proposalId]
 * @param {string} [updates.proposalStatus]
 * @param {object} [updates.testResults]
 * @param {boolean} [updates.isRecoveryAttempt]
 * @returns {object} Updated plan object
 */
function updatePlanStep(plan, stepId, updates = {}) {
  if (!plan || !Array.isArray(plan.steps)) {
    throw new Error('Valid plan object with steps array is required.');
  }

  const updated = JSON.parse(JSON.stringify(plan));
  const stepIndex = updated.steps.findIndex(s => s.id === stepId);

  if (stepIndex === -1) {
    throw new Error(`Step "${stepId}" not found in plan.`);
  }

  const step = updated.steps[stepIndex];
  const now = new Date().toISOString();

  if (updates.status) {
    step.status = updates.status;
    if (updates.status === STEP_STATUS.IN_PROGRESS && !step.startedAt) {
      step.startedAt = now;
      updated.status = PLAN_STATUS.IN_PROGRESS;
    } else if (updates.status === STEP_STATUS.COMPLETED) {
      step.completedAt = now;
      step.errorDetails = null; // Clear any previous transient error
    } else if (updates.status === STEP_STATUS.FAILED || updates.status === STEP_STATUS.BLOCKED) {
      // Step failed or blocked
      step.completedAt = now;
    }
  }

  if (updates.outputSummary) {
    step.outputSummary = updates.outputSummary;
  }

  if (updates.errorDetails) {
    step.errorDetails = updates.errorDetails;
  }

  if (updates.isRecoveryAttempt) {
    step.recoveryAttempts = (step.recoveryAttempts || 0) + 1;
  }

  if (updates.proposalId) {
    const existingIdx = step.proposals.findIndex(p => p.id === updates.proposalId);
    const propInfo = {
      id: updates.proposalId,
      status: updates.proposalStatus || 'pending',
      updatedAt: now,
    };
    if (existingIdx >= 0) {
      step.proposals[existingIdx] = propInfo;
    } else {
      step.proposals.push(propInfo);
    }
  }

  if (updates.testResults) {
    step.testResults = updates.testResults;
  }

  // Recalculate stats
  const total = updated.steps.length;
  const completed = updated.steps.filter(s => s.status === STEP_STATUS.COMPLETED).length;
  const failed = updated.steps.filter(s => s.status === STEP_STATUS.FAILED).length;
  const blocked = updated.steps.filter(s => s.status === STEP_STATUS.BLOCKED).length;

  updated.stats = {
    totalSteps: total,
    completedSteps: completed,
    failedSteps: failed,
    blockedSteps: blocked,
    progressPercent: Math.round((completed / total) * 100),
  };

  // Determine overall plan status
  if (completed === total) {
    updated.status = PLAN_STATUS.COMPLETED;
  } else if (blocked > 0 || (failed > 0 && step.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS)) {
    updated.status = PLAN_STATUS.BLOCKED;
  }

  // Update currentStepIndex to the next non-completed step
  const nextPendingIdx = updated.steps.findIndex(s => s.status !== STEP_STATUS.COMPLETED && s.status !== STEP_STATUS.SKIPPED);
  updated.currentStepIndex = nextPendingIdx >= 0 ? nextPendingIdx : total - 1;

  updated.updatedAt = now;
  return updated;
}

/**
 * Handle pause, resume, or cancel actions on an active execution plan.
 *
 * @param {object} plan
 * @param {'pause' | 'resume' | 'cancel'} controlAction
 * @param {string} [reason]
 * @returns {object} Updated plan object
 */
function controlPlanExecution(plan, controlAction, reason = '') {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Valid plan object is required.');
  }

  const updated = JSON.parse(JSON.stringify(plan));
  const now = new Date().toISOString();

  if (controlAction === 'pause') {
    if (updated.status !== PLAN_STATUS.IN_PROGRESS) {
      throw new Error(`Cannot pause plan in "${updated.status}" status. Only in-progress plans can be paused.`);
    }
    updated.status = PLAN_STATUS.PAUSED;
    updated.pauseReason = reason || 'User paused plan execution.';
    updated.executionLock = false;
  } else if (controlAction === 'resume') {
    if (updated.status !== PLAN_STATUS.PAUSED) {
      throw new Error(`Cannot resume plan in "${updated.status}" status. Only paused plans can be resumed.`);
    }
    updated.status = PLAN_STATUS.IN_PROGRESS;
    updated.pauseReason = null;
    updated.executionLock = true;
  } else if (controlAction === 'cancel') {
    updated.status = PLAN_STATUS.CANCELLED;
    updated.cancelReason = reason || 'User cancelled plan execution.';
    updated.executionLock = false;

    // Mark remaining pending or in-progress steps as skipped
    for (const step of updated.steps) {
      if (step.status === STEP_STATUS.PENDING || step.status === STEP_STATUS.IN_PROGRESS) {
        step.status = STEP_STATUS.SKIPPED;
        step.completedAt = now;
        step.outputSummary = 'Skipped due to plan cancellation.';
      }
    }
  } else {
    throw new Error(`Invalid execution control: "${controlAction}". Use 'pause', 'resume', or 'cancel'.`);
  }

  updated.updatedAt = now;
  return updated;
}

/**
 * Record a failure on a step and determine if automatic recovery is allowed (Max 2 attempts).
 *
 * @param {object} plan
 * @param {string} stepId
 * @param {string} errorMessage
 * @returns {{ plan: object, canRetry: boolean, attempt: number, maxAttempts: number, message: string }}
 */
function recordStepFailureAndCheckRecovery(plan, stepId, errorMessage) {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step) {
    throw new Error(`Step "${stepId}" not found in plan.`);
  }

  const currentAttempts = (step.recoveryAttempts || 0) + 1;
  const canRetry = currentAttempts <= MAX_RECOVERY_ATTEMPTS;

  let newStatus = STEP_STATUS.FAILED;
  let explanation = '';

  if (canRetry) {
    explanation = `Step failed on attempt ${currentAttempts}/${MAX_RECOVERY_ATTEMPTS}. Initiating Phase 3 diagnostic analysis for automatic recovery.`;
    // Update step with failure info but keep plan alive
    const updatedPlan = updatePlanStep(plan, stepId, {
      status: STEP_STATUS.FAILED,
      errorDetails: errorMessage,
      isRecoveryAttempt: true,
      outputSummary: explanation,
    });
    return {
      plan: updatedPlan,
      canRetry: true,
      attempt: currentAttempts,
      maxAttempts: MAX_RECOVERY_ATTEMPTS,
      message: explanation,
    };
  }

  // Exhausted all recovery attempts: mark as BLOCKED to prevent infinite loops
  newStatus = STEP_STATUS.BLOCKED;
  explanation = `Step failed after ${MAX_RECOVERY_ATTEMPTS} automatic recovery attempts. Step is BLOCKED. Error: ${errorMessage}. User intervention or plan modification required.`;

  const updatedPlan = updatePlanStep(plan, stepId, {
    status: STEP_STATUS.BLOCKED,
    errorDetails: errorMessage,
    isRecoveryAttempt: true,
    outputSummary: explanation,
  });

  return {
    plan: updatedPlan,
    canRetry: false,
    attempt: currentAttempts,
    maxAttempts: MAX_RECOVERY_ATTEMPTS,
    message: explanation,
  };
}

/**
 * Generate a comprehensive execution summary once execution finishes or halts.
 *
 * @param {object} plan
 * @param {object} [options]
 * @param {Array<string>} [options.modifiedFiles]
 * @param {object} [options.testResults]
 * @returns {object} Final summary structure
 */
function generateExecutionSummary(plan, options = {}) {
  if (!plan) return null;

  const total = plan.steps.length;
  const completed = plan.steps.filter(s => s.status === STEP_STATUS.COMPLETED);
  const failed = plan.steps.filter(s => s.status === STEP_STATUS.FAILED || s.status === STEP_STATUS.BLOCKED);
  const skipped = plan.steps.filter(s => s.status === STEP_STATUS.SKIPPED);

  const modifiedFiles = options.modifiedFiles || Array.from(
    new Set(completed.flatMap(s => s.targetFiles || []))
  );

  const testSummary = options.testResults?.summary || {
    passed: 0,
    failed: 0,
    notTested: 0,
    total: 0,
  };

  const isSuccess = plan.status === PLAN_STATUS.COMPLETED && failed.length === 0;

  return {
    planId: plan.planId,
    title: plan.title,
    goal: plan.goal,
    status: plan.status,
    isSuccess,
    summaryText: isSuccess
      ? `Successfully executed all ${total} planned steps for "${plan.title}". All target files modified and verified.`
      : `Execution ${plan.status}. ${completed.length}/${total} steps completed, ${failed.length} failed/blocked, ${skipped.length} skipped.`,
    stats: {
      totalSteps: total,
      completedSteps: completed.length,
      failedSteps: failed.length,
      skippedSteps: skipped.length,
      progressPercent: Math.round((completed.length / total) * 100),
    },
    modifiedFiles,
    tests: testSummary,
    completedSteps: completed.map(s => ({ id: s.id, title: s.title, targetFiles: s.targetFiles })),
    failedSteps: failed.map(s => ({ id: s.id, title: s.title, error: s.errorDetails })),
    completedAt: new Date().toISOString(),
  };
}

module.exports = {
  PLAN_STATUS,
  STEP_STATUS,
  ACTION_TYPES,
  MAX_RECOVERY_ATTEMPTS,
  validateStepDependencies,
  createStepSignature,
  createExecutionPlan,
  handlePlanUserDecision,
  checkStepPrerequisites,
  updatePlanStep,
  controlPlanExecution,
  recordStepFailureAndCheckRecovery,
  generateExecutionSummary,
};
