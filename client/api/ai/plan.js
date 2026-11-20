/**
 * Vercel Serverless Function: /api/ai/plan
 *
 * Handles execution plan user decisions ('approve', 'reject', 'modify')
 * and execution controls ('pause', 'resume', 'cancel').
 */

import { handlePlanUserDecision, controlPlanExecution } from './taskExecutionEngine.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { plan, type, action, options, reason } = req.body || {};

    if (!plan || typeof plan !== 'object') {
      return res.status(400).json({ error: 'Valid plan object is required.' });
    }

    // Decision vs Control
    if (type === 'control' || ['pause', 'resume', 'cancel'].includes(action)) {
      const updatedPlan = controlPlanExecution(plan, action, reason || '');
      return res.status(200).json({
        success: true,
        action,
        plan: updatedPlan,
      });
    }

    if (type === 'decision' || ['approve', 'reject', 'modify'].includes(action)) {
      const updatedPlan = handlePlanUserDecision(plan, action, options || {});
      return res.status(200).json({
        success: true,
        action,
        plan: updatedPlan,
      });
    }

    return res.status(400).json({ error: `Unsupported action or type: action="${action}", type="${type}"` });
  } catch (err) {
    console.error('[AI Plan Vercel] Error:', err.message);
    return res.status(400).json({ error: err.message || 'Failed to process plan request.' });
  }
}
