const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config();

const { TOOL_DEFINITIONS, executeTool } = require('../tools/projectTools');
const { applyProposal, rejectProposal, getProposal } = require('../tools/proposalManager');
const { handlePlanUserDecision, controlPlanExecution } = require('../tools/taskExecutionEngine');

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_TOOL_ITERATIONS = 5;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are CollabCode AI, an intelligent coding agent integrated into a collaborative web development IDE.

You have access to the user's current project files through these tools:
- **list_files**: See all files and folders in the project
- **read_file**: Read the content of any project file
- **search_code**: Search for keywords, functions, variables, or patterns across all project files
- **diagnose_code**: Run static diagnostics across HTML, CSS, and JS files to detect syntax errors, missing DOM IDs, broken script/style tags, head-script timing bugs, event listener typos, and counter logic issues
- **generate_test_plan**: Create a comprehensive test plan with categorized test cases (normal, edge cases, invalid inputs) and identify missing test scenarios and validation gaps
- **run_project_tests**: Execute safe contract tests and automated validations on HTML, CSS, and JS without running untrusted code on the backend
- **analyze_runtime_test_failure**: Analyze real browser runtime test failures, inspecting actual DOM state, runtime exceptions, and console logs to isolate root causes and guide fixes
- **create_task_plan**: Create a structured, ordered multi-step execution plan for complex development tasks with dependencies, target files, and verification criteria
- **update_task_step**: Update step status ('in_progress', 'completed', 'failed', 'blocked', 'skipped') as tasks are executed
- **propose_file_edit**: Propose creating a new file or modifying an existing file (HTML, CSS, JS)
- **propose_file_changes**: Propose changes across multiple files at once

IMPORTANT RULES:
1. When the user asks about their project, code, or files — ALWAYS use the tools to retrieve actual project data first. NEVER guess or fabricate file contents.
2. Use list_files to understand the project structure before reading specific files.
3. Use read_file to get actual file content before explaining, reviewing, or suggesting changes to code.
4. Use search_code to find where functions, variables, classes, or CSS rules are defined or used.
5. MULTI-STEP TASK EXECUTION RULES (Phase 6):
   - When the user requests a complex feature, new application, multi-file modification, or multi-step workflow:
     a. FIRST inspect existing project files with list_files and read_file to understand structure and dependencies.
     b. Call create_task_plan with:
        - title: Concise feature title
        - goal: Complete objective
        - steps: Ordered list of steps with unique IDs (e.g. STEP-1, STEP-2), targetFiles, dependencies, actionType, and verificationCriteria.
     c. PLAN APPROVAL GATEWAY: Present the plan clearly and await explicit user approval. NEVER execute steps or modify files before the user clicks "Approve Plan".
     d. SEQUENTIAL STEP EXECUTION:
        - Once approved, execute steps in topological dependency order.
        - Check that prerequisite steps are completed before starting dependent steps.
        - For file edits, ALWAYS call propose_file_edit or propose_file_changes. The user must explicitly approve the Diff Preview before changes apply.
        - Update step progress using update_task_step.
     e. AUTOMATIC FAILURE RECOVERY:
        - If an error or test failure occurs during a step, use diagnose_code (Phase 3) to find the root cause.
        - Propose a fix through propose_file_edit (requires user approval).
        - Maximum 2 recovery attempts per step. If still failing after 2 attempts, mark the step as BLOCKED and explain why. NEVER silently skip failed steps.
     f. VERIFICATION & SUMMARY:
        - Verify completed code with run_project_tests (Phase 4) and Live Preview testing (Phase 5).
        - Do not claim success without verification.
        - Display a final summary detailing all modified files and test outcomes.
5. RUNTIME BROWSER TESTING RULES (Phase 5):
   - When the user shares runtime test results, live DOM behavior, or asks to diagnose/fix a failed runtime test executed in Live Preview:
     a. Call analyze_runtime_test_failure passing test_id, expected, actual, runtime_error, and console_logs.
     b. Read relevant project files (e.g. script.js, index.html) with read_file.
     c. Clearly explain the ROOT CAUSE of the runtime failure (e.g. DOM string concatenation bug, unhandled division by zero, missing event.preventDefault(), missing empty input validation).
     d. ALWAYS propose the fix using propose_file_edit (or propose_file_changes) so the user can review line-by-line diffs in the Diff Preview.
     e. Never modify files without explicit user approval.
