const LANGUAGE_MAP = {
  // Web / Scripting
  javascript:  { language: 'nodejs',        versionIndex: '4' },  // Node.js 17.x
  typescript:  { language: 'typescript',    versionIndex: '1' },  // TypeScript 5.x
  python:      { language: 'python3',       versionIndex: '4' },  // Python 3.11.x
  ruby:        { language: 'ruby',          versionIndex: '4' },  // Ruby 3.x
  php:         { language: 'php',           versionIndex: '4' },  // PHP 8.x
  perl:        { language: 'perl',          versionIndex: '3' },  // Perl 5.x

  // Systems / Compiled
  c:           { language: 'c',             versionIndex: '5' },  // GCC 11.x
  cpp:         { language: 'cpp17',         versionIndex: '1' },  // GCC 17 (C++17)
  java:        { language: 'java',          versionIndex: '4' },  // JDK 17.x
  go:          { language: 'go',            versionIndex: '4' },  // Go 1.19
  rust:        { language: 'rust',          versionIndex: '4' },  // Rust 1.x
  kotlin:      { language: 'kotlin',        versionIndex: '3' },  // Kotlin 1.x
  swift:       { language: 'swift',         versionIndex: '4' },  // Swift 5.x
  csharp:      { language: 'csharp',        versionIndex: '4' },  // C# (.NET 6)
  scala:       { language: 'scala',         versionIndex: '4' },  // Scala 3.x

  // Functional / Other
  haskell:     { language: 'haskell',       versionIndex: '4' },  // GHC 9.x
  r:           { language: 'r',             versionIndex: '4' },  // R 4.x
  bash:        { language: 'bash',          versionIndex: '4' },  // Bash 5.x
  sql:         { language: 'sql',           versionIndex: '4' },  // SQLite
};

const MAX_SOURCE_LEN = 100 * 1024;
const MAX_STDIN_LEN  = 10 * 1024;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { language, sourceCode, stdin = '' } = req.body || {};

  if (!language || typeof language !== 'string') {
    return res.status(400).json({ run: { output: '❌ Missing or invalid language parameter.' } });
  }

  if (typeof sourceCode !== 'string') {
    return res.status(400).json({ run: { output: '❌ Missing or invalid sourceCode parameter.' } });
  }

  if (typeof stdin !== 'string') {
    return res.status(400).json({ run: { output: '❌ stdin must be a string.' } });
  }

  if (sourceCode.length > MAX_SOURCE_LEN) {
    return res.status(400).json({
      run: { output: `❌ Source code exceeds maximum allowed size (${MAX_SOURCE_LEN / 1024} KB).` },
    });
  }

  if (stdin.length > MAX_STDIN_LEN) {
    return res.status(400).json({
      run: { output: `❌ Stdin exceeds maximum allowed size (${MAX_STDIN_LEN / 1024} KB).` },
    });
  }

  const lang = LANGUAGE_MAP[language.toLowerCase()];
  if (!lang) {
    return res.status(400).json({
      run: {
        output: `❌ Language '${language}' is not supported.\n\nSupported: ${Object.keys(LANGUAGE_MAP).join(', ')}`,
      },
    });
  }

  const clientId = (process.env.JDOODLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.JDOODLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret || clientId === 'your_jdoodle_client_id_here') {
    return res.status(503).json({
      run: {
        output:
          '⚠️ JDoodle compiler credentials are not configured.\n' +
          'Please set valid JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET environment variables.',
      },
    });
  }

  try {
    const jdoodleRes = await fetch('https://api.jdoodle.com/v1/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        clientSecret,
        script: sourceCode,
        stdin,
        language: lang.language,
        versionIndex: lang.versionIndex,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const data = await jdoodleRes.json();

    if (data.error) {
      return res.status(200).json({
        run: {
          output: `⚠️ Execution Notice: ${data.error} (Status ${data.statusCode || 429}).\n` +
                  'The JDoodle sandbox compiler returned an error or the daily execution quota has been reached.',
          cpuTime: null,
          memory: null,
        },
      });
    }

    const output  = data.output ?? 'Program executed successfully with no stdout output.';
    const cpuTime = data.cpuTime ? `${data.cpuTime}s` : null;
    const memory  = data.memory ? `${data.memory}KB` : null;

    return res.status(200).json({ run: { output, cpuTime, memory } });

  } catch (error) {
    const isTimeout = error.name === 'TimeoutError' || error.message?.includes('timeout');
    const errMsg = isTimeout
      ? '⏱️ Execution timed out after 20 seconds. Infinite loop or slow program execution prevented completion.'
      : `❌ Execution failed: ${error.message}`;

    return res.status(200).json({ run: { output: errMsg, cpuTime: null, memory: null } });
  }
}
