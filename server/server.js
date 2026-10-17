require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const Y = require('yjs');
const crypto = require('crypto');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const executeRoutes = require('./routes/execute');

// Allowed origins: localhost + any Vercel deployment + custom override via env
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'https://collabcode-editor.vercel.app',
  /\.vercel\.app$/,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
];

// Production environment validation
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'super-secret-key-change-in-prod') {
    console.error('FATAL: JWT_SECRET environment variable is required and must not use the default secret in production.');
    process.exit(1);
  }
}

const app = express();
app.disable('x-powered-by');

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// Healthcheck & root status
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/', (req, res) => res.json({ message: 'CollabCode API & Socket Server running', status: 'ok' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/execute', executeRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/collab-editor')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 2e6, // 2MB payload cap
  pingTimeout: 20000,
  pingInterval: 10000,
});

// ── Per-room state ────────────────────────────────────────────────────────────
// Room metadata: roomId -> { adminSocketId, adminToken, members: Set<socketId>, editors: Set<socketId>, cleanupTimer, adminReconnectTimer }
const rooms = new Map();

// Per-room, per-file Yjs docs: roomId -> Map<filePath, Y.Doc>
const roomFileDocs = new Map();

// Persisted file tree per room so late-joining guests see all created files
const fileTrees = new Map();

/** Get or create the per-file doc map for a room */
function getRoomDocs(roomId) {
  if (!roomFileDocs.has(roomId)) roomFileDocs.set(roomId, new Map());
  return roomFileDocs.get(roomId);
}

/** Get or create a Y.Doc for a specific file in a room */
function getFileDoc(roomId, fileName) {
  const docs = getRoomDocs(roomId);
  if (!docs.has(fileName)) docs.set(fileName, new Y.Doc());
  return docs.get(fileName);
}

/** Sanitize file paths to prevent directory traversal */
function sanitizePath(filePath) {
  if (typeof filePath !== 'string') return null;
  const clean = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.includes('..') || clean.length > 255) return null;
  return clean;
}