6. TESTING & TEST PLANNING RULES (Phase 4):
   - When the user asks to test their project, test a feature (e.g. login form, counter, calculator), or generate test cases:
     a. First inspect relevant project files using read_file or list_files.
     b. Call generate_test_plan and run_project_tests to retrieve structured test suites and contract validations.
     c. Generate meaningful test cases covering:
        - Normal scenarios (expected positive flows)
        - Edge cases (boundaries, zero/negatives, rapid actions, consecutive operators)
        - Invalid inputs (malformed email, empty inputs, whitespace-only, multiple decimals)
     d. Explain the expected result for every test case.
     e. When the user asks "Test my project":
        - Identify important interactive features (forms, counters, calculators, navigation).
        - Generate a structured testing checklist.
        - Identify missing test scenarios and missing validation rules (e.g., missing empty input check, missing division-by-zero guard, counter string concatenation).
        - Explain clearly what should work and what could fail.
     f. Display results in a clear structured format:
        - Status: Passed | Failed | Not Tested
        - Expected result
        - Actual result (when available)
        - Error details explained in simple, clear language
     g. STRICT HONESTY RULE: Never claim a test passed unless it actually ran and passed. Clearly distinguish generated/planned test cases from tests that were executed. For tests requiring manual execution in Live Preview, mark them as "Not Tested" and provide clear step-by-step instructions.
     h. If tests identify bugs or contract failures:
        - Explain the root cause clearly.
        - Automatically invoke propose_file_edit (or propose_file_changes) to propose the fix.
        - Require explicit user approval in the Diff Preview before changes are applied.
6. DEBUGGING & ERROR ANALYSIS RULES (Phase 3):
   - When the user reports an error, asks to find bugs, or asks why something is not working (e.g. button click not working, CSS styles not applying, counter not updating, or a browser console error):
     a. First, call diagnose_code (passing error_message if provided) and read relevant project files (e.g. index.html, style.css, script.js) with read_file.
     b. Clearly identify the ROOT CAUSE of the bug. Distinguish confirmed errors from potential warnings.
     c. Explain WHY the error happens with exact file paths and line numbers.
     d. ALWAYS propose the practical fix using propose_file_edit (or propose_file_changes for multi-file issues).
     e. The proposed fix will display in the Diff Preview for the user to Approve or Reject before any file is touched.
     f. Do NOT pretend to access the browser console automatically; analyze the user's report and project files.
7. CODE GENERATION & FILE EDITING RULES:
   - When the user asks to modify, create, update, or add code to their project:
     a. FIRST inspect relevant existing files with read_file or list_files to understand the existing project structure, styling, and coding conventions.
     b. Then ALWAYS invoke the propose_file_edit (or propose_file_changes) function tool via tool_calls providing the COMPLETE, usable, updated or new file content. Do NOT print JSON or text proposals instead of invoking the tool.
     c. NEVER claim you updated a file without invoking propose_file_edit or propose_file_changes.
     d. The backend will compute a line-by-line diff preview requiring the user to explicitly click Approve before any changes are written.
     e. Only HTML, CSS, and JavaScript files are supported for editing. Never attempt to edit sensitive files like .env or configuration files.
     f. Never modify unrelated files.
8. When reviewing code, read the actual file first, then provide specific feedback with line references.
9. For general programming questions NOT about the user's project, answer directly without tools.

You are especially knowledgeable about:
- HTML, CSS, JavaScript, React, Node.js
- Programming fundamentals, data structures and algorithms
- Debugging, code review, and web development best practices

When providing code:
- Use properly formatted Markdown code blocks with language tags.
- Explain important parts clearly.
- Reference actual file paths and line numbers from the project when applicable.
- Follow good coding practices.

