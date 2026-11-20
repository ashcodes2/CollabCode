/**
 * Vercel Serverless Function: /api/ai/chat
 *
 * AI Agent with tool-calling support via Groq API.
 * Runs in isolated serverless execution environment.
 * Tools operate strictly within the user's active clientFileTree.
 */

import crypto from 'crypto';
import { diagnoseProject } from './diagnostic.js';
import { generateTestPlan, runProjectTests, analyzeRuntimeTestFailure } from './testEngine.js';
import { createExecutionPlan, updatePlanStep } from './taskExecutionEngine.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_TOOL_ITERATIONS = 2;

// ─── Security Rules ────────────────────────────────────────────────────────

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.vercel', '.next',
  '.cache', 'coverage', '.nyc_output', '__pycache__', '.svn',
  '.github', '.vscode', '.idea',
]);

const SENSITIVE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|crt|pfx|p12|keystore)$/i,
  /^(id_rsa|id_ed25519|id_dsa|id_ecdsa)(\.pub)?$/i,
  /^credentials(\.json|\.ini|\.yaml|\.yml)?$/i,
  /^secrets?(\.json|\.ini|\.yaml|\.yml)?$/i,
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.avi', '.mov', '.webm', '.ogg',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib', '.wasm',
]);

function sanitizePath(raw) {
  if (typeof raw !== 'string') return { valid: false, error: 'Path must be a string.' };
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
    if (decoded.includes('%')) decoded = decodeURIComponent(decoded);
  } catch {
    return { valid: false, error: 'Access denied: Malformed path encoding.' };
  }
  const norm = decoded.replace(/\\/g, '/').trim();
  if (
    norm.includes('..') ||
    norm.startsWith('/') ||
    /^[a-zA-Z]:/.test(norm) ||
    norm.includes('\0') ||
    norm.includes('://')
  ) {
    return { valid: false, error: 'Access denied: Path traversal outside project boundary is strictly prohibited.' };
  }
  const clean = norm.replace(/^\/+/, '');
  if (!clean || clean.length > 255) return { valid: false, error: 'Invalid path length.' };
  return { valid: true, path: clean };
}

function isSensitive(filePath) {
  if (!filePath) return true;
  const parts = filePath.replace(/\\/g, '/').split('/');
  const fn = parts[parts.length - 1];
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part.toLowerCase())) return true;
    if (part.startsWith('.') && (part === '.git' || part.startsWith('.env') || EXCLUDED_DIRS.has(part.toLowerCase()))) return true;
  }
  for (const pat of SENSITIVE_PATTERNS) {
    if (pat.test(fn)) return true;
  }
  return false;
}

