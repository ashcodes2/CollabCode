const express = require('express');
const router = express.Router();

const SYSTEM_PROMPT = `You are CollabCode AI, a helpful programming assistant integrated into a collaborative web development IDE.

Your primary responsibility is to help developers understand programming concepts, solve coding problems, explain code, suggest improvements and generate code examples.

You are especially knowledgeable about:
- HTML
- CSS
- JavaScript
- React
- Node.js
- Programming fundamentals
- Data structures and algorithms
- Debugging
- Web development

Give clear, accurate and practical answers.

When providing code:
- Use properly formatted code blocks.
- Explain important parts.
- Prefer simple examples when teaching beginners.
- Follow good coding practices.

If the user asks a question unrelated to programming, politely guide them back to software engineering and coding topics.`;

/**
 * GET /api/ai/status
 * Check if Groq AI service is configured
 */
router.get('/status', (req, res) => {
  const isConfigured = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
  res.json({
    available: isConfigured,
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  });
});

/**
 * POST /api/ai/chat
 * Conversational Coding Assistant via Groq API
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return res.status(500).json({
        error: 'GROQ_API_KEY is not configured on the server. Please set it in the server environment.',
      });
    }

    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

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

    const payloadMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...sanitizedMessages,
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    let response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: payloadMessages,
          temperature: 0.7,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `Groq API returned HTTP ${response.status}`;

      console.error(`[AI Chat] Groq API error (${response.status}):`, errMsg);

      if (response.status === 401) {
        return res.status(401).json({ error: 'Authentication failure: Invalid Groq API key. Please check GROQ_API_KEY in server/.env.' });
      }
      if (response.status === 404) {
        return res.status(404).json({ error: `Model error: Groq model "${model}" was not found or is unavailable.` });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded: Groq API rate limit reached. Please wait a moment before sending another message.' });
      }
      if (response.status === 400) {
        return res.status(400).json({ error: `Bad request to Groq API: ${errMsg}` });
      }
      if (response.status >= 500) {
        return res.status(502).json({ error: `Groq AI service error (${response.status}): The Groq service is experiencing issues. Please try again.` });
      }

      return res.status(response.status).json({ error: errMsg });
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message;

    if (!choice) {
      return res.status(502).json({ error: 'No response choice returned from Groq API.' });
    }

    const content = choice.content?.trim() || choice.reasoning?.trim() || 'No answer generated.';

    return res.json({
      success: true,
      message: {
        role: 'assistant',
        content,
      },
      model: data.model || model,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[AI Chat] Groq request timed out.');
      return res.status(504).json({
        error: 'Network timeout: Groq API request took longer than 45 seconds to respond. Please try again.',
      });
    }

    console.error('[AI Chat] Server Communication Error:', error.message);
    const isNetworkError = error.code === 'ENOTFOUND' || error.cause?.code === 'ENOTFOUND' || error.message.includes('fetch failed');
    return res.status(isNetworkError ? 503 : 500).json({
      error: isNetworkError
        ? 'Network error: Backend could not reach api.groq.com. Please check server internet connectivity.'
        : (error.message || 'An internal error occurred while communicating with Groq AI.'),
    });
  }
});

module.exports = router;