If the user asks a question unrelated to programming, politely guide them back to software engineering and coding topics.`;

/**
 * GET /api/ai/status
 * Check if Groq AI service is configured
 */
router.get('/status', (req, res) => {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  res.json({
    available: Boolean(apiKey),
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
    agent: true,
  });
});

/**
 * Call Groq API with messages and optional tools, with automatic retry on 429 rate limits
 */
async function callGroq(apiKey, model, messages, includeTools = false, retries = 3) {
  const payload = {
    model,
    messages,
    temperature: 0.6,
    max_tokens: 4096,
  };

  if (includeTools) {
    payload.tools = TOOL_DEFINITIONS;
    payload.tool_choice = 'auto';
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    let response;
    try {
      response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429 && attempt < retries) {
      let waitMs = 4000 * (attempt + 1);
      const retryAfter = response.headers.get('retry-after');
      const resetTokens = response.headers.get('x-ratelimit-reset-tokens');

      if (retryAfter) {
        const sec = parseFloat(retryAfter);
        if (!isNaN(sec) && sec > 0) waitMs = Math.ceil(sec * 1000) + 600;
      } else if (resetTokens) {
        if (resetTokens.endsWith('ms')) {
          const ms = parseFloat(resetTokens);
          if (!isNaN(ms)) waitMs = Math.max(1200, ms + 500);
        } else if (resetTokens.endsWith('s')) {
          const s = parseFloat(resetTokens);
          if (!isNaN(s)) waitMs = Math.ceil(s * 1000) + 700;
        }
      }

      console.warn(`[AI Agent] Rate limit 429 received, backing off ${waitMs}ms before retry (attempt ${attempt + 1}/${retries})...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `Groq API returned HTTP ${response.status}`;
      const error = new Error(errMsg);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }
}

