/**
 * server/tools/projectTools.js
 *
 * Backend tool implementations for the CollabCode AI Agent.
 * These tools operate strictly on the in-memory fileTrees (the authorized active project)
 * to give the LLM actual project context while preventing unauthorized access,
 * path traversal, and sensitive file leakage.
 */

const path = require('path');

// Excluded directories from project listing and searching
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.vercel', '.next',
  '.cache', 'coverage', '.nyc_output', '__pycache__', '.svn',
  '.github', '.vscode', '.idea',
]);

// Sensitive file patterns that must never be read, listed, or searched
const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,                     // .env, .env.local, .env.production, etc.
  /\.env(\..+)?$/i,
  /\.(pem|key|crt|pfx|p12|keystore)$/i,  // Certificates and private keys
  /^(id_rsa|id_ed25519|id_dsa|id_ecdsa)(\.pub)?$/i, // SSH keys
  /^credentials(\.json|\.ini|\.yaml|\.yml)?$/i,     // Credentials files
  /^secrets?(\.json|\.ini|\.yaml|\.yml)?$/i,        // Secret storage
  /^\.?htpasswd$/i,
  /^\.?netrc$/i,
];

// Binary file extensions that cannot be meaningfully processed as text
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.avi', '.mov', '.webm', '.ogg',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib', '.wasm',
]);

const MAX_FILE_SIZE = 100 * 1024; // 100KB max readable file content
const MAX_SEARCH_RESULTS = 30;
const MAX_CONTEXT_LINES = 3; // Lines of context around search matches

/**
 * Validate and sanitize a file or directory path.
 * Enforces strict boundaries: no traversal (../), no encoded traversal,
 * no absolute paths, no drive letters, no null bytes.
 *
 * @param {string} rawPath
 * @returns {{ valid: boolean, path?: string, error?: string }}
 */
function sanitizeProjectPath(rawPath) {
  if (typeof rawPath !== 'string') {
    return { valid: false, error: 'Invalid path: path parameter must be a string.' };
  }

  // Handle URL encoding (single and double encoding e.g. %2e%2e or %252e%252e)
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
    // Double-decode to catch double-encoded traversal
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }
  } catch {
    return { valid: false, error: 'Access denied: Malformed or malicious path encoding detected.' };
  }

  // Normalize slashes
  const normalized = decoded.replace(/\\/g, '/').trim();

  // Check for path traversal indicators and absolute path indicators
  if (
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) || // Windows drive letters (C:, D:, etc.)
    normalized.includes('\0') ||      // Null byte injection
    normalized.includes('://')        // Protocol injection (file://, http://)
  ) {
    return { valid: false, error: 'Access denied: Path traversal outside project boundary is strictly prohibited.' };
  }

  // Strip leading slashes if any remain
  const clean = normalized.replace(/^\/+/, '');
  if (!clean || clean.length > 255) {
    return { valid: false, error: 'Invalid path: Path is empty or exceeds maximum length of 255 characters.' };
  }

  return { valid: true, path: clean };
}

/**
 * Check if a file or directory path is sensitive or excluded.
 * @param {string} filePath
 * @returns {boolean}
 */
function isExcludedOrSensitive(filePath) {
  if (!filePath) return true;
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const fileName = parts[parts.length - 1];

  // Check directory components against excluded directories
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part.toLowerCase())) {
      return true;
    }
    // Block hidden root directories like .git, .env directories
    if (part.startsWith('.') && (part === '.git' || part.startsWith('.env') || EXCLUDED_DIRS.has(part.toLowerCase()))) {
      return true;
    }
  }

  // Check file name against sensitive file patterns
  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a file is binary based on extension.
 * @param {string} filePath
 * @returns {boolean}
 */
function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definitions (OpenAI function-calling format for Groq)
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List all files and folders in the current collaborative project. ' +
        'Returns the full project file tree with file paths and types. ' +
        'Use this to understand the project structure before reading or searching files.',
      parameters: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description:
              'Optional subdirectory path to list files from (e.g. "src/components"). ' +
              'Leave empty or omit to list the entire project.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the full content of a specific file from the collaborative project. ' +
        'Returns the file content as text. Use this to examine code, understand implementations, ' +
        'or review files before answering questions about the project.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'The file path to read (e.g. "index.html", "src/App.jsx", "style.css"). ' +
              'Use list_files first if you are unsure of the exact path.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description:
        'Search for a keyword, function name, variable, CSS class, or any text pattern ' +
        'across all files in the collaborative project. Returns matching file paths, ' +
        'line numbers, and code snippets with surrounding context. ' +
        'Use this to find where something is defined or used.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search term or pattern to look for across all project files.',
          },
          file_pattern: {
            type: 'string',
            description:
              'Optional file extension filter (e.g. ".js", ".css", ".html"). ' +
              'Leave empty to search all text files.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_file_edit',
      description:
        'Propose creating a new file or modifying an existing file in the active project. ' +
        'This generates a diff preview that the user reviews and explicitly approves before any file is touched. ' +
        'Always read relevant files with read_file first so you follow existing conventions. ' +
        'Only HTML, CSS, and JavaScript files can be generated or edited.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path of the file to edit or create (e.g. "index.html", "style.css", "script.js", "contact.html").',
          },
          content: {
            type: 'string',
            description: 'The complete, usable new or updated content for the file.',
          },
          explanation: {
            type: 'string',
            description: 'Brief summary of what was added or modified.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_file_changes',
      description:
        'Propose changes to multiple files at once (e.g. modifying index.html and style.css together). ' +
        'Generates diff previews requiring user approval before applying.',
      parameters: {
        type: 'object',
        properties: {
          changes: {
            type: 'array',
            description: 'Array of file edits or creations.',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path to create or edit.' },
                content: { type: 'string', description: 'Complete updated or new file content.' },
                explanation: { type: 'string', description: 'Summary of changes for this file.' },
              },
              required: ['path', 'content'],
            },
          },
        },
        required: ['changes'],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * list_files: List project files and folders inside the active project
 */