function isBinary(p) {
  const ext = (p.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

// ─── Tool Definitions & Execution ──────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files and folders in the current collaborative project. Returns the full project file tree with file paths and types.',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Optional subdirectory path to list files from. Leave empty to list the entire project.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the full content of a specific file from the collaborative project.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to read (e.g. "index.html", "style.css").' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search for a keyword, function name, variable, or text pattern across all files in the project.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search term to look for across all project files.' },
          file_pattern: { type: 'string', description: 'Optional file extension filter (e.g. ".js", ".css").' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_code',
      description:
        'Run deep static diagnostics across HTML, CSS, and JavaScript project files. ' +
        'Detects syntax errors, missing DOM IDs/selectors across files, script execution timing issues (e.g. head scripts without defer), ' +
        'broken <script src> or <link rel="stylesheet"> references, incorrect event names (e.g. onclick in addEventListener), ' +
        'and common logical bugs like string concatenation counters. ' +
        'Can also diagnose specific browser console error messages provided by the user.',
      parameters: {
        type: 'object',
        properties: {
          error_message: {
            type: 'string',
            description: 'Optional browser console error message (e.g. "Cannot read properties of null (reading \'addEventListener\')") to analyze.',
          },
          target_file: {
            type: 'string',
            description: 'Optional specific file to focus analysis on (e.g. "script.js").',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_test_plan',
      description:
        'Inspect project files to create a structured test plan and test cases for HTML, CSS, and JavaScript. ' +
        'Generates test cases across normal scenarios, edge cases, and invalid inputs with expected results, ' +
        'identifies missing test scenarios and missing validation rules (e.g. empty input validation, division by zero, counter concatenation bugs), ' +
        'and provides step-by-step testing instructions.',
      parameters: {
        type: 'object',
        properties: {
          feature: {
            type: 'string',
            description: 'Optional specific feature or component to test (e.g. "login", "counter", "calculator", "all").',
          },
          target_file: {
            type: 'string',
            description: 'Optional file path to focus test generation on (e.g. "index.html", "script.js").',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_project_tests',
      description:
        'Run safe automated testing and contract validation across project HTML, CSS, and JavaScript without executing untrusted code on the backend. ' +
        'Returns structured test results with Passed, Failed, and Not Tested statuses, expected vs actual values, and plain-language error explanations. ' +
        'Never claims a test passed unless verified.',
      parameters: {
        type: 'object',
        properties: {
          test_suite: {
            type: 'string',
            description: 'Optional specific suite to run (e.g. "all", "validation", "counter", "calculator").',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_runtime_test_failure',
      description:
        'Analyze a failed runtime test from the browser Live Preview. ' +
        'Evaluates actual DOM behavior, runtime JavaScript errors, and console output to determine the root cause and provide actionable fix guidance for propose_file_edit.',
      parameters: {
        type: 'object',
        properties: {
          test_id: { type: 'string', description: 'Identifier of the failed test (e.g. "TC-COUNT-001", "TC-LOGIN-003").' },
          expected: { type: 'string', description: 'The expected DOM state or user behavior.' },
          actual: { type: 'string', description: 'The actual observed DOM state or behavior in the browser preview.' },
          runtime_error: { type: 'string', description: 'Optional runtime exception or error stack captured during testing.' },
          console_logs: { type: 'array', items: { type: 'string' }, description: 'Recent browser console output.' },
          target_file: { type: 'string', description: 'The file likely containing the bug (e.g. "script.js").' },
        },
        required: ['test_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task_plan',
      description:
        'Create a structured, ordered multi-step execution plan for complex features or development requests. ' +
        'Breaks down requests into executable steps with clear dependencies, target files, and verification criteria. ' +
        'The plan is presented to the user for explicit approval (Approve Plan, Reject Plan, or Modify Plan) before execution begins.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Concise title for the multi-step feature or task.' },
          goal: { type: 'string', description: 'Overall goal of the development task.' },
          steps: {
            type: 'array',
            description: 'Ordered sequence of steps to accomplish the goal.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique step identifier, e.g. "STEP-1", "STEP-2".' },
                title: { type: 'string', description: 'Short summary of what this step does.' },
                description: { type: 'string', description: 'Detailed instructions and objectives for this step.' },
                actionType: {
                  type: 'string',
                  enum: ['inspect', 'modify_file', 'debug', 'test', 'verify'],
                  description: 'Category of action for this step.',
                },
                targetFiles: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of project files to create or modify (e.g. ["index.html", "script.js"]).',
                },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Step IDs that must be completed before this step can begin (e.g. ["STEP-1"]).',
                },
                verificationCriteria: {
                  type: 'string',
                  description: 'Specific test or verification rule to validate that this step succeeded.',
                },
              },
              required: ['id', 'title', 'actionType', 'targetFiles'],
            },
          },
        },
        required: ['title', 'goal', 'steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_step',
      description:
        'Update the execution status of a step in the active multi-step plan. ' +
        'Used to mark steps in_progress, completed, failed, or blocked as the agent works through the approved plan.',
      parameters: {
        type: 'object',
        properties: {
          step_id: { type: 'string', description: 'The step ID being updated (e.g. "STEP-1").' },
          status: {
            type: 'string',
            enum: ['in_progress', 'completed', 'failed', 'blocked', 'skipped'],
            description: 'The updated status of the step.',
          },
          summary: { type: 'string', description: 'Summary of the action taken and result.' },
          error_details: { type: 'string', description: 'Optional error description if the step failed.' },
        },
        required: ['step_id', 'status', 'summary'],
      },
    },
  },
];

function executeTool(name, args, fileTree, context = {}) {
  if (!fileTree || typeof fileTree !== 'object') {
    return { success: false, error: 'No project files available.' };
  }

  if (name === 'list_files') {
    let dir = '';
    if (args.directory) {
      const s = sanitizePath(args.directory);
      if (!s.valid) return { success: false, error: s.error };
      dir = s.path.replace(/^\/+|\/+$/g, '');
    }
    const entries = [];
    for (const [fp, node] of Object.entries(fileTree)) {
      if (isSensitive(fp)) continue;
      if (dir && !fp.startsWith(dir + '/') && fp !== dir) continue;
      entries.push({ path: fp, type: node.type || 'file', name: node.name || fp.split('/').pop(), language: node.language || 'plaintext' });
    }
    entries.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.path.localeCompare(b.path);
    });
    return { success: true, message: `Found ${entries.length} file(s).`, files: entries };
  }

  if (name === 'read_file') {
    const raw = args.path;
    if (!raw || typeof raw !== 'string') return { success: false, error: 'No file path provided.' };
    const s = sanitizePath(raw);
    if (!s.valid) return { success: false, error: s.error };
    const fp = s.path;
    if (isSensitive(fp)) return { success: false, error: `Access denied: "${fp}" is a protected file.` };
    if (isBinary(fp)) return { success: false, error: `Cannot read "${fp}": binary file.` };
    let node = fileTree[fp];
    if (!node) {
      const lower = fp.toLowerCase();
      for (const [k, v] of Object.entries(fileTree)) {
        if (k.toLowerCase() === lower && !isSensitive(k)) { node = v; break; }
      }
    }
    if (!node) return { success: false, error: `File "${fp}" not found in the project.` };
    if (node.type === 'folder') return { success: false, error: `"${fp}" is a folder.` };
    const content = (node.value || '').slice(0, 100 * 1024);
    return { success: true, path: fp, language: node.language || 'plaintext', content, lines: content.split('\n').length };
  }

  if (name === 'search_code') {
    const query = (args.query || '').trim();
    if (!query) return { success: false, error: 'No search query provided.' };
    const pattern = (args.file_pattern || '').trim().toLowerCase();
    if (pattern && (pattern.includes('..') || pattern.includes('/') || pattern.includes('\\'))) {
      return { success: false, error: 'Access denied: Invalid file pattern.' };
    }
    const results = [];
    let searched = 0;
    for (const [fp, node] of Object.entries(fileTree)) {
      if (isSensitive(fp) || node.type === 'folder' || isBinary(fp)) continue;
      if (pattern) {
        const ext = (fp.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (ext !== pattern && !fp.toLowerCase().endsWith(pattern)) continue;
      }
      const content = node.value || '';
      if (!content) continue;
      searched++;
      const lines = content.split('\n');
      const ql = query.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(ql)) {
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length - 1, i + 2);
          const ctx = [];
          for (let j = start; j <= end; j++) ctx.push({ line: j + 1, text: lines[j], isMatch: j === i });
          results.push({ file: fp, line: i + 1, matchText: lines[i].trim(), context: ctx });
          if (results.length >= 30) break;
        }
      }
      if (results.length >= 30) break;
    }
    return { success: true, message: `Found ${results.length} match(es) across ${searched} file(s).`, results };
  }

  if (name === 'diagnose_code') {
    const report = diagnoseProject(fileTree, {
      errorMessage: args.error_message || '',
      targetFile: args.target_file || '',
    });
    return {
      success: true,
      message: `Project diagnostics complete: Found ${report.summary.confirmedErrorCount} confirmed error(s) and ${report.summary.potentialIssueCount} potential issue(s).`,
      diagnostics: report,
    };
  }

  if (name === 'generate_test_plan') {
    const plan = generateTestPlan(fileTree, {
      feature: args.feature || '',
      targetFile: args.target_file || '',
    });
    return {
      success: true,
      message: `Generated test plan with ${plan.summary.total} test case(s) across detected features: [${plan.featuresDetected.join(', ')}]. Found ${plan.missingScenarios.length} missing test scenario/validation gap(s).`,
      testPlan: plan,
    };
  }

  if (name === 'run_project_tests') {
    const results = runProjectTests(fileTree, {
      testSuite: args.test_suite || 'all',
    });
    return {
      success: true,
      message: `Test run finished: ${results.summary.passed} Passed, ${results.summary.failed} Failed, ${results.summary.notTested} Not Tested (manual preview verification required).`,
      testResults: results,
    };
  }

  if (name === 'analyze_runtime_test_failure') {
    const analysis = analyzeRuntimeTestFailure(args);
    return {
      success: true,
      message: `Runtime failure analyzed for ${analysis.testId}: Root Cause: ${analysis.rootCause}`,
      analysis,
    };
  }

  if (name === 'create_task_plan') {
    try {
      const plan = createExecutionPlan({
        title: args.title,
        goal: args.goal,
        steps: args.steps || [],
      });
      return {
        success: true,
        message: `Execution plan "${plan.title}" created with ${plan.steps.length} steps. Awaiting explicit user approval before execution begins.`,
        taskPlan: plan,
      };
    } catch (err) {
      return { success: false, error: `Failed to create execution plan: ${err.message}` };
    }
  }

  if (name === 'update_task_step') {
    try {
      if (!context?.activeTaskPlan) {
        return { success: false, error: 'No active execution plan found to update.' };
      }
      const updated = updatePlanStep(context.activeTaskPlan, args.step_id, {
        status: args.status,
        outputSummary: args.summary,
        errorDetails: args.error_details || null,
      });
      return {
        success: true,
        message: `Step "${args.step_id}" updated to status "${args.status}".`,
        taskPlan: updated,
      };
    } catch (err) {
      return { success: false, error: `Failed to update task step: ${err.message}` };
    }
  }

  return { success: false, error: `Unknown tool: "${name}"` };
}

// ─── System Prompt ─────────────────────────────────────────────────────────

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

// ─── Groq API Caller ──────────────────────────────────────────────────────

async function callGroq(apiKey, model, messages, includeTools, retries = 1) {
  const payload = { model, messages, temperature: 0.6, max_tokens: 1200 };
  if (includeTools) {
    payload.tools = TOOL_DEFINITIONS;
    payload.tool_choice = 'auto';
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 25000);
    let resp;
    try {
      resp = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(tid);
    }

    if (resp.status === 429 && attempt < retries) {
      let waitMs = 2500;
      const retryAfter = resp.headers.get('retry-after');
      const resetTokens = resp.headers.get('x-ratelimit-reset-tokens');

      if (retryAfter) {
        const sec = parseFloat(retryAfter);
        if (!isNaN(sec) && sec > 0) waitMs = Math.min(3000, Math.ceil(sec * 1000));
      } else if (resetTokens) {
        if (resetTokens.endsWith('ms')) {
          const ms = parseFloat(resetTokens);
          if (!isNaN(ms)) waitMs = Math.min(3000, Math.max(1000, ms + 200));
        } else if (resetTokens.endsWith('s')) {
          const s = parseFloat(resetTokens);
          if (!isNaN(s)) waitMs = Math.min(3000, Math.ceil(s * 1000));
        }
      }

      console.warn(`[AI Chat Vercel] Rate limit 429 received, waiting ${waitMs}ms before retry...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const err = new Error(errBody.error?.message || `Groq API HTTP ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return resp.json();
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { messages, fileTree: clientFileTree, taskPlan: clientTaskPlan } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    const model = (process.env.GROQ_MODEL || DEFAULT_MODEL).trim();

    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
    }

    const fileTree = (clientFileTree && typeof clientFileTree === 'object' && Object.keys(clientFileTree).length > 0)
      ? clientFileTree
      : null;

    const sanitized = messages
      .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({ role: m.role, content: m.content.trim() }));

    if (sanitized.length === 0) {
      return res.status(400).json({ error: 'At least one valid message is required.' });
    }

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
      ...sanitized,
    ];

    const hasProject = !!fileTree;
    const toolCallsLog = [];
    let activeTestPlan = null;
    let activeTestResults = null;
    let activeTaskPlan = clientTaskPlan || null;
    let finalContent = null;
    let lastData = null;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (i > 0) {
        // Pacing delay between multi-turn tool calls to allow Groq TPM bucket to replenish
        await new Promise(r => setTimeout(r, 400));
      }
      // On the final iteration, disable tools so Groq produces a markdown text reply
      const allowTools = (i < MAX_TOOL_ITERATIONS - 1);
      const data = await callGroq(apiKey, model, conversationMessages, allowTools);
      lastData = data;
      const choice = data.choices?.[0];
      if (!choice) return res.status(502).json({ error: 'No response from Groq API.' });

      const msg = choice.message;

      if (msg.tool_calls && msg.tool_calls.length > 0 && allowTools) {
        conversationMessages.push(msg);

        for (const tc of msg.tool_calls) {
          const toolName = tc.function?.name;
          let toolArgs = {};
          try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch { }

          const result = executeTool(toolName, toolArgs, fileTree, { activeTaskPlan });
          if (result && result.testPlan) activeTestPlan = result.testPlan;
          if (result && result.testResults) activeTestResults = result.testResults;
          if (result && result.taskPlan) activeTaskPlan = result.taskPlan;
          toolCallsLog.push({ tool: toolName, args: toolArgs, success: result.success !== false });
          conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }

      finalContent = msg.content?.trim() || msg.reasoning?.trim() || 'No answer generated.';
      break;
    }

    if (!finalContent) {
      if (activeTaskPlan) {
        finalContent = `I have generated an execution plan for "${activeTaskPlan.title}". Please review the steps in the plan card above and click Approve Plan to begin execution.`;
      } else {
        finalContent = 'Task completed successfully.';
      }
    }

    return res.status(200).json({
      success: true,
      message: { role: 'assistant', content: finalContent },
      model: lastData?.model || model,
      toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
      testPlan: activeTestPlan || undefined,
      testResults: activeTestResults || undefined,
      taskPlan: activeTaskPlan || undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    console.error('[AI Chat Vercel] Error:', error.message);

    if (error.status === 401) return res.status(401).json({ error: 'Invalid Groq API key.' });
    if (error.status === 404) return res.status(404).json({ error: 'Groq model not found.' });
    if (error.status === 429) return res.status(429).json({ error: 'Rate limit exceeded. Please wait.' });
    if (error.status >= 500) return res.status(502).json({ error: 'Groq service error. Try again.' });

    return res.status(500).json({ error: error.message || 'Internal error.' });
  }
}