/**
 * POST /api/ai/chat
 * AI Agent with tool-calling support via Groq API
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages, roomId, fileTree: clientFileTree, taskPlan: clientTaskPlan } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({
        error: 'GROQ_API_KEY is not configured on the server. Please set it in the server environment.',
      });
    }

    const model = (process.env.GROQ_MODEL || DEFAULT_MODEL).trim();

    // Get the room's file tree for tool execution
    // Priority 1: Client-provided fileTree snapshot from authorized active editor session
    // Priority 2: Server-side in-memory fileTrees (verified room membership/token)
    let fileTree = null;
    if (clientFileTree && typeof clientFileTree === 'object' && Object.keys(clientFileTree).length > 0) {
      fileTree = clientFileTree;
    } else if (roomId && typeof roomId === 'string') {
      try {
        const { fileTrees, rooms, verifyAdminToken } = require('../server');
        const room = rooms && rooms.get(roomId);
        const authHeader = req.headers['authorization'];
        const clientAdminToken = req.body.adminToken || (authHeader && authHeader.replace(/^Bearer\s+/i, ''));

        // If the room has protected admin credentials, enforce verification
        if (room && room.adminToken && clientAdminToken) {
          if (verifyAdminToken(clientAdminToken, room.adminToken)) {
            fileTree = fileTrees?.get(roomId);
          } else {
            return res.status(403).json({ error: 'Access denied: Invalid credentials for room.' });
          }
        } else if (fileTrees && fileTrees.has(roomId)) {
          fileTree = fileTrees.get(roomId);
        }
      } catch (e) {
        console.warn('[AI Agent] Could not access server fileTrees:', e.message);
      }
    }

    // Format conversation history
    const sanitizedMessages = messages
      .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({
        role: m.role,
        content: m.content.trim(),
      }));

    if (sanitizedMessages.length === 0) {
      return res.status(400).json({ error: 'At least one valid message is required.' });
    }

    // Build the conversation for the LLM
    let conversationMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...sanitizedMessages,
    ];

    // Determine if tools should be offered (only if we have project context)
    const hasProjectContext = fileTree && Object.keys(fileTree).length > 0;

    // Track tool calls for the response
    const toolCallsLog = [];
    let activeProposal = null;
    let activeTestPlan = null;
    let activeTestResults = null;
    let activeTaskPlan = clientTaskPlan || null;

    // ── Agentic Loop: allow up to MAX_TOOL_ITERATIONS rounds ──────────────
    let iteration = 0;
    let finalContent = null;
    let lastData = null;

    while (iteration < MAX_TOOL_ITERATIONS) {
      if (iteration > 0) {
        // Pacing delay between multi-turn tool calls to allow Groq TPM bucket to replenish
        await new Promise(r => setTimeout(r, 600));
      }
      iteration++;

      const data = await callGroq(apiKey, model, conversationMessages, true);
      lastData = data;
      const choice = data.choices?.[0];

      if (!choice) {
        return res.status(502).json({ error: 'No response choice returned from Groq API.' });
      }

      const message = choice.message;
      const finishReason = choice.finish_reason;

      // If the LLM wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        // Add the assistant message with tool_calls to conversation
        conversationMessages.push(message);

        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function?.name;
          let toolArgs = {};

          try {
            toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
          } catch (parseErr) {
            toolArgs = {};
          }

          console.log(`[AI Agent] Tool call #${iteration}: ${toolName}(${JSON.stringify(toolArgs)})`);

          const toolResult = executeTool(toolName, toolArgs, fileTree, roomId, { activeTaskPlan });

          if (toolResult && toolResult.proposal) {
            activeProposal = toolResult.proposal;
          }
          if (toolResult && toolResult.testPlan) {
            activeTestPlan = toolResult.testPlan;
          }
          if (toolResult && toolResult.testResults) {
            activeTestResults = toolResult.testResults;
          }
          if (toolResult && toolResult.taskPlan) {
            activeTaskPlan = toolResult.taskPlan;
          }

          toolCallsLog.push({
            tool: toolName,
            args: toolArgs,
            success: toolResult.success !== false,
          });

          // Add tool result to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        // Continue the loop — the LLM may want to call more tools or generate a final response
        continue;
      }

      // No tool calls — this is the final response
      finalContent = message.content?.trim() || message.reasoning?.trim() || 'No answer generated.';
      break;
    }

    // Safety: if we exhausted iterations without a final response, make one last call with summary prompt
    if (finalContent === null) {
      console.warn('[AI Agent] Exhausted tool iterations, making final call for response summary.');
      conversationMessages.push({
        role: 'user',
        content: 'Please summarize your findings into a final response based on the above tool results.',
      });
      const finalData = await callGroq(apiKey, model, conversationMessages, true);
      const finalChoice = finalData.choices?.[0]?.message;
      finalContent = finalChoice?.content?.trim() || finalChoice?.reasoning?.trim() || 'I was unable to generate a complete response after analyzing the project. Please try rephrasing your question.';
      lastData = finalData;
    }

    // Fallback: If no proposal was created via tool_calls, check if the LLM outputted a JSON proposal block
    if (!activeProposal && finalContent && hasProjectContext) {
      const jsonMatch = finalContent.match(/```(?:json)?\s*(\{\s*"path"\s*:\s*"[^"]+".*?\})\s*```/s);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.path && typeof parsed.content === 'string') {
            const fallbackRes = executeTool('propose_file_edit', parsed, fileTree, roomId);
            if (fallbackRes.proposal) {
              activeProposal = fallbackRes.proposal;
            }
          }
        } catch {}
      }
    }

    return res.json({
      success: true,
      message: {
        role: 'assistant',
        content: finalContent,
      },
      model: lastData?.model || model,
      toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
      proposal: activeProposal || undefined,
      testPlan: activeTestPlan || undefined,
      testResults: activeTestResults || undefined,
      taskPlan: activeTaskPlan || undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[AI Agent] Groq request timed out.');
      return res.status(504).json({
        error: 'Network timeout: Groq API request took longer than 55 seconds to respond. Please try again.',
      });
    }

    console.error('[AI Agent] Error:', error.message);

    if (error.status === 401) {
      return res.status(401).json({ error: 'Authentication failure: Invalid Groq API key. Please check GROQ_API_KEY in server/.env.' });
    }
    if (error.status === 404) {
      return res.status(404).json({ error: `Model error: Groq model was not found or is unavailable.` });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded: Groq API rate limit reached. Please wait a moment before sending another message.' });
    }
    if (error.status === 400) {
      return res.status(400).json({ error: `Bad request to Groq API: ${error.message}` });
    }
    if (error.status >= 500) {
      return res.status(502).json({ error: `Groq AI service error: The Groq service is experiencing issues. Please try again.` });
    }

    const isNetworkError = error.code === 'ENOTFOUND' || error.cause?.code === 'ENOTFOUND' || error.message.includes('fetch failed');
    return res.status(isNetworkError ? 503 : 500).json({
      error: isNetworkError
        ? 'Network error: Backend could not reach api.groq.com. Please check server internet connectivity.'
        : (error.message || 'An internal error occurred while communicating with Groq AI.'),
    });
  }
});

/**
 * POST /api/ai/plan/decision
 * Handle user decision on a task execution plan: 'approve', 'reject', or 'modify'
 */
