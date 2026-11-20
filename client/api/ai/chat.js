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
const MAX_TOOL_ITERATIONS = 5;

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
     a. FIRST inspect relevant existing files with read_file or list_files to understand existing structure, styling, and coding conventions.
     b. Then ALWAYS invoke propose_file_edit (or propose_file_changes) providing the COMPLETE, usable, updated or new file content.
     c. NEVER output snippets claiming you updated a file without calling propose_file_edit or propose_file_changes.
     d. The backend will compute a line-by-line diff preview requiring the user to explicitly click Approve before any changes are written.
     e. Only HTML, CSS, and JavaScript files are supported for editing. Never attempt to edit sensitive files like .env or configuration files.
     f. Never modify unrelated files.
8. When reviewing code, read the actual file first, then provide specific feedback with line references.
9. For general programming questions NOT about the user's project, answer directly without tools.

You are especially knowledgeable about HTML, CSS, JavaScript, React, Node.js, programming fundamentals, data structures and algorithms, debugging, and web development best practices.

When providing code:
- Use properly formatted Markdown code blocks with language tags.
- Explain important parts clearly.
- Reference actual file paths and line numbers from the project when applicable.
- Follow good coding practices.

If the user asks a question unrelated to programming, politely guide them back to software engineering and coding topics.`;

// ─── Groq API Caller ──────────────────────────────────────────────────────

async function callGroq(apiKey, model, messages, includeTools) {
  const payload = { model, messages, temperature: 0.6, max_tokens: 4096 };
  if (includeTools) {
    payload.tools = TOOL_DEFINITIONS;
    payload.tool_choice = 'auto';
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 55000);
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

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const err = new Error(errBody.error?.message || `Groq API HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
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

    let conversationMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
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
      const data = await callGroq(apiKey, model, conversationMessages, hasProject);
      lastData = data;
      const choice = data.choices?.[0];
      if (!choice) return res.status(502).json({ error: 'No response from Groq API.' });

      const msg = choice.message;

      if (msg.tool_calls && msg.tool_calls.length > 0 && hasProject) {
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

    if (finalContent === null) {
      const finalData = await callGroq(apiKey, model, conversationMessages, false);
      const fc = finalData.choices?.[0]?.message;
      finalContent = fc?.content?.trim() || fc?.reasoning?.trim() || 'Unable to generate a complete response.';
      lastData = finalData;
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
