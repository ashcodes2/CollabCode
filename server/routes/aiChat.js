const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config();

const { TOOL_DEFINITIONS, executeTool } = require('../tools/projectTools');

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_TOOL_ITERATIONS = 5;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are CollabCode AI, an intelligent coding agent integrated into a collaborative web development IDE.

You have access to the user's current project files through these tools:
- **list_files**: See all files and folders in the project
- **read_file**: Read the content of any project file
- **search_code**: Search for keywords, functions, variables, or patterns across all project files

IMPORTANT RULES:
1. When the user asks about their project, code, or files — ALWAYS use the tools to retrieve actual project data first. NEVER guess or fabricate file contents.
2. Use list_files to understand the project structure before reading specific files.
3. Use read_file to get actual file content before explaining, reviewing, or suggesting changes to code.
4. Use search_code to find where functions, variables, classes, or CSS rules are defined or used.
5. You may call multiple tools in sequence when needed (e.g., list files, then read relevant ones).
6. When reviewing code, read the actual file first, then provide specific feedback with line references.
7. For general programming questions NOT about the user's project, answer directly without tools.

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
 * Call Groq API with messages and optional tools
 */
async function callGroq(apiKey, model, messages, includeTools = false) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);

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

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg = errBody.error?.message || `Groq API returned HTTP ${response.status}`;
    const error = new Error(errMsg);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * POST /api/ai/chat
 * AI Agent with tool-calling support via Groq API
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages, roomId, fileTree: clientFileTree } = req.body;

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
    // Priority 1: Server-side in-memory fileTrees (from active socket connection)
    // Priority 2: Client-provided fileTree snapshot in request body
    let fileTree = null;
    try {
      const { fileTrees } = require('../server');
      if (roomId && fileTrees && fileTrees.has(roomId)) {
        fileTree = fileTrees.get(roomId);
      }
    } catch (e) {
      // fileTrees not available (e.g. in test or standalone mode)
      console.warn('[AI Agent] Could not access server fileTrees:', e.message);
    }

    if (!fileTree && clientFileTree && typeof clientFileTree === 'object' && Object.keys(clientFileTree).length > 0) {
      fileTree = clientFileTree;
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

    // ── Agentic Loop: allow up to MAX_TOOL_ITERATIONS rounds ──────────────
    let iteration = 0;
    let finalContent = null;
    let lastData = null;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      const data = await callGroq(apiKey, model, conversationMessages, hasProjectContext);
      lastData = data;
      const choice = data.choices?.[0];

      if (!choice) {
        return res.status(502).json({ error: 'No response choice returned from Groq API.' });
      }

      const message = choice.message;
      const finishReason = choice.finish_reason;

      // If the LLM wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0 && hasProjectContext) {
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

          const toolResult = executeTool(toolName, toolArgs, fileTree);

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

    // Safety: if we exhausted iterations without a final response, make one last call without tools
    if (finalContent === null) {
      console.warn('[AI Agent] Exhausted tool iterations, making final call without tools.');
      const finalData = await callGroq(apiKey, model, conversationMessages, false);
      const finalChoice = finalData.choices?.[0]?.message;
      finalContent = finalChoice?.content?.trim() || finalChoice?.reasoning?.trim() || 'I was unable to generate a complete response after analyzing the project. Please try rephrasing your question.';
      lastData = finalData;
    }

    return res.json({
      success: true,
      message: {
        role: 'assistant',
        content: finalContent,
      },
      model: lastData?.model || model,
      toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
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

module.exports = router;
