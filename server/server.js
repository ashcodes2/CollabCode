require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const Y = require('yjs');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const executeRoutes = require('./routes/execute');

// Allowed origins: localhost + any Vercel deployment + custom override via env
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  /\.vercel\.app$/,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
];

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

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
});

// ── Per-room state ────────────────────────────────────────────────────────────
// Room metadata: roomId -> { adminSocketId, members: Set<socketId> }
const rooms = new Map();

// Per-room, per-file Yjs docs: roomId -> Map<filePath, Y.Doc>
// This correctly isolates each file's collaborative state.
const roomFileDocs = new Map();

// Persisted file tree per room so late-joining guests see all created files
// Structure: roomId -> { [filePath]: node }  (node.value reflects latest content)
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

// ─────────────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);

    // Track room membership; first to join is the admin
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { adminSocketId: socket.id, members: new Set() });
      console.log(`${socket.id} is admin of room ${roomId}`);
    }
    rooms.get(roomId).members.add(socket.id);

    // Tell this client whether they are the admin
    const isAdmin = rooms.get(roomId).adminSocketId === socket.id;
    socket.emit('room-role', { isAdmin });

    // ── Send per-file Yjs state to the joining client ─────────────────────
    // For each file the room knows about, send a sync-step-1 so the client
    // can reconstruct the latest content for that specific file.
    const docs = getRoomDocs(roomId);
    docs.forEach((doc, fileName) => {
      const stateAsUpdate = Y.encodeStateAsUpdate(doc);
      if (stateAsUpdate.length > 0) {
        socket.emit('sync-step-1', { fileName, update: Array.from(stateAsUpdate) });
      }
    });

    // Send the current file tree to the joining client so late-joiners
    // see all files/folders created after the room was opened.
    // The tree nodes already have their latest `value` kept in sync below.
    if (fileTrees.has(roomId)) {
      socket.emit('tree-init', fileTrees.get(roomId));
    }
  });

  // ── Yjs sync ─────────────────────────────────────────────────────────────
  // Payload: { fileName, update }
  socket.on('sync-update', (roomId, payload) => {
    const { fileName, update } = payload;
    if (!fileName || !update) return;

    // Apply to the server-side per-file doc so it tracks the latest state
    const doc = getFileDoc(roomId, fileName);
    const updateArray = new Uint8Array(update);
    try {
      Y.applyUpdate(doc, updateArray);
    } catch (_) {}

    // Keep the file tree value in sync so late-joining guests get fresh content.
    // Also handles default files (index.html, style.css, script.js) that are
    // never explicitly added via tree-change because they exist client-side by default.
    if (!fileTrees.has(roomId)) fileTrees.set(roomId, {});
    const tree = fileTrees.get(roomId);
    const latestValue = doc.getText('content').toString();
    if (tree[fileName]) {
      tree[fileName] = { ...tree[fileName], value: latestValue };
    } else {
      // Default file — create a minimal record so guests receive it
      const name = fileName.split('/').pop();
      const extMap = { html: 'html', css: 'css', js: 'javascript', ts: 'typescript', json: 'json' };
      const ext = name.split('.').pop();
      tree[fileName] = { type: 'file', name, language: extMap[ext] ?? 'plaintext', value: latestValue };
    }

    // Relay to all OTHER clients in the room
    socket.to(roomId).emit('sync-update', payload);
  });

  // ── Awareness (cursors) ──────────────────────────────────────────────────
  socket.on('awareness-update', (roomId, awarenessUpdate) => {
    socket.to(roomId).emit('awareness-update', awarenessUpdate);
  });

  // ── Mode change (web ↔ code) + language change ────────────────────────────
  // Relay to all other clients so everyone stays in sync
  socket.on('mode-change', (roomId, payload) => {
    socket.to(roomId).emit('mode-change', payload);
  });



  // ── File/folder tree structural changes (add / delete) ───────────────────
  // Payload: { op: 'add'|'delete', path, node?, extraPaths? }
  socket.on('tree-change', (roomId, payload) => {
    // Persist the tree mutation so late-joining guests receive the full tree
    if (!fileTrees.has(roomId)) fileTrees.set(roomId, {});
    const tree = fileTrees.get(roomId);

    if (payload.op === 'add') {
      tree[payload.path] = payload.node;
      if (payload.extraPaths) Object.assign(tree, payload.extraPaths);

      // Pre-initialise Yjs docs for new files so they are ready to receive updates
      const docs = getRoomDocs(roomId);
      const initDoc = (p, n) => {
        if (n && n.type === 'file' && !docs.has(p)) {
          const doc = new Y.Doc();
          // Seed the doc with the initial value if present
          if (n.value) {
            doc.getText('content').insert(0, n.value);
          }
          docs.set(p, doc);
        }
      };
      initDoc(payload.path, payload.node);
      if (payload.extraPaths) {
        Object.entries(payload.extraPaths).forEach(([p, n]) => initDoc(p, n));
      }
    } else if (payload.op === 'delete') {
      const docs = getRoomDocs(roomId);
      Object.keys(tree).forEach(k => {
        if (k === payload.path || k.startsWith(payload.path + '/')) {
          delete tree[k];
          if (docs.has(k)) { docs.get(k).destroy(); docs.delete(k); }
        }
      });
    }

    // Relay to all other clients in the room
    socket.to(roomId).emit('tree-change', payload);
  });

  // ── Edit access request flow ──────────────────────────────────────────────
  // Guest → Server → Admin
  socket.on('request-edit', ({ roomId, requesterName }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const adminId = room.adminSocketId;
    console.log(`Edit request from ${socket.id} (${requesterName}) in room ${roomId} → admin ${adminId}`);
    io.to(adminId).emit('edit-request', {
      requesterSocketId: socket.id,
      requesterName,
      roomId,
    });
  });

  // Admin approves → notify guest
  socket.on('grant-edit', ({ requesterSocketId, roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminSocketId !== socket.id) return; // only admin can grant
    console.log(`Admin granted edit to ${requesterSocketId} in room ${roomId}`);
    io.to(requesterSocketId).emit('edit-granted');
  });

  // Admin denies → notify guest
  socket.on('deny-edit', ({ requesterSocketId, roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminSocketId !== socket.id) return;
    console.log(`Admin denied edit to ${requesterSocketId} in room ${roomId}`);
    io.to(requesterSocketId).emit('edit-denied');
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    rooms.forEach((room, roomId) => {
      if (room.members.has(socket.id)) {
        room.members.delete(socket.id);

        if (room.members.size === 0) {
          // Room is completely empty — clean up all memory & destroy Yjs docs
          rooms.delete(roomId);
          const docs = roomFileDocs.get(roomId);
          if (docs) { docs.forEach(d => d.destroy()); }
          roomFileDocs.delete(roomId);
          fileTrees.delete(roomId);
          console.log(`Room ${roomId} emptied and cleaned up.`);
        } else if (room.adminSocketId === socket.id) {
          // Admin left, promote next member
          const next = [...room.members][0];
          if (next) {
            room.adminSocketId = next;
            io.to(next).emit('room-role', { isAdmin: true });
            console.log(`New admin of ${roomId}: ${next}`);
          }
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend Socket.io server running on port ${PORT}`);
});
