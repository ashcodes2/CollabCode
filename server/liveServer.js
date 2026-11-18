// Live Server Manager & Router
// Manages real project preview servers with dedicated port allocation,
// readiness health probes, SSE live-reload, and fallback proxy routing.

const express = require('express');
const http = require('http');
const net = require('net');

const router = express.Router();

// Active server sessions: roomId -> { server, port, targetFile, sseClients, createdAt }
const activeServers = new Map();

/**
 * Scan for an available port starting at startPort (default 5500)
 */
function findAvailablePort(startPort = 5500) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, '0.0.0.0', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      if (startPort < 5999) {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(new Error('No free ports available in range 5500-5999'));
      }
    });
  });
}

/**
 * Probe the server to confirm it is genuinely ready and accepting HTTP requests
 */
async function waitForServerReady(port, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/__health`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Probe status: ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(250, () => {
          req.destroy();
          reject(new Error('Probe timeout'));
        });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  return false;
}

/**
 * Notify all connected SSE preview clients of a room that files changed
 */
function notifyRoomReload(roomId) {
  const session = activeServers.get(roomId);
  if (session && session.sseClients) {
    session.sseClients.forEach((clientRes) => {
      try {
        clientRes.write('data: reload\n\n');
      } catch {
        session.sseClients.delete(clientRes);
      }
    });
  }
}

function sendUniversalResponse(res, statusCode, contentType, body) {
  if (typeof res.status === 'function' && typeof res.send === 'function') {
    res.status(statusCode);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(body);
  }
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
  });
  return res.end(body);
}

/**
 * Serve an asset from a fileTree
 */
function serveAssetFromTree(tree, assetPath, req, res, port = null) {
  if (!tree) {
    return sendUniversalResponse(res, 404, 'text/html; charset=utf-8', `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Live Server — 404</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #0e0f12; color: #f1f3f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { text-align: center; padding: 40px; background: #181a20; border-radius: 12px; border: 1px solid #272a34; }
          h2 { margin-bottom: 8px; color: #f43f5e; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Workspace Not Ready</h2>
          <p>The workspace session is currently loading.</p>
        </div>
      </body>
      </html>
    `);
  }

  let clean = assetPath.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!clean || clean === '') clean = 'index.html';

  const node = tree[clean];

  if (!node || node.type !== 'file') {
    return sendUniversalResponse(res, 404, 'text/html; charset=utf-8', `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Live Server — 404</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #0e0f12; color: #f1f3f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { text-align: center; padding: 40px; background: #181a20; border-radius: 12px; border: 1px solid #272a34; max-width: 450px; }
          h2 { margin-bottom: 8px; color: #f43f5e; }
          code { background: #272a34; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>File Not Found</h2>
          <p>Cannot find <code>${clean}</code> in workspace.</p>
          <p style="font-size: 13px; color: #9fa6b2;">Make sure <code>index.html</code> or the requested file exists in your Explorer.</p>
        </div>
      </body>
      </html>
    `);
  }

  const ext = clean.split('.').pop().toLowerCase();
  let contentType = 'text/plain; charset=utf-8';

  if (ext === 'html') contentType = 'text/html; charset=utf-8';
  else if (ext === 'css') contentType = 'text/css; charset=utf-8';
  else if (ext === 'js' || ext === 'mjs') contentType = 'application/javascript; charset=utf-8';
  else if (ext === 'json') contentType = 'application/json; charset=utf-8';
  else if (ext === 'svg') contentType = 'image/svg+xml';
  else if (ext === 'png') contentType = 'image/png';
  else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';

  // If HTML, inject automated Live Reload SSE script!
  if (ext === 'html') {
    const liveReloadScript = `
      <script>
        (function() {
          console.log('[CollabCode Live Server] Active and listening for changes...');
          try {
            const sseUrl = window.location.pathname.startsWith('/api/live-server/')
              ? '/api/live-server/sse'
              : '/__live_reload_sse';
            const evtSource = new EventSource(sseUrl);
            evtSource.onmessage = function(e) {
              if (e.data === 'reload') {
                console.log('[CollabCode Live Server] File updated. Reloading page...');
                location.reload();
              }
            };
          } catch(err) {
            console.warn('[CollabCode Live Server] SSE error:', err);
          }
        })();
      </script>
    `;
    let content = node.value || '';
    if (content.includes('</body>')) {
      content = content.replace('</body>', `${liveReloadScript}</body>`);
    } else {
      content += liveReloadScript;
    }
    return sendUniversalResponse(res, 200, contentType, content);
  }

  return sendUniversalResponse(res, 200, contentType, node.value || '');
}

/**
 * Factory for the Live Server router
 */
function createLiveServerRouter(fileTrees) {
  // 1. START LIVE SERVER
  router.post('/start', async (req, res) => {
    try {
      const { roomId, targetFile = 'index.html', fileTree } = req.body;
      if (!roomId) {
        return res.status(400).json({ error: 'roomId is required' });
      }

      // Update in-memory fileTrees if client provided snapshot
      if (fileTree && typeof fileTree === 'object') {
        fileTrees.set(roomId, fileTree);
      }

      const cleanTarget = (targetFile || 'index.html').replace(/^\/+/, '');

      // Check if session already exists
      let session = activeServers.get(roomId);
      if (session) {
        // Probe to check if existing server is still responsive
        const isHealthy = await waitForServerReady(session.port, 5);
        if (isHealthy) {
          return res.json({
            success: true,
            status: 'ready',
            port: session.port,
            url: `http://localhost:${session.port}/${cleanTarget}`,
            proxyUrl: `/api/live-server/${roomId}/${cleanTarget}`,
            roomId,
          });
        }
        // If not healthy, clean up and re-allocate
        try { session.server.close(); } catch { /* ignore */ }
        activeServers.delete(roomId);
      }

      // Find an available port
      const allocatedPort = await findAvailablePort(5500);
      const sseClients = new Set();

      // Create isolated HTTP server for this room
      const previewServer = http.createServer((pReq, pRes) => {
        const parsedUrl = new URL(pReq.url, `http://localhost:${allocatedPort}`);
        const pathname = parsedUrl.pathname;

        // Healthcheck
        if (pathname === '/__health') {
          pRes.writeHead(200, { 'Content-Type': 'application/json' });
          return pRes.end(JSON.stringify({ status: 'ok', port: allocatedPort, roomId }));
        }

        // Live Reload SSE stream
        if (pathname === '/__live_reload_sse') {
          pRes.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
          pRes.write('data: connected\n\n');
          sseClients.add(pRes);
          pReq.on('close', () => sseClients.delete(pRes));
          return;
        }

        // Serve asset from tree
        const subPath = pathname.replace(/^\/+/, '') || cleanTarget;
        const currentTree = fileTrees.get(roomId) || {};
        serveAssetFromTree(currentTree, subPath, pReq, pRes, allocatedPort);
      });

      // Bind to 0.0.0.0
      await new Promise((resolve, reject) => {
        previewServer.listen(allocatedPort, '0.0.0.0', resolve);
        previewServer.on('error', reject);
      });

      // Confirm readiness via loopback probe
      const isReady = await waitForServerReady(allocatedPort, 20);
      if (!isReady) {
        try { previewServer.close(); } catch { /* ignore */ }
        return res.status(500).json({ error: 'Server started but failed readiness health probe' });
      }

      // Store active session
      activeServers.set(roomId, {
        server: previewServer,
        port: allocatedPort,
        targetFile: cleanTarget,
        sseClients,
        createdAt: Date.now(),
      });

      return res.json({
        success: true,
        status: 'ready',
        port: allocatedPort,
        url: `http://localhost:${allocatedPort}/${cleanTarget}`,
        proxyUrl: `/api/live-server/${roomId}/${cleanTarget}`,
        roomId,
      });

    } catch (err) {
      console.error('[Live Server Start Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. STOP LIVE SERVER
  router.post('/stop', (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId is required' });

    const session = activeServers.get(roomId);
    if (session) {
      if (session.sseClients) {
        session.sseClients.forEach(c => { try { c.end(); } catch {} });
        session.sseClients.clear();
      }
      try {
        session.server.close();
      } catch (e) {
        console.error('Error closing live server:', e);
      }
      activeServers.delete(roomId);
      return res.json({ success: true, status: 'stopped', roomId });
    }

    return res.json({ success: true, status: 'already_stopped', roomId });
  });

  // 3. GET LIVE SERVER STATUS
  router.get('/status/:roomId', (req, res) => {
    const { roomId } = req.params;
    const session = activeServers.get(roomId);
    if (session) {
      return res.json({
        running: true,
        port: session.port,
        targetFile: session.targetFile,
        url: `http://localhost:${session.port}/${session.targetFile}`,
      });
    }
    return res.json({ running: false });
  });

  // 4. NOTIFY FILE CHANGE (Triggers live reload)
  router.post('/notify', (req, res) => {
    const { roomId, fileTree } = req.body;
    if (roomId && fileTree) {
      fileTrees.set(roomId, fileTree);
      notifyRoomReload(roomId);
    }
    return res.json({ success: true });
  });

  // 5. REVERSE-PROXY ROUTE (Fallback accessible route through main port)
  router.use('/:roomId', (req, res) => {
    const { roomId } = req.params;
    let assetPath = req.path.replace(/^\/+/, '');
    if (!assetPath) assetPath = 'index.html';
    const tree = fileTrees.get(roomId);
    serveAssetFromTree(tree, assetPath, req, res);
  });

  return router;
}

module.exports = {
  createLiveServerRouter,
  notifyRoomReload,
  activeServers,
};
