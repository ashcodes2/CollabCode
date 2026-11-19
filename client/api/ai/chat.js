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

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    const model = (process.env.GROQ_MODEL || DEFAULT_MODEL).trim();

    if (!apiKey) {
      return res.status(500).json({
        error: 'GROQ_API_KEY is not configured on the server. Please set it in the server environment.',
      });
    }

    // Sanitize conversation history
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

    let groqRes;
    try {
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
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

    if (!groqRes.ok) {
      const errBody = await groqRes.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `Groq API returned HTTP ${groqRes.status}`;

      console.error(`[AI Chat Vercel] Groq API error (${groqRes.status}):`, errMsg);

      if (groqRes.status === 401) {
        return res.status(401).json({ error: 'Authentication failure: Invalid Groq API key.' });
      }
      if (groqRes.status === 404) {
        return res.status(404).json({ error: `Model error: Groq model "${model}" was not found or is unavailable.` });
      }
      if (groqRes.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded: Groq API rate limit reached. Please wait a moment before sending another message.' });
      }
      if (groqRes.status === 400) {
        return res.status(400).json({ error: `Bad request to Groq API: ${errMsg}` });
      }
      if (groqRes.status >= 500) {
        return res.status(502).json({ error: `Groq AI service error (${groqRes.status}): The Groq service is experiencing issues. Please try again.` });
      }

      return res.status(groqRes.status).json({ error: errMsg });
    }

    const data = await groqRes.json();
    const choice = data.choices?.[0]?.message;

    if (!choice) {
      return res.status(502).json({ error: 'No response choice returned from Groq API.' });
    }

    const content = choice.content?.trim() || choice.reasoning?.trim() || 'No answer generated.';

    return res.status(200).json({
      success: true,
      message: {
        role: 'assistant',
        content,
      },
      model: data.model || model,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'Network timeout: Groq API request took longer than 45 seconds to respond. Please try again.',
      });
    }

    console.error('[AI Chat Vercel] Server Error:', error.message);
    return res.status(500).json({
      error: error.message || 'An internal error occurred while communicating with Groq AI.',
    });
  }
}
