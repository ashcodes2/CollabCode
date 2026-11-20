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
const MAX_TOOL_ITERATIONS = 2;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are CollabCode AI, an intelligent coding agent integrated into a collaborative web development IDE.

CORE WORKFLOW & TOOLS:
1. INSPECTION (Phase 1): Inspect real project files using read_file, list_files, and search_code. Never fabricate file contents.
2. CODE GENERATION & DIFF PREVIEW (Phase 2): To add, modify, or create HTML, CSS, or JS files, ALWAYS invoke propose_file_edit or propose_file_changes. Files will only be modified after the user explicitly approves the line-by-line Diff Preview. Only HTML, CSS, and JS are editable.
3. DEBUGGING & ROOT CAUSE ANALYSIS (Phase 3): When diagnosing errors, UI issues, or broken scripts, call diagnose_code. Identify root causes with exact line numbers and propose fixes via propose_file_edit.
4. STATIC TESTING & TEST PLANNING (Phase 4): Call generate_test_plan and run_project_tests to validate contracts and edge cases. Report honest results (Passed | Failed | Not Tested).
5. RUNTIME BROWSER TESTING (Phase 5): For interactive DOM tests or preview exceptions, use analyze_runtime_test_failure. User code is executed safely in an isolated browser iframe harness.
6. MULTI-STEP TASK EXECUTION AGENT (Phase 6):
   - For multi-step tasks, new features, or multi-file changes: call create_task_plan with a concise title, goal, and ordered steps (with unique IDs like STEP-1, targetFiles, dependencies, actionType, verificationCriteria).
   - PLAN APPROVAL GATEWAY: Await explicit user approval before executing any step or modifying files.
   - SEQUENTIAL EXECUTION: Execute steps in dependency order. Apply file modifications via propose_file_edit (requires approval). Update progress with update_task_step. Maximum 2 recovery attempts before marking blocked.
7. GENERAL ADVICE: For non-project programming questions, answer directly in concise Markdown with code blocks.`;

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
async function callGroq(apiKey, model, messages, includeTools = false, retries = 1) {
  const payload = {
    model,
    messages,
    temperature: 0.6,
    max_tokens: 1200,
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
    let systemContent = SYSTEM_PROMPT;
    if (fileTree && Object.keys(fileTree).length > 0) {
      const filesOverview = Object.entries(fileTree)
        .slice(0, 15)
        .map(([p, node]) => {
          const content = typeof node === 'string' ? node : node?.value || node?.content || '';
          const preview = content.length > 800 ? content.slice(0, 800) + '\n... [truncated]' : content;
          return `--- File: ${p} ---\n${preview || '(empty)'}`;
        })
        .join('\n\n');

      systemContent += `\n\nCURRENT PROJECT FILES:\n${filesOverview}\n(The above project files are already loaded. You do not need to call read_file or list_files unless you need to search or re-read truncated files. You can proceed directly to create_task_plan, propose_file_edit, or answer).`;
    }

    let conversationMessages = [
      { role: 'system', content: systemContent },
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
        await new Promise(r => setTimeout(r, 400));
      }
      iteration++;

      // On final iteration, disable tools so Groq generates markdown text
      const allowTools = (iteration < MAX_TOOL_ITERATIONS);
      const data = await callGroq(apiKey, model, conversationMessages, allowTools);
      lastData = data;
      const choice = data.choices?.[0];

      if (!choice) {
        return res.status(502).json({ error: 'No response choice returned from Groq API.' });
      }

      const message = choice.message;
      const finishReason = choice.finish_reason;

      // If the LLM wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0 && allowTools) {
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

        // Continue the loop — the LLM will generate the final response
        continue;
      }

      // No tool calls — this is the final response
      finalContent = message.content?.trim() || message.reasoning?.trim() || 'No answer generated.';
      break;
    }

    if (!finalContent) {
      if (activeTaskPlan) {
        finalContent = `I have generated an execution plan for "${activeTaskPlan.title}". Please review the steps in the plan card above and click Approve Plan to begin execution.`;
      } else {
        finalContent = 'Task completed successfully.';
      }
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
