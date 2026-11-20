/**
 * server/tools/projectTools.js
 *
 * Backend tool implementations for the CollabCode AI Agent.
 * These tools operate on the in-memory fileTrees (Yjs-synced project state)
 * to give the LLM actual project context.
 */

const path = require('path');

// Directories and files to exclude from listing and searching
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.vercel', '.next',
  '.cache', 'coverage', '.nyc_output', '__pycache__', '.svn',
]);

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
 * Check if a file path should be excluded
 */
function isExcludedPath(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.some(part => EXCLUDED_DIRS.has(part));
}

/**
 * Check if a file is binary based on extension
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
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * list_files: List project files and folders
 */
function executeListFiles(fileTree, args) {
  if (!fileTree || typeof fileTree !== 'object') {
    return { success: false, error: 'No project files found. The project may be empty or not yet synced.' };
  }

  const directory = (args.directory || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const entries = [];

  for (const [filePath, node] of Object.entries(fileTree)) {
    if (isExcludedPath(filePath)) continue;

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
 * read_file: Read a specific file's content
 */
function executeReadFile(fileTree, args) {
  if (!fileTree || typeof fileTree !== 'object') {
    return { success: false, error: 'No project files available.' };
  }

  const filePath = (args.path || '').replace(/\\/g, '/').replace(/^\/+/, '');

  if (!filePath) {
    return { success: false, error: 'No file path provided. Please specify which file to read.' };
  }

  if (isBinaryFile(filePath)) {
    return { success: false, error: `Cannot read "${filePath}": binary file type is not supported.` };
  }

  // Try exact match first, then case-insensitive
  let node = fileTree[filePath];
  let resolvedPath = filePath;

  if (!node) {
    const lowerPath = filePath.toLowerCase();
    for (const [key, val] of Object.entries(fileTree)) {
      if (key.toLowerCase() === lowerPath) {
        node = val;
        resolvedPath = key;
        break;
      }
    }
  }

  if (!node) {
    // Provide helpful suggestions based on file basename
    const targetBase = path.basename(filePath, path.extname(filePath)).toLowerCase();
    const allPaths = Object.keys(fileTree).filter(p => !isExcludedPath(p));
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
 * search_code: Search for a pattern across project files
 */
function executeSearchCode(fileTree, args) {
  if (!fileTree || typeof fileTree !== 'object') {
    return { success: false, error: 'No project files available.' };
  }

  const query = (args.query || '').trim();
  if (!query) {
    return { success: false, error: 'No search query provided.' };
  }

  const filePattern = (args.file_pattern || '').trim().toLowerCase();
  const results = [];
  let filesSearched = 0;

  for (const [filePath, node] of Object.entries(fileTree)) {
    if (isExcludedPath(filePath)) continue;
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

// ─────────────────────────────────────────────────────────────────────────────
// Main tool executor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a tool call by name with the provided arguments
 * @param {string} toolName - The function name to execute
 * @param {object} args - Parsed arguments from the LLM
 * @param {object} fileTree - The room's file tree from fileTrees Map
 * @returns {object} Tool execution result
 */
function executeTool(toolName, args, fileTree) {
  switch (toolName) {
    case 'list_files':
      return executeListFiles(fileTree, args || {});
    case 'read_file':
      return executeReadFile(fileTree, args || {});
    case 'search_code':
      return executeSearchCode(fileTree, args || {});
    default:
      return { success: false, error: `Unknown tool: "${toolName}"` };
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
};
