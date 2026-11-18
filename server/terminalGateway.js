const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

// Supported language runtimes for interactive execution
const LOCAL_RUNTIMES = {
  python: {
    command: 'python',
    args: (filePath) => ['-u', filePath], // -u disables stdio buffering!
    fileExt: 'py',
  },
  javascript: {
    command: 'node',
    args: (filePath) => [filePath],
    fileExt: 'js',
  },
};

// Store active process sessions: sessionId -> { process, tempDir, createdAt, timer }
const activeSessions = new Map();

function setupTerminalGateway(io) {
  // Real-time bidirectional execution namespace
  const terminalIo = io.of('/terminal');

  terminalIo.on('connection', (socket) => {
    let currentProcess = null;
    let tempDir = null;
    let timeoutTimer = null;

    // Helper to terminate process and clean up temporary files safely
    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (currentProcess) {
        try {
          if (!currentProcess.killed) {
            currentProcess.kill('SIGTERM');
            setTimeout(() => {
              if (currentProcess && !currentProcess.killed) currentProcess.kill('SIGKILL');
            }, 500);
          }
        } catch (e) {
          /* ignore kill errors */
        }
        currentProcess = null;
      }
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
          /* ignore cleanup errors */
        }
        tempDir = null;
      }
    };

    // 1. START PROCESS (Interactive streaming execution)
    socket.on('start-process', async ({ language, sourceCode, fileName = 'main' }) => {
      cleanup();

      const langKey = (language || '').toLowerCase().trim();
      const localRuntime = LOCAL_RUNTIMES[langKey];

      // If language has a native interactive runtime (e.g. Python, Node.js)
      if (localRuntime) {
        try {
          tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-run-'));
          const ext = localRuntime.fileExt;
          const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '') || `script.${ext}`;
          const filePath = path.join(tempDir, safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`);

          fs.writeFileSync(filePath, sourceCode, 'utf8');

          socket.emit('terminal-stdout', `\x1b[32mPS C:\\project>\x1b[0m ${localRuntime.command} ${safeName}\r\n\r\n`);

          currentProcess = spawn(localRuntime.command, localRuntime.args(filePath), {
            cwd: tempDir,
            env: {
              ...process.env,
              PYTHONUNBUFFERED: '1', // Ensure Python stdout/stderr stream instantly without buffering!
              NODE_ENV: 'development',
            },
          });

          // Stream stdout to client
          currentProcess.stdout.on('data', (data) => {
            const str = data.toString().replace(/(?<!\r)\n/g, '\r\n');
            socket.emit('terminal-stdout', str);
          });

          // Stream stderr to client
          currentProcess.stderr.on('data', (data) => {
            const str = data.toString().replace(/(?<!\r)\n/g, '\r\n');
            socket.emit('terminal-stderr', str);
          });

          // Process completion handler
          currentProcess.on('close', (code, signal) => {
            const exitMsg = signal 
              ? `\r\n\x1b[31m[Process terminated by ${signal}]\x1b[0m\r\n\r\n\x1b[32mPS C:\\project>\x1b[0m `
              : `\r\n\x1b[90m[Process finished with exit code ${code !== null ? code : 0}]\x1b[0m\r\n\r\n\x1b[32mPS C:\\project>\x1b[0m `;
            socket.emit('terminal-exit', { code: code !== null ? code : 0, message: exitMsg });
            cleanup();
          });

          currentProcess.on('error', (err) => {
            socket.emit('terminal-stderr', `\r\nFailed to start process: ${err.message}\r\n`);
            cleanup();
          });

          // 45-second execution safety timeout
          timeoutTimer = setTimeout(() => {
            if (currentProcess) {
              socket.emit('terminal-stderr', '\r\n⏱️ Execution timed out (45s limit reached). Process terminated.\r\n');
              cleanup();
            }
          }, 45000);

        } catch (err) {
          socket.emit('terminal-stderr', `Execution setup error: ${err.message}\r\n`);
          cleanup();
        }
      } else {
        // Fallback to JDoodle Cloud Execution for C++, Java, Rust, Go, etc.
        const clientId = (process.env.JDOODLE_CLIENT_ID || '').trim();
        const clientSecret = (process.env.JDOODLE_CLIENT_SECRET || '').trim();

        const JD_MAP = {
          c: { language: 'c', versionIndex: '5' },
          cpp: { language: 'cpp17', versionIndex: '1' },
          java: { language: 'java', versionIndex: '4' },
          go: { language: 'go', versionIndex: '4' },
          rust: { language: 'rust', versionIndex: '4' },
          ruby: { language: 'ruby', versionIndex: '4' },
          php: { language: 'php', versionIndex: '4' },
          sql: { language: 'sql', versionIndex: '4' },
          bash: { language: 'bash', versionIndex: '4' },
        };

        const jdLang = JD_MAP[langKey];
        if (!jdLang) {
          socket.emit('terminal-stderr', `Language '${language}' does not have a configured execution engine.\r\n`);
          return;
        }

        socket.emit('terminal-stdout', `[Compiling and executing ${language} in cloud sandbox...]\r\n`);

        try {
          const response = await axios.post('https://api.jdoodle.com/v1/execute', {
            clientId,
            clientSecret,
            script: sourceCode,
            stdin: '',
            language: jdLang.language,
            versionIndex: jdLang.versionIndex,
          }, { timeout: 25000 });

          const data = response.data;
          if (data.error) {
            socket.emit('terminal-stderr', `Cloud Execution Notice: ${data.error}\r\n`);
          } else {
            if (data.output) socket.emit('terminal-stdout', data.output);
            socket.emit('terminal-exit', {
              code: 0,
              message: `\r\n[Process finished — CPU: ${data.cpuTime || '0'}s, Mem: ${data.memory || '0'}KB]\r\n`,
            });
          }
        } catch (err) {
          socket.emit('terminal-stderr', `Execution failed: ${err.message}\r\n`);
        }
      }
    });

    // 2. RECEIVE INTERACTIVE STDIN
    socket.on('terminal-stdin', (inputData) => {
      if (currentProcess && currentProcess.stdin && !currentProcess.stdin.destroyed) {
        try {
          currentProcess.stdin.write(inputData);
        } catch (err) {
          socket.emit('terminal-stderr', `\r\nError writing stdin: ${err.message}\r\n`);
        }
      }
    });

    // 3. STOP EXECUTION
    socket.on('stop-process', () => {
      if (currentProcess) {
        socket.emit('terminal-stderr', '^C\r\n\r\n\x1b[32mPS C:\\project>\x1b[0m ');
        cleanup();
      }
    });

    // 4. DISCONNECT CLEANUP
    socket.on('disconnect', () => {
      cleanup();
    });
  });
}

module.exports = { setupTerminalGateway };