/** Timing-safe comparison to prevent timing attacks on adminToken verification */
function verifyAdminToken(providedToken, actualToken) {
  if (typeof providedToken !== 'string' || typeof actualToken !== 'string') return false;
  const bufA = Buffer.from(providedToken, 'utf8');
  const bufB = Buffer.from(actualToken, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─────────────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (data) => {
    let roomId = null;
    let clientAdminToken = null;

    if (typeof data === 'string') {
      roomId = data.trim();
    } else if (data && typeof data === 'object') {
      roomId = typeof data.roomId === 'string' ? data.roomId.trim() : null;
      clientAdminToken = typeof data.adminToken === 'string' ? data.adminToken.trim() : null;
    }

    if (!roomId || roomId.length > 64) return;

    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);

    if (!rooms.has(roomId)) {
      // Server authoritatively generates a 256-bit cryptographically secure token
      const serverAdminToken = crypto.randomBytes(32).toString('hex');
      rooms.set(roomId, {
        adminSocketId: socket.id,
        adminToken: serverAdminToken,
        members: new Set([socket.id]),
        editors: new Set([socket.id]),
        cleanupTimer: null,
        adminReconnectTimer: null,
      });
      console.log(`${socket.id} created room ${roomId} as admin`);
    } else {
      const room = rooms.get(roomId);
      room.members.add(socket.id);

      // Cancel room cleanup timer if active
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }

      // If client presents a valid cryptographically matching admin token, restore admin rights!
      if (clientAdminToken && room.adminToken && verifyAdminToken(clientAdminToken, room.adminToken)) {
        room.adminSocketId = socket.id;
        room.editors.add(socket.id);
        if (room.adminReconnectTimer) {
          clearTimeout(room.adminReconnectTimer);
          room.adminReconnectTimer = null;
        }
        console.log(`${socket.id} restored as admin of room ${roomId}`);
      }
    }

    const room = rooms.get(roomId);
    const isAdmin = room.adminSocketId === socket.id;
    const canEdit = isAdmin || room.editors.has(socket.id);

    // Send role info. adminToken is ONLY transmitted to the authenticated admin
    socket.emit('room-role', {
      isAdmin,
      canEdit,
      adminToken: isAdmin ? room.adminToken : undefined,
    });

    // Send per-file Yjs state to the joining client
    const docs = getRoomDocs(roomId);
    docs.forEach((doc, fileName) => {
      try {
        const stateAsUpdate = Y.encodeStateAsUpdate(doc);
        if (stateAsUpdate.length > 0) {
          socket.emit('sync-step-1', { fileName, update: Array.from(stateAsUpdate) });
        }
      } catch (err) {
        console.error(`Error encoding state for ${fileName}:`, err.message);
      }
    });

    // Send current file tree
    if (fileTrees.has(roomId)) {
      socket.emit('tree-init', fileTrees.get(roomId));
    }
  });

  // ── Yjs sync ─────────────────────────────────────────────────────────────
  socket.on('sync-update', (roomIdRaw, payload) => {
    if (typeof roomIdRaw !== 'string' || !payload || typeof payload !== 'object') return;
    const roomId = roomIdRaw.trim();
    const room = rooms.get(roomId);

    // Authorization: verify socket is in room and is an editor or admin
    if (!room || !room.members.has(socket.id) || (!room.editors.has(socket.id) && room.adminSocketId !== socket.id)) {
      return;
    }

    const { fileName: rawFileName, update } = payload;
    const fileName = sanitizePath(rawFileName);
    if (!fileName || !update || (!Array.isArray(update) && !(update instanceof Uint8Array))) {
      return;
    }

    if (update.length === 0 || update.length > 2000000) {
      return;
    }

    try {
      const doc = getFileDoc(roomId, fileName);
      const updateArray = new Uint8Array(update);
      Y.applyUpdate(doc, updateArray);

      // Keep file tree value in sync
      if (!fileTrees.has(roomId)) fileTrees.set(roomId, {});
      const tree = fileTrees.get(roomId);
      const latestValue = doc.getText('content').toString();

      if (tree[fileName]) {
        tree[fileName] = { ...tree[fileName], value: latestValue };
      } else {
        const name = fileName.split('/').pop();
        const extMap = { html: 'html', css: 'css', js: 'javascript', ts: 'typescript', json: 'json' };
        const ext = name.split('.').pop();
        tree[fileName] = { type: 'file', name, language: extMap[ext] ?? 'plaintext', value: latestValue };
      }

      // Relay to all OTHER clients in the room
      socket.to(roomId).emit('sync-update', { fileName, update });
    } catch (err) {
      console.error('Yjs sync-update error:', err.message);
    }
  });

  // ── Awareness (cursors) ──────────────────────────────────────────────────
  socket.on('awareness-update', (roomIdRaw, awarenessUpdate) => {
    if (typeof roomIdRaw !== 'string' || !awarenessUpdate) return;
    const roomId = roomIdRaw.trim();
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;
    socket.to(roomId).emit('awareness-update', awarenessUpdate);
  });

  // ── Mode change (web ↔ code) + language change ────────────────────────────
  socket.on('mode-change', (roomIdRaw, payload) => {
    if (typeof roomIdRaw !== 'string' || !payload) return;
    const roomId = roomIdRaw.trim();
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id) || (!room.editors.has(socket.id) && room.adminSocketId !== socket.id)) return;
    socket.to(roomId).emit('mode-change', payload);
  });

  // ── File/folder tree structural changes (add / delete) ───────────────────
  socket.on('tree-change', (roomIdRaw, payload) => {
    if (typeof roomIdRaw !== 'string' || !payload || typeof payload !== 'object') return;
    const roomId = roomIdRaw.trim();
    const room = rooms.get(roomId);

    if (!room || !room.members.has(socket.id) || (!room.editors.has(socket.id) && room.adminSocketId !== socket.id)) {
      return;
    }

    const { op, path: rawPath, node, extraPaths } = payload;
    const path = sanitizePath(rawPath);
    if (!path) return;

    if (!fileTrees.has(roomId)) fileTrees.set(roomId, {});
    const tree = fileTrees.get(roomId);

    if (op === 'add' && node && typeof node === 'object') {
      const sanitizedNode = {
        type: node.type === 'folder' ? 'folder' : 'file',
        name: typeof node.name === 'string' ? node.name.slice(0, 100) : 'untitled',
        language: typeof node.language === 'string' ? node.language.slice(0, 30) : 'plaintext',
        value: typeof node.value === 'string' ? node.value.slice(0, 500000) : '',
      };
      tree[path] = sanitizedNode;

      const docs = getRoomDocs(roomId);
      const initDoc = (p, n) => {
        const cleanP = sanitizePath(p);
        if (cleanP && n && n.type === 'file' && !docs.has(cleanP)) {
          const doc = new Y.Doc();
          if (n.value) {
            doc.getText('content').insert(0, n.value);
          }
          docs.set(cleanP, doc);
        }
      };

      initDoc(path, sanitizedNode);

      if (extraPaths && typeof extraPaths === 'object') {
        const sanitizedExtra = {};
        Object.entries(extraPaths).forEach(([ep, en]) => {
          const cleanEp = sanitizePath(ep);
          if (cleanEp && en && typeof en === 'object') {
            const cleanEn = {
              type: en.type === 'folder' ? 'folder' : 'file',
              name: typeof en.name === 'string' ? en.name.slice(0, 100) : 'untitled',
              language: typeof en.language === 'string' ? en.language.slice(0, 30) : 'plaintext',
              value: typeof en.value === 'string' ? en.value.slice(0, 500000) : '',
            };
            sanitizedExtra[cleanEp] = cleanEn;
            tree[cleanEp] = cleanEn;
            initDoc(cleanEp, cleanEn);
          }
        });
      }
    } else if (op === 'delete') {
      const docs = getRoomDocs(roomId);
      Object.keys(tree).forEach(k => {
        if (k === path || k.startsWith(path + '/')) {
          delete tree[k];
          if (docs.has(k)) {
            try { docs.get(k).destroy(); } catch { /* ignore */ }
            docs.delete(k);
          }
        }
      });
    }

    // Relay to all other clients
    socket.to(roomId).emit('tree-change', { op, path, node, extraPaths });
  });

  // ── Edit access request flow ──────────────────────────────────────────────
  socket.on('request-edit', ({ roomId: roomIdRaw, requesterName }) => {
    if (typeof roomIdRaw !== 'string') return;
    const roomId = roomIdRaw.trim();
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const adminId = room.adminSocketId;
    if (!adminId) return;

    const safeName = typeof requesterName === 'string' ? requesterName.slice(0, 30) : 'Guest';
    io.to(adminId).emit('edit-request', {
      requesterSocketId: socket.id,
      requesterName: safeName,
      roomId,
    });
  });

  // Admin approves → notify guest and add to room.editors
  socket.on('grant-edit', ({ requesterSocketId, roomId: roomIdRaw }) => {
    if (typeof roomIdRaw !== 'string') return;
    const roomId = roomIdRaw.trim();
    const room = rooms.get(roomId);
    if (!room || room.adminSocketId !== socket.id) return;
    if (!room.members.has(requesterSocketId)) return;

    room.editors.add(requesterSocketId);
    io.to(requesterSocketId).emit('edit-granted');
  });

  // Admin denies → notify guest
  socket.on('deny-edit', ({ requesterSocketId, roomId: roomIdRaw }) => {
    if (typeof roomIdRaw !== 'string') return;
    const roomId = roomIdRaw.trim();
    const room = rooms.get(roomId);
    if (!room || room.adminSocketId !== socket.id) return;

    room.editors.delete(requesterSocketId);
    io.to(requesterSocketId).emit('edit-denied');
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    rooms.forEach((room, roomId) => {
      if (room.members.has(socket.id)) {
        room.members.delete(socket.id);
        room.editors.delete(socket.id);

        if (room.members.size === 0) {
          // Grace period for room cleanup: 15s to allow fast page reloads/reconnects
          if (!room.cleanupTimer) {
            room.cleanupTimer = setTimeout(() => {
              const currentRoom = rooms.get(roomId);
              if (currentRoom && currentRoom.members.size === 0) {
                rooms.delete(roomId);
                const docs = roomFileDocs.get(roomId);
                if (docs) {
                  docs.forEach(d => {
                    try { d.destroy(); } catch { /* ignore */ }
                  });
                }
                roomFileDocs.delete(roomId);
                fileTrees.delete(roomId);
                console.log(`Room ${roomId} destroyed after grace period.`);
              }
            }, 15000);
          }
        } else if (room.adminSocketId === socket.id) {
          // Admin disconnected: give a 30s grace window before promoting another member
          room.adminSocketId = null;
          if (!room.adminReconnectTimer) {
            room.adminReconnectTimer = setTimeout(() => {
              const currentRoom = rooms.get(roomId);
              if (currentRoom && !currentRoom.adminSocketId && currentRoom.members.size > 0) {
                const next = [...currentRoom.members][0];
                if (next) {
                  currentRoom.adminSocketId = next;
                  currentRoom.editors.add(next);
                  currentRoom.adminToken = crypto.randomBytes(32).toString('hex');
                  io.to(next).emit('room-role', { isAdmin: true, canEdit: true, adminToken: currentRoom.adminToken });
                  console.log(`Admin rights reassigned to ${next} in room ${roomId}`);
                }
              }
            }, 30000);
          }
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend Socket.io server running on port ${PORT}`);
});

function gracefulShutdown(signal) {
  console.log(`${signal} received: closing server`);
  server.close(() => {
    mongoose.connection.close(false).finally(() => {
      process.exit(0);
    });
  });
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, io, rooms, sanitizePath, verifyAdminToken };
