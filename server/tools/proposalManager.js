/**
 * server/tools/proposalManager.js
 *
 * Secure Proposal Management for CollabCode AI Agent (Phase 2).
 * Handles creation, validation, diff calculation, state verification,
 * concurrency conflict detection, and controlled approval of file edits.
 */

const crypto = require('crypto');
const path = require('path');
const { computeLineDiff } = require('./diffEngine');
const { sanitizeProjectPath, isExcludedOrSensitive } = require('./projectTools');

// In-memory proposal store with TTL
const proposals = new Map();
const PROPOSAL_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Allowed extensions for code generation & editing (HTML, CSS, JavaScript web stack)
const ALLOWED_CODE_EXTENSIONS = new Set([
  '.html', '.htm',
  '.css',
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx',
  '.json',
  '.svg',
]);

const MAX_EDIT_FILE_SIZE = 100 * 1024; // 100KB max per file

/**
 * Periodically purge expired proposals
 */
setInterval(() => {
  const now = Date.now();
  for (const [id, prop] of proposals.entries()) {
    if (prop.expiresAt <= now) {
      proposals.delete(id);
    }
  }
}, 60000).unref();

/**
 * Validates a proposed file change against security, type, and size restrictions.
 *
 * @param {string} rawPath
 * @param {string} rawContent
 * @returns {{ valid: boolean, path?: string, error?: string }}
 */