function executeListFiles(fileTree, args) {
  if (!fileTree || typeof fileTree !== 'object') {
    return { success: false, error: 'No project files found. The project may be empty or not yet synced.' };
  }

  let directory = '';
  if (args.directory) {
    const sanitization = sanitizeProjectPath(args.directory);
    if (!sanitization.valid) {
      return { success: false, error: sanitization.error };
    }
    directory = sanitization.path.replace(/^\/+|\/+$/g, '');
  }

  const entries = [];

  for (const [filePath, node] of Object.entries(fileTree)) {
    // Security: exclude sensitive files and directories
    if (isExcludedOrSensitive(filePath)) continue;

    // Filter by directory prefix if specified
    if (directory && !filePath.startsWith(directory + '/') && filePath !== directory) {
      continue;
    }

    entries.push({
      path: filePath,
      type: node.type || 'file',
      name: node.name || filePath.split('/').pop(),
      language: node.language || 'plaintext',
    });
  }

  // Sort: folders first, then alphabetically
  entries.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.path.localeCompare(b.path);
  });

  if (entries.length === 0) {
    const msg = directory
      ? `No files found in directory "${directory}".`
      : 'The project is empty — no files found.';
    return { success: true, message: msg, files: [] };
  }

  return {
    success: true,
    message: `Found ${entries.length} file(s)${directory ? ` in "${directory}"` : ''}.`,
    files: entries,
  };
}

/**
 * read_file: Read a specific file's content strictly from the active project
 */
function executeReadFile(fileTree, args) {
  if (!fileTree || typeof fileTree !== 'object') {
    return { success: false, error: 'No project files available.' };
  }

  const rawPath = args.path;
  if (!rawPath || typeof rawPath !== 'string') {
    return { success: false, error: 'No file path provided. Please specify which file to read.' };
  }

  // 1. Sanitize against path traversal and malformed paths
  const sanitization = sanitizeProjectPath(rawPath);
  if (!sanitization.valid) {
    return { success: false, error: sanitization.error };
  }

  const filePath = sanitization.path;

  // 2. Reject sensitive/credential files (.env, keys, etc.)
  if (isExcludedOrSensitive(filePath)) {
    return { success: false, error: `Access denied: "${filePath}" is a protected or sensitive file and cannot be read.` };
  }

  // 3. Reject binary files
  if (isBinaryFile(filePath)) {
    return { success: false, error: `Cannot read "${filePath}": binary file type is not supported.` };
  }

  // 4. Try exact match first, then case-insensitive match within the active fileTree
  let node = fileTree[filePath];
  let resolvedPath = filePath;

  if (!node) {
    const lowerPath = filePath.toLowerCase();
    for (const [key, val] of Object.entries(fileTree)) {
      if (key.toLowerCase() === lowerPath && !isExcludedOrSensitive(key)) {
        node = val;
        resolvedPath = key;
        break;
      }
    }
  }

  if (!node) {
    // Provide helpful suggestions based on file basename
    const targetBase = path.basename(filePath, path.extname(filePath)).toLowerCase();
    const allPaths = Object.keys(fileTree).filter(p => !isExcludedOrSensitive(p));
    const suggestions = allPaths
      .filter(p => {
        const base = path.basename(p, path.extname(p)).toLowerCase();
        return base.includes(targetBase) || targetBase.includes(base);
      })
      .slice(0, 5);

    let errorMsg = `File "${filePath}" not found in the project.`;
    if (suggestions.length > 0) {
      errorMsg += ` Did you mean: ${suggestions.join(', ')}?`;
    }
    return { success: false, error: errorMsg };
  }

  if (node.type === 'folder') {
    return { success: false, error: `"${resolvedPath}" is a folder, not a file. Use list_files to see its contents.` };
  }

  const content = node.value ?? '';

  if (content.length > MAX_FILE_SIZE) {
    return {
      success: true,
      path: resolvedPath,
      language: node.language || 'plaintext',
      content: content.slice(0, MAX_FILE_SIZE),
      truncated: true,
      totalSize: content.length,
      message: `File truncated: showing first ${MAX_FILE_SIZE} bytes of ${content.length} total.`,
    };
  }

  return {
    success: true,
    path: resolvedPath,
    language: node.language || 'plaintext',
    content,
    lines: content.split('\n').length,
  };
}