router.post('/plan/decision', (req, res) => {
  try {
    const { plan, action, options } = req.body || {};

    if (!plan || typeof plan !== 'object') {
      return res.status(400).json({ error: 'Valid plan object is required.' });
    }
    if (!['approve', 'reject', 'modify'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "approve", "reject", or "modify".' });
    }

    const updatedPlan = handlePlanUserDecision(plan, action, options || {});
    return res.json({
      success: true,
      action,
      plan: updatedPlan,
    });
  } catch (err) {
    console.error('[AI Agent] Plan decision error:', err);
    return res.status(400).json({ error: err.message || 'Failed to process plan decision.' });
  }
});

/**
 * POST /api/ai/plan/control
 * Control active plan execution: 'pause', 'resume', or 'cancel'
 */
router.post('/plan/control', (req, res) => {
  try {
    const { plan, action, reason } = req.body || {};

    if (!plan || typeof plan !== 'object') {
      return res.status(400).json({ error: 'Valid plan object is required.' });
    }
    if (!['pause', 'resume', 'cancel'].includes(action)) {
      return res.status(400).json({ error: 'Invalid control action. Must be "pause", "resume", or "cancel".' });
    }

    const updatedPlan = controlPlanExecution(plan, action, reason || '');
    return res.json({
      success: true,
      action,
      plan: updatedPlan,
    });
  } catch (err) {
    console.error('[AI Agent] Plan control error:', err);
    return res.status(400).json({ error: err.message || 'Failed to control plan execution.' });
  }
});

/**
 * POST /api/ai/proposal/apply
 * Apply an approved proposal after verifying concurrency and integrity
 */
router.post('/proposal/apply', (req, res) => {
  try {
    const { proposalId, fileTree } = req.body || {};

    if (!proposalId || typeof proposalId !== 'string') {
      return res.status(400).json({ error: 'proposalId is required.' });
    }

    const result = applyProposal(proposalId, { currentFileTree: fileTree || {} });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({
      success: true,
      proposalId: result.proposalId,
      appliedChanges: result.appliedChanges,
    });
  } catch (err) {
    console.error('[AI Agent] Proposal apply error:', err);
    return res.status(500).json({ error: err.message || 'Failed to apply proposal.' });
  }
});

/**
 * POST /api/ai/proposal/reject
 * Reject a proposal, leaving all files untouched
 */
router.post('/proposal/reject', (req, res) => {
  try {
    const { proposalId } = req.body || {};

    if (!proposalId || typeof proposalId !== 'string') {
      return res.status(400).json({ error: 'proposalId is required.' });
    }

    const result = rejectProposal(proposalId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({
      success: true,
      proposalId: result.proposalId,
      message: result.message,
    });
  } catch (err) {
    console.error('[AI Agent] Proposal reject error:', err);
    return res.status(500).json({ error: err.message || 'Failed to reject proposal.' });
  }
});

module.exports = router;
