const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.status(200).json({
    available: true,
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
  });
}