/**
 * search_code: Search for a pattern across files in the active project
 */
function executeSearchCode(fileTree, args) {
  if (!fileTree || typeof fileTree !== 'object') {
    return { success: false, error: 'No project files available.' };
  }

  const query = (args.query || '').trim();
  if (!query) {
    return { success: false, error: 'No search query provided.' };
  }

  // Sanitize file pattern filter if provided
  let filePattern = (args.file_pattern || '').trim().toLowerCase();
  if (filePattern) {
    // Prevent traversal via file pattern (e.g. "../")
    if (filePattern.includes('..') || filePattern.includes('/') || filePattern.includes('\\')) {
      return { success: false, error: 'Access denied: Invalid file pattern.' };
    }
  }

  const results = [];
  let filesSearched = 0;

  for (const [filePath, node] of Object.entries(fileTree)) {
    // Security: skip sensitive files, excluded directories, and binary files
    if (isExcludedOrSensitive(filePath)) continue;
    if (node.type === 'folder') continue;
    if (isBinaryFile(filePath)) continue;

    // Filter by extension if specified
    if (filePattern) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== filePattern && !filePath.toLowerCase().endsWith(filePattern)) {
        continue;
      }
    }

    const content = node.value || '';
    if (!content) continue;

    filesSearched++;
    const lines = content.split('\n');
    const queryLower = query.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        // Gather context lines
        const startCtx = Math.max(0, i - MAX_CONTEXT_LINES);
        const endCtx = Math.min(lines.length - 1, i + MAX_CONTEXT_LINES);
        const contextLines = [];
        for (let j = startCtx; j <= endCtx; j++) {
          contextLines.push({
            line: j + 1,
            text: lines[j],
            isMatch: j === i,
          });
        }

        results.push({
          file: filePath,
          line: i + 1,
          matchText: lines[i].trim(),
          context: contextLines,
        });

        if (results.length >= MAX_SEARCH_RESULTS) break;
      }
    }

    if (results.length >= MAX_SEARCH_RESULTS) break;
  }

  if (results.length === 0) {
    return {
      success: true,
      message: `No matches found for "${query}" across ${filesSearched} file(s).`,
      results: [],
    };
  }

  return {
    success: true,
    message: `Found ${results.length} match(es) for "${query}" across ${filesSearched} file(s).`,
    results,
  };
}

/**
 * propose_file_edit: Propose creating or modifying a single file in the project
 */
function executeProposeFileEdit(fileTree, args, roomId = null) {
  if (!args.path || typeof args.content !== 'string') {
    return { success: false, error: 'Both "path" and "content" are required to propose a file edit.' };
  }

  const { createProposal } = require('./proposalManager');
  const result = createProposal({
    roomId,
    items: [
      {
        path: args.path,
        content: args.content,
        explanation: args.explanation || '',
      },
    ],
    fileTree: fileTree || {},
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    message: `Proposed edit for "${args.path}" created with ID ${result.proposal.proposalId}. A line-by-line diff preview has been prepared for the user. Awaiting explicit user approval before applying changes.`,
    proposal: result.proposal,
  };
}

/**
 * propose_file_changes: Propose changes across multiple files at once
 */
function executeProposeFileChanges(fileTree, args, roomId = null) {
  if (!Array.isArray(args.changes) || args.changes.length === 0) {
    return { success: false, error: 'A non-empty "changes" array is required.' };
  }

  const { createProposal } = require('./proposalManager');
  const result = createProposal({
    roomId,
    items: args.changes,
    fileTree: fileTree || {},
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const affected = result.proposal.changes.map(c => c.path).join(', ');
  return {
    success: true,
    message: `Proposed changes for [${affected}] created with ID ${result.proposal.proposalId}. A line-by-line diff preview has been prepared for the user. Awaiting explicit user approval before applying changes.`,
    proposal: result.proposal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main tool executor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a tool call by name with the provided arguments
 * @param {string} toolName - The function name to execute
 * @param {object} args - Parsed arguments from the LLM
 * @param {object} fileTree - The active project's file tree
 * @param {string|null} [roomId] - Active room ID
 * @returns {object} Tool execution result
 */
function executeTool(toolName, args, fileTree, roomId = null) {
  switch (toolName) {
    case 'list_files':
      return executeListFiles(fileTree, args || {});
    case 'read_file':
      return executeReadFile(fileTree, args || {});
    case 'search_code':
      return executeSearchCode(fileTree, args || {});
    case 'propose_file_edit':
      return executeProposeFileEdit(fileTree, args || {}, roomId);
    case 'propose_file_changes':
      return executeProposeFileChanges(fileTree, args || {}, roomId);
    default:
      return { success: false, error: `Unknown tool: "${toolName}"` };
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  executeProposeFileEdit,
  executeProposeFileChanges,
  sanitizeProjectPath,
  isExcludedOrSensitive,
};
