/**
 * Vercel Serverless Function: /api/ai/proposal
 * Handles applying or rejecting AI code generation proposals.
 */

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { action, proposalId, proposal, fileTree } = req.body || {};
    const targetAction = action || (req.url && req.url.includes('reject') ? 'reject' : 'apply');

    if (targetAction === 'reject') {
      return res.status(200).json({
        success: true,
        proposalId: proposalId || proposal?.proposalId,
        message: 'Proposal successfully rejected. No files were modified.',
      });
    }

    if (targetAction === 'apply') {
      if (!proposal || !Array.isArray(proposal.changes) || proposal.changes.length === 0) {
        return res.status(400).json({ error: 'Valid proposal with changes is required.' });
      }

      // Concurrency check: verify original hashes match current fileTree
      if (fileTree && typeof fileTree === 'object') {
        for (const change of proposal.changes) {
          const currentNode = fileTree[change.path];
          const currentContent = currentNode ? (currentNode.value ?? '') : '';
          const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');

          if (change.originalHash && currentHash !== change.originalHash) {
            return res.status(409).json({
              error: `Concurrent modification detected: "${change.path}" was modified after this proposal was generated. Please review again before applying.`,
            });
          }
        }
      }

      return res.status(200).json({
        success: true,
        proposalId: proposal.proposalId,
        appliedChanges: proposal.changes.map(c => ({
          path: c.path,
          action: c.action,
          content: c.proposedContent,
          language: c.language,
        })),
      });
    }

    return res.status(400).json({ error: `Unknown proposal action: "${targetAction}"` });
  } catch (err) {
    console.error('[AI Proposal Vercel] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process proposal.' });
  }
}
