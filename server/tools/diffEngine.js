/**
 * server/tools/diffEngine.js
 *
 * Fast, robust line-by-line diff engine for CollabCode AI Agent proposals.
 * Computes additions, deletions, line numbers, and formatted unified diffs.
 */

/**
 * Computes line-by-line diff between two strings using Longest Common Subsequence (LCS).
 *
 * @param {string} oldStr - Original file content
 * @param {string} newStr - Proposed new file content
 * @returns {{
 *   lines: Array<{ type: 'unchanged' | 'added' | 'removed', text: string, lineOld?: number, lineNew?: number }>,
 *   additions: number,
 *   deletions: number,
 *   unifiedText: string,
 * }}
 */
function computeLineDiff(oldStr = '', newStr = '') {
  // If identical, return early
  if (oldStr === newStr) {
    const lines = (oldStr || '').split('\n').map((text, idx) => ({
      type: 'unchanged',
      text,
      lineOld: idx + 1,
      lineNew: idx + 1,
      originalLine: idx + 1,
      proposedLine: idx + 1,
    }));
    return {
      lines,
      additions: 0,
      deletions: 0,
      unifiedText: lines.map(l => ` ${l.text}`).join('\n'),
    };
  }

  // Handle new file creation (oldStr empty)
  if (!oldStr && newStr) {
    const newLines = newStr.split('\n');
    const lines = newLines.map((text, idx) => ({
      type: 'added',
      text,
      lineNew: idx + 1,
      proposedLine: idx + 1,
    }));
    return {
      lines,
      additions: lines.length,
      deletions: 0,
      unifiedText: lines.map(l => `+${l.text}`).join('\n'),
    };
  }

  // Handle file clearing (newStr empty)
  if (oldStr && !newStr) {
    const oldLines = oldStr.split('\n');
    const lines = oldLines.map((text, idx) => ({
      type: 'deleted',
      text,
      lineOld: idx + 1,
      originalLine: idx + 1,
    }));
    return {
      lines,
      additions: 0,
      deletions: lines.length,
      unifiedText: lines.map(l => `-${l.text}`).join('\n'),
    };
  }

  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // Cap LCS matrix size to avoid memory pressure on unusually large files (>3000 lines)
  if (m * n > 4000000) {
    // Fallback: fast chunk diff
    return computeChunkDiff(oldLines, newLines);
  }

  // LCS Dynamic Programming Matrix
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const diff = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: 'unchanged',
        text: oldLines[i - 1],
        lineOld: i,
        lineNew: j,
        originalLine: i,
        proposedLine: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({
        type: 'added',
        text: newLines[j - 1],
        lineNew: j,
        proposedLine: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({
        type: 'deleted',
        text: oldLines[i - 1],
        lineOld: i,
        originalLine: i,
      });
      i--;
    }
  }

  const additions = diff.filter(d => d.type === 'added').length;
  const deletions = diff.filter(d => d.type === 'deleted').length;
  const unifiedText = diff
    .map(d => (d.type === 'added' ? `+${d.text}` : d.type === 'deleted' ? `-${d.text}` : ` ${d.text}`))
    .join('\n');

  return {
    lines: diff,
    additions,
    deletions,
    unifiedText,
  };
}

/** Fallback chunk diff for massive files */
function computeChunkDiff(oldLines, newLines) {
  const diff = [
    ...oldLines.map((t, idx) => ({ type: 'removed', text: t, lineOld: idx + 1 })),
    ...newLines.map((t, idx) => ({ type: 'added', text: t, lineNew: idx + 1 })),
  ];
  return {
    lines: diff,
    additions: newLines.length,
    deletions: oldLines.length,
    unifiedText: diff.map(d => (d.type === 'added' ? `+ ${d.text}` : `- ${d.text}`)).join('\n'),
  };
}

module.exports = {
  computeLineDiff,
};