function validateProposedFile(rawPath, rawContent) {
  // 1. Sanitize path against traversal and malformed paths
  const sanitization = sanitizeProjectPath(rawPath);
  if (!sanitization.valid) {
    return { valid: false, error: sanitization.error };
  }

  const filePath = sanitization.path;

  // 2. Reject sensitive/protected files (.env, keys, credentials)
  if (isExcludedOrSensitive(filePath)) {
    return {
      valid: false,
      error: `Access denied: "${filePath}" is a protected or sensitive file and cannot be modified.`,
    };
  }

  // 3. Restriction: Support only HTML, CSS, JavaScript and standard web project files
  const ext = path.extname(filePath).toLowerCase();
  if (!ext || !ALLOWED_CODE_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported file type "${ext}": Only HTML, CSS, and JavaScript files can be generated or edited in Phase 2.`,
    };
  }

  // 4. Content size validation
  if (typeof rawContent !== 'string') {
    return { valid: false, error: 'File content must be a string.' };
  }

  if (rawContent.length > MAX_EDIT_FILE_SIZE) {
    return {
      valid: false,
      error: `Content exceeds maximum allowed size of ${MAX_EDIT_FILE_SIZE / 1024}KB.`,
    };
  }

  return { valid: true, path: filePath };
}

/**
 * Create a secure proposal for one or more file edits.
 *
 * @param {object} params
 * @param {string} [params.roomId] - Active room ID
 * @param {Array<{ path: string, content: string, explanation?: string }>} params.items - Files to edit/create
 * @param {object} params.fileTree - Active project file tree
 * @returns {{ success: boolean, proposal?: object, error?: string }}
 */
function createProposal({ roomId = null, items = [], fileTree = {} }) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'No file changes provided for proposal.' };
  }

  const validatedChanges = [];

  for (const item of items) {
    const val = validateProposedFile(item.path, item.content);
    if (!val.valid) {
      return { success: false, error: `Invalid change for "${item.path}": ${val.error}` };
    }

    const filePath = val.path;
    const proposedContent = item.content;
    const existingNode = fileTree ? fileTree[filePath] : null;
    const isNew = !existingNode;
    const originalContent = existingNode ? (existingNode.value ?? '') : '';

    // Compute cryptographic hash of original content for concurrency conflict detection
    const originalHash = crypto.createHash('sha256').update(originalContent).digest('hex');

    // Compute line-by-line diff
    const diff = computeLineDiff(originalContent, proposedContent);

    validatedChanges.push({
      path: filePath,
      action: isNew ? 'create' : 'modify',
      language: existingNode?.language || getLanguageFromExt(filePath),
      originalContent,
      proposedContent,
      explanation: typeof item.explanation === 'string' ? item.explanation.trim() : '',
      diff: diff.lines,
      unifiedText: diff.unifiedText,
      stats: {
        additions: diff.additions,
        deletions: diff.deletions,
      },
      originalHash,
    });
  }

  const proposalId = 'prop_' + crypto.randomBytes(16).toString('hex');
  const now = Date.now();

  const proposal = {
    proposalId,
    createdAt: now,
    expiresAt: now + PROPOSAL_TTL_MS,
    roomId: roomId || null,
    status: 'pending', // 'pending' | 'applied' | 'rejected'
    changes: validatedChanges,
  };

  proposals.set(proposalId, proposal);

  return {
    success: true,
    proposal,
  };
}

/**
 * Get a proposal by ID
 */
function getProposal(proposalId) {
  if (!proposalId || typeof proposalId !== 'string') return null;
  const prop = proposals.get(proposalId);
  if (!prop) return null;
  if (prop.expiresAt <= Date.now()) {
    proposals.delete(proposalId);
    return null;
  }
  return prop;
}

/**
 * Apply an approved proposal.
 * Validates expiration, single-use, and checks for concurrent conflicting modifications.
 *
 * @param {string} proposalId
 * @param {object} params
 * @param {object} params.currentFileTree - Current file tree state to verify no concurrent conflicts
 * @returns {{ success: boolean, appliedChanges?: Array<object>, error?: string }}
 */
function applyProposal(proposalId, { currentFileTree = {} } = {}) {
  const proposal = getProposal(proposalId);

  if (!proposal) {
    return {
      success: false,
      error: 'Proposal not found or has expired. Please ask the AI agent to generate a fresh proposal.',
    };
  }

  if (proposal.status !== 'pending') {
    return {
      success: false,
      error: `Proposal cannot be applied: It has already been ${proposal.status}.`,
    };
  }

  if (proposal.expiresAt <= Date.now()) {
    proposal.status = 'expired';
    return {
      success: false,
      error: 'Proposal has expired (validity is 15 minutes). Please request a fresh change.',
    };
  }

  // ── Concurrency Check: Verify file state has not changed since proposal was generated ──
  if (currentFileTree && typeof currentFileTree === 'object') {
    for (const change of proposal.changes) {
      const currentNode = currentFileTree[change.path];
      const currentContent = currentNode ? (currentNode.value ?? '') : '';
      const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');

      if (currentHash !== change.originalHash) {
        return {
          success: false,
          error: `Concurrent modification detected: "${change.path}" was modified after this proposal was generated. Please review again before applying.`,
        };
      }
    }
  }

  // Mark as applied
  proposal.status = 'applied';
  proposal.appliedAt = Date.now();

  return {
    success: true,
    proposalId,
    appliedChanges: proposal.changes.map(c => ({
      path: c.path,
      action: c.action,
      content: c.proposedContent,
      language: c.language,
    })),
  };
}

/**
 * Reject a proposal.
 *
 * @param {string} proposalId
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
function rejectProposal(proposalId) {
  const proposal = getProposal(proposalId);

  if (!proposal) {
    return {
      success: false,
      error: 'Proposal not found or already expired.',
    };
  }

  if (proposal.status !== 'pending') {
    return {
      success: false,
      error: `Proposal is already ${proposal.status}.`,
    };
  }

  proposal.status = 'rejected';
  proposal.rejectedAt = Date.now();

  return {
    success: true,
    proposalId,
    message: 'Proposal successfully rejected. No files were modified.',
  };
}

function getLanguageFromExt(fp) {
  const ext = path.extname(fp).toLowerCase();
  switch (ext) {
    case '.html':
    case '.htm':
      return 'html';
    case '.css':
      return 'css';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.jsx':
      return 'jsx';
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.json':
      return 'json';
    case '.svg':
      return 'html';
    default:
      return 'plaintext';
  }
}

module.exports = {
  createProposal,
  getProposal,
  applyProposal,
  rejectProposal,
  validateProposedFile,
  ALLOWED_CODE_EXTENSIONS,
};
