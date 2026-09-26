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

export default async function handler(req, res) {
  // Enable CORS
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

  const lang = LANGUAGE_MAP[language];
  if (!lang) {
    return res.status(200).json({
      run: {
        output: `❌ Language '${language}' is not supported.\n\nSupported: ${Object.keys(LANGUAGE_MAP).join(', ')}`,
      },
    });
  }

  const clientId = (process.env.JDOODLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.JDOODLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret || clientId === 'your_jdoodle_client_id_here') {
    return res.status(200).json({
      run: {
        output:
          'ERROR: JDoodle credentials not configured.\n' +
          'Please configure JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET in the deployment environment.',
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
      signal: AbortSignal.timeout(30000),
    });

    const data = await jdoodleRes.json();
    const output = data.output || 'Execution finished with no output.';
    const cpuTime = data.cpuTime || '?';
    const memory = data.memory || '?';

    return res.status(200).json({ run: { output, cpuTime, memory } });
  } catch (error) {
    console.error('Execution handler error:', error.message);
    const errMsg = error.name === 'TimeoutError'
      ? 'Execution timed out after 30 seconds.'
      : `Execution failed: ${error.message}`;

    return res.status(200).json({ run: { output: errMsg } });
  }
}
