import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import { emmetHTML, emmetCSS, emmetJSX } from 'emmet-monaco-es';
import {
  Code2, Globe, RefreshCw, Copy, Check,
  FileCode, FileText, Braces, FileCog, Trash2,
  ChevronDown, ChevronRight, FolderOpen, Folder,
  FilePlus, FolderPlus,
  Search, Files,
  X, Users, Radio, Settings, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Y from 'yjs';
import { io } from 'socket.io-client';
import AiChatWorkspace, { DEFAULT_AI_MESSAGES } from './AiChatWorkspace';
import '../index.css';

// ══════════════════════════════════════════════════════════════════════════════
// ── Dedicated Frontend Web Language Mappings (HTML, CSS, JS) ─────────────────
// ══════════════════════════════════════════════════════════════════════════════
const EXT_TO_LANGUAGE = {
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  json: 'json',
  svg: 'xml',
  xml: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'plaintext',
};

function inferLanguage(name) {
  if (!name) return 'html';
  const ext = name.toLowerCase().split('.').pop();
  return EXT_TO_LANGUAGE[ext] ?? 'plaintext';
}

function getLanguageDisplayName(langKeyOrExt) {
  const norm = langKeyOrExt?.toLowerCase() || '';
  const map = {
    javascript: 'JavaScript',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    xml: 'SVG / XML',
    markdown: 'Markdown',
    plaintext: 'Plain Text',
  };
  return map[norm] || norm.toUpperCase();
}

// ── Default Frontend Starter Files ───────────────────────────────────────────
const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CollabCode Web App</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="card">
    <div class="badge">CollabCode Frontend IDE</div>
    <h1>Build, Style & Interact 🚀</h1>
    <p>Real-time collaborative HTML, CSS and JavaScript workspace.</p>
    <div class="actions">
      <button id="counterBtn" class="btn">Click me: 0</button>
      <button id="logBtn" class="btn secondary">Log to Console</button>
    </div>
    <p id="statusText" class="status">Click a button to test JavaScript interactivity.</p>
  </div>
  <script src="script.js"></script>
</body>
</html>`;

const STARTER_CSS = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f1117;
  color: #f1f3f7;
  padding: 20px;
}

.card {
  background: #181a20;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 36px 32px;
  max-width: 460px;
  width: 100%;
  text-align: center;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
}

.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.12);
  padding: 4px 10px;
  border-radius: 9999px;
  margin-bottom: 16px;
}

h1 {
  font-size: 1.65rem;
  font-weight: 700;
  margin-bottom: 10px;
  background: linear-gradient(135deg, #f1f3f7 0%, #a5b4fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

p {
  font-size: 0.9rem;
  color: #9fa6b2;
  line-height: 1.5;
  margin-bottom: 24px;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 18px;
}

.btn {
  padding: 9px 18px;
  border-radius: 7px;
  border: none;
  background: #6366f1;
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background: #4f46e5;
  transform: translateY(-1px);
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.btn.secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

.status {
  font-size: 0.8rem;
  color: #606675;
  margin-bottom: 0;
}`;

const STARTER_JS = `// Interactive JavaScript for CollabCode Frontend IDE
console.log("CollabCode Frontend Workspace initialized! 🚀");
console.info("Try editing index.html, style.css, or script.js to see live updates.");

let count = 0;
const counterBtn = document.getElementById("counterBtn");
const logBtn = document.getElementById("logBtn");
const statusText = document.getElementById("statusText");

if (counterBtn) {
  counterBtn.addEventListener("click", () => {
    count++;
    counterBtn.textContent = \`Click me: \${count}\`;
    statusText.textContent = \`Button clicked \${count} time\${count === 1 ? '' : 's'}!\`;
    statusText.style.color = "#34d399";
    console.log(\`Counter updated: \${count}\`);
  });
}

if (logBtn) {
  logBtn.addEventListener("click", () => {
    console.log("Standard log:", { timestamp: new Date().toISOString(), count });
    console.warn("Sample warning: Check button click thresholds!");
    console.error("Sample error: Simulated event logged to console.");
    statusText.textContent = "Logged info, warn, and error to the IDE console!";
    statusText.style.color = "#818cf8";
  });
}`;

const DEFAULT_TREE = {
  'index.html': { type: 'file', name: 'index.html', language: 'html', value: STARTER_HTML },
  'style.css':  { type: 'file', name: 'style.css',  language: 'css',  value: STARTER_CSS },
  'script.js':  { type: 'file', name: 'script.js',  language: 'javascript', value: STARTER_JS },
};

function resolvePath(folderPath, href) {
  href = href.replace(/^\.\//, '');
  if (href.startsWith('../')) {
    const parts = folderPath.split('/').filter(Boolean);
    parts.pop();
    href = href.slice(3);
    return parts.length ? `${parts.join('/')}/${href}` : href;
  }
  return folderPath ? `${folderPath}/${href}` : href;
}

// ── In-IDE Live Preview Builder with Console & Runtime Interceptor ────────────
function buildSrcDoc(tree, targetPreviewPath) {
  // Determine entry HTML file
  let previewPath = targetPreviewPath;
  if (!previewPath || !tree[previewPath] || tree[previewPath].type !== 'file') {
    previewPath = 'index.html';
  }
  if (!tree[previewPath] || tree[previewPath].type !== 'file') {
    const htmlKey = Object.keys(tree).find(k => k.endsWith('.html') && tree[k].type === 'file');
    if (htmlKey) previewPath = htmlKey;
    else return '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#15171c;color:#f1f3f7;padding:24px;"><h3>No HTML file found</h3><p>Create an index.html file to view preview.</p></body></html>';
  }

  const htmlNode = tree[previewPath];
  const folderPath = previewPath.includes('/') ? previewPath.split('/').slice(0, -1).join('/') : '';
  let html = htmlNode.value ?? '';

  // Interceptor script to bridge console logs and uncaught runtime errors
  const consoleHookScript = `
<script>
(function() {
  function serialize(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return Object.prototype.toString.call(arg);
      }
    }
    return String(arg);
  }

  function sendLog(level, rawArgs) {
    try {
      var msgs = [];
      for (var i = 0; i < rawArgs.length; i++) {
        msgs.push(serialize(rawArgs[i]));
      }
      window.parent.postMessage({
        type: 'collabcode-console',
        level: level,
        messages: msgs,
        timestamp: new Date().toLocaleTimeString()
      }, '*');
    } catch(err) {}
  }

  ['log', 'info', 'warn', 'error'].forEach(function(lvl) {
    var original = console[lvl];
    console[lvl] = function() {
      sendLog(lvl, arguments);
      if (original) original.apply(console, arguments);
    };
  });

  window.onerror = function(message, source, lineno, colno, error) {
    var details = (lineno ? ' (Line ' + lineno + (colno ? ':' + colno : '') + ')' : '');
    sendLog('error', [(message || 'Script Error') + details]);
    return false;
  };

  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var msg = (reason && reason.message) ? reason.message : String(reason);
    sendLog('error', ['Unhandled Promise Rejection: ' + msg]);
  });
})();
</script>
`;

  // Inject CSS dependencies
  html = html.replace(/<link([^>]*)href=["']([^"']+\.css)["']([^>]*)>/gi, (_m, _a, href, _b) => {
    const resolved = resolvePath(folderPath, href);
    const n = tree[resolved];
    return n ? `<style data-file="${href}">\n${n.value}\n</style>` : `<!-- missing css: ${href} -->`;
  });

  // Inject JS dependencies
  html = html.replace(/<script([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (_m, _a, src, _b) => {
    const resolved = resolvePath(folderPath, src);
    const n = tree[resolved];
    return n ? `<script data-file="${src}">\n${n.value}\n</script>` : `<!-- missing js: ${src} -->`;
  });

  // Support local SVG/Images in file tree if present
  html = html.replace(/<img([^>]*)src=["']([^"']+\.svg)["']([^>]*)>/gi, (_m, a, src, b) => {
    const resolved = resolvePath(folderPath, src);
    const n = tree[resolved];
    if (n && n.value) {
      const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(n.value)}`;
      return `<img${a}src="${dataUri}"${b}>`;
    }
    return _m;
  });

  // Inject console hook inside <head> or at the beginning of document
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, `$&${consoleHookScript}`);
  } else {
    html = consoleHookScript + html;
  }

  return html;
}

function getChildren(tree, prefix) {
  return Object.entries(tree)
    .filter(([path]) => {
      if (prefix === '') return !path.includes('/');
      const rest = path.slice(prefix.length + 1);
      return path.startsWith(prefix + '/') && !rest.includes('/');
    })
    .sort(([, a], [, b]) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (b.type === 'folder' && a.type !== 'folder') return 1;
      return 0;
    });
}

// ── Distinctive CollabCode Monaco Dark Theme ─────────────────────────────────
let emmetInitialized = false;
function defineCollabCodeTheme(monaco) {
  monaco.editor.defineTheme('collabcode-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'keyword', foreground: '818cf8' },
      { token: 'string', foreground: '34d399' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'type', foreground: '38bdf8' },
      { token: 'function', foreground: 'c084fc' },
      { token: 'variable', foreground: 'e2e8f0' },
    ],
    colors: {
      'editor.background': '#15171c',
      'editor.foreground': '#f1f3f7',
      'editor.lineHighlightBackground': '#1c1f26',
      'editorLineNumber.foreground': '#4b5563',
      'editorLineNumber.activeForeground': '#818cf8',
      'editorGutter.background': '#15171c',
      'editorIndentGuide.background1': '#222631',
      'editorIndentGuide.activeBackground1': '#374151',
      'editor.selectionBackground': '#6366f135',
      'editorCursor.foreground': '#818cf8',
      'editor.findMatchBackground': '#6366f140',
      'editor.findMatchHighlightBackground': '#6366f125',
    },
  });
  monaco.editor.setTheme('collabcode-dark');
  if (!emmetInitialized) {
    try {
      emmetHTML(monaco, ['html', 'php', 'vue']);
      emmetCSS(monaco, ['css', 'scss', 'less']);
      emmetJSX(monaco, ['javascript', 'typescript', 'jsx', 'tsx']);
      emmetInitialized = true;
    } catch {
      /* ignore */
    }
  }
}

// ── Frontend File Icons ───────────────────────────────────────────────────────
function FileIcon({ name, size = 13 }) {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  if (ext === 'html' || ext === 'htm') return <FileCode size={size} color="#f97316" />;
  if (ext === 'css' || ext === 'scss') return <FileCog size={size} color="#38bdf8" />;
  if (ext === 'js' || ext === 'jsx') return <Braces size={size} color="#facc15" />;
  if (ext === 'json') return <FileText size={size} color="#fbbf24" />;
  if (ext === 'svg' || ext === 'xml') return <FileCode size={size} color="#a855f7" />;
  return <FileText size={size} color="rgba(255,255,255,0.4)" />;
}

// ── File Tree Node ───────────────────────────────────────────────────────────
function TreeNode({
  path, node, tree, level = 0, activeFilePath,
  onFileClick, onDelete, expandedFolders, toggleFolder,
  onAddFile, onAddFolder
}) {
  const [hovered, setHovered] = useState(false);
  const indent = level * 14;

  if (node.type === 'folder') {
    const isOpen = expandedFolders.has(path);
    const children = getChildren(tree, path);
    return (
      <div key={path}>
        <div
          onClick={() => toggleFolder(path)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: `4px 8px 4px ${10 + indent}px`,
            cursor: 'pointer',
            color: hovered ? '#ffffff' : 'rgba(255,255,255,0.7)',
            fontSize: '12px', userSelect: 'none',
            background: hovered ? 'var(--cc-surface-2)' : 'transparent',
            borderRadius: 4,
          }}
        >
          {isOpen
            ? <ChevronDown size={12} color="rgba(255,255,255,0.5)" />
            : <ChevronRight size={12} color="rgba(255,255,255,0.5)" />}
          {isOpen
            ? <FolderOpen size={14} color="#818cf8" />
            : <Folder size={14} color="#818cf8" />}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
          {hovered && (
            <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => onAddFile(path)} title="New File" style={treeBtnStyle}><FilePlus size={12} /></button>
              <button onClick={() => onAddFolder(path)} title="New Folder" style={treeBtnStyle}><FolderPlus size={12} /></button>
              <button onClick={() => onDelete(path)} title="Delete" style={treeBtnStyle}><Trash2 size={12} /></button>
            </div>
          )}
        </div>
        {isOpen && children.map(([cp, cn]) => (
          <TreeNode
            key={cp}
            path={cp}
            node={cn}
            tree={tree}
            level={level + 1}
            activeFilePath={activeFilePath}
            onFileClick={onFileClick}
            onDelete={onDelete}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onAddFile={onAddFile}
            onAddFolder={onAddFolder}
          />
        ))}
      </div>
    );
  }

  const isActive = activeFilePath === path;

  return (
    <div
      onClick={() => onFileClick(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: `4px 8px 4px ${12 + indent}px`,
        cursor: 'pointer',
        background: isActive ? 'var(--cc-accent-glow)' : hovered ? 'var(--cc-surface-2)' : 'transparent',
        borderLeft: `2px solid ${isActive ? 'var(--cc-accent)' : 'transparent'}`,
        color: isActive ? '#ffffff' : hovered ? '#ffffff' : 'rgba(255,255,255,0.7)',
        fontSize: '12px', userSelect: 'none',
        borderRadius: '0 4px 4px 0',
      }}
    >
      <FileIcon name={node.name} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>
        {node.name}
      </span>
      {hovered && (
        <button onClick={e => { e.stopPropagation(); onDelete(path); }} title="Delete" style={treeBtnStyle}>
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}
const treeBtnStyle = { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', padding: 2, cursor: 'pointer', display: 'flex' };

// ── Toast Notifications ──────────────────────────────────────────────────────
function Toast({ t }) {
  const cls = t.type === 'success' ? 'toast-success-light' : t.type === 'error' ? 'toast-error-light' : 'toast-info-light';
  return (
    <motion.div initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 80, opacity: 0 }} className={cls}>
      {t.msg}
    </motion.div>
  );
}

function EditRequestPopup({ req, onApprove, onDeny }) {
  return (
    <motion.div initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 80, opacity: 0 }} className="edit-req-popup-light">
      <div className="edit-req-header-light">
        <div className="edit-req-avatar-light">👤</div>
        <div>
          <div style={{ fontSize: 10, color: '#9fa6b2', fontWeight: 700 }}>COLLABORATION REQUEST</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{req.requesterName}</div>
        </div>
      </div>
      <div style={{ padding: '8px 12px', fontSize: 11, color: '#9fa6b2' }}>Requested write permissions to edit.</div>
      <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px' }}>
        <button onClick={onApprove} className="edit-req-approve-light">Approve</button>
        <button onClick={onDeny} className="edit-req-deny-light">Deny</button>
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main CollabCode Frontend Web IDE Component ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function EditorPage() {
  // ── Room & Auth States (PRESERVED) ────────────────────────────────────────
  const [roomId] = useState(() => {
    const u = new URLSearchParams(window.location.search);
    let r = u.get('room');
    if (!r) {
      r = Math.random().toString(36).substring(2, 9).toUpperCase();
      window.history.replaceState(null, '', `?room=${r}`);
    }
    return r;
  });
  const [adminToken] = useState(() => localStorage.getItem(`collab_admin_token_${roomId}`) || null);
  const [canEdit, setCanEdit] = useState(() => {
    const rid = new URLSearchParams(window.location.search).get('room') ?? '';
    return sessionStorage.getItem(`can_edit_${rid}`) === 'true';
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Frontend Workspace States ─────────────────────────────────────────────
  const [workspaceMode, setWorkspaceMode] = useState('code'); // 'code' | 'ai'
  const [fileTree, setFileTree] = useState(DEFAULT_TREE);
  const [activeFilePath, setActiveFilePath] = useState('index.html');
  const [openTabs, setOpenTabs] = useState(['index.html', 'style.css', 'script.js']);
  const [dirtyFiles, setDirtyFiles] = useState(new Set());
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [newItem, setNewItem] = useState({ visible: false, parent: '', type: 'file', name: '' });
  const newItemRef = useRef(null);

  // ── AI Chat Persistent State (Retained across workspace switches & session) ──
  const [aiMessages, setAiMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`collab_ai_chat_${roomId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_AI_MESSAGES;
  });
  const [aiInputPrompt, setAiInputPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState(null);

  // Sync AI messages with sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(`collab_ai_chat_${roomId}`, JSON.stringify(aiMessages));
    } catch {
      /* ignore */
    }
  }, [aiMessages, roomId]);

  // ── In-IDE Live Preview States (Single Toggle Button) ──────────────────────
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFilePath, setPreviewFilePath] = useState('index.html');
  const [srcDoc, setSrcDoc] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [splitPct, setSplitPct] = useState(52); // Monaco takes 52%, Preview takes 48%
  const isDraggingSplit = useRef(false);

  // IDE Activity Bar & Sidebar
  const [activeActivityTab, setActiveActivityTab] = useState('explorer'); // 'explorer' | 'search' | 'collab'
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isResizingSidebar = useRef(false);

  // Status & Navigation
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [activeMenu, setActiveMenu] = useState(null);
  const [isQuickOpenVisible, setIsQuickOpenVisible] = useState(false);
  const [quickOpenFilter, setQuickOpenFilter] = useState('');
  const quickOpenInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Yjs / Socket refs (PRESERVED)
  const yjsDocs = useRef(new Map());
  const socketRef = useRef(null);
  const isApplyingRemote = useRef(false);
  const editorRef = useRef(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenu(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // ── Synchronize Live Preview Document ─────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      const doc = buildSrcDoc(fileTree, previewFilePath);
      setSrcDoc(doc);
    }, 280);
    return () => clearTimeout(timer);
  }, [fileTree, previewFilePath]);

  // ── Socket.io + Yjs Real-Time Synchronization (PRESERVED) ─────────────────
  useEffect(() => {
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const rawBackend = import.meta.env.VITE_BACKEND_URL;
    const configuredBackend = typeof rawBackend === 'string' && rawBackend.trim() ? rawBackend.trim().replace(/\/+$/, '') : null;
    const socketEndpoint = configuredBackend || (isLocal ? 'http://localhost:3001' : null);

    if (!socketEndpoint) return;

    const socket = io(socketEndpoint, { reconnectionAttempts: 15, timeout: 10000 });
    socketRef.current = socket;
    Object.keys(DEFAULT_TREE).forEach(p => {
      if (!yjsDocs.current.has(p)) yjsDocs.current.set(p, new Y.Doc());
    });

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-room', { roomId, adminToken });
      socket.emit('sync-tree-snapshot', roomId, fileTree);
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () => setIsConnected(false));

    socket.on('room-role', ({ isAdmin: f, canEdit: ce, adminToken: returnedToken }) => {
      setIsAdmin(f);
      const isAllowed = f || Boolean(ce);
      setCanEdit(isAllowed);
      if (returnedToken) localStorage.setItem(`collab_admin_token_${roomId}`, returnedToken);
      if (isAllowed) sessionStorage.setItem(`can_edit_${roomId}`, 'true');
      else sessionStorage.removeItem(`can_edit_${roomId}`);
    });

    socket.on('sync-step-1', ({ fileName, update }) => {
      if (!fileName || !update) return;
      if (!yjsDocs.current.has(fileName)) yjsDocs.current.set(fileName, new Y.Doc());
      const doc = yjsDocs.current.get(fileName);
      try {
        isApplyingRemote.current = true;
        Y.applyUpdate(doc, new Uint8Array(update));
        const newValue = doc.getText('content').toString();
        if (newValue) {
          setFileTree(prev => {
            if (!prev[fileName]) {
              const name = fileName.split('/').pop();
              return { ...prev, [fileName]: { type: 'file', name, language: inferLanguage(name), value: newValue } };
            }
            if (prev[fileName].value === newValue) return prev;
            return { ...prev, [fileName]: { ...prev[fileName], value: newValue } };
          });
        }
      } catch (err) {
        console.error('sync-step-1 error:', err);
      } finally {
        setTimeout(() => { isApplyingRemote.current = false; }, 30);
      }
    });

    socket.on('sync-update', ({ fileName, update }) => {
      if (!fileName || !update) return;
      if (!yjsDocs.current.has(fileName)) yjsDocs.current.set(fileName, new Y.Doc());
      const doc = yjsDocs.current.get(fileName);
      try {
        isApplyingRemote.current = true;
        const editor = editorRef.current;
        const isCurrentActive = fileName === activeFilePath;
        const savedPos = (editor && isCurrentActive && editor.hasTextFocus()) ? editor.getPosition() : null;

        Y.applyUpdate(doc, new Uint8Array(update));
        const newValue = doc.getText('content').toString();
        setFileTree(prev => {
          if (!prev[fileName]) {
            const name = fileName.split('/').pop();
            return { ...prev, [fileName]: { type: 'file', name, language: inferLanguage(name), value: newValue } };
          }
          if (prev[fileName].value === newValue) return prev;
          return { ...prev, [fileName]: { ...prev[fileName], value: newValue } };
        });

        if (editor && savedPos && isCurrentActive) {
          requestAnimationFrame(() => {
            try { editor.setPosition(savedPos); } catch { /* ignore */ }
          });
        }
      } catch (err) {
        console.error('sync-update error:', err);
      } finally {
        setTimeout(() => { isApplyingRemote.current = false; }, 30);
      }
    });

    socket.on('tree-init', (serverTree) => {
      Object.entries(serverTree).forEach(([p, n]) => {
        if (n.type === 'file') {
          if (!yjsDocs.current.has(p)) {
            const doc = new Y.Doc();
            if (n.value) {
              const yText = doc.getText('content');
              if (yText.length === 0) doc.transact(() => { yText.insert(0, n.value); });
            }
            yjsDocs.current.set(p, doc);
          }
        }
      });
      setFileTree(prev => ({ ...prev, ...serverTree }));
    });

    socket.on('tree-change', ({ op, path, node, extraPaths }) => {
      if (op === 'add') {
        if (node?.type === 'file' && !yjsDocs.current.has(path)) yjsDocs.current.set(path, new Y.Doc());
        setFileTree(prev => ({ ...prev, [path]: node, ...(extraPaths ?? {}) }));
      } else if (op === 'delete') {
        setFileTree(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => { if (k === path || k.startsWith(path + '/')) delete next[k]; });
          return next;
        });
        setOpenTabs(prev => prev.filter(p => p !== path));
      }
    });

    socket.on('edit-request', req => setIncomingRequests(p => [...p, req]));
    socket.on('edit-granted', () => {
      setCanEdit(true);
      sessionStorage.setItem(`can_edit_${roomId}`, 'true');
      addToast('✅ Write access granted!', 'success');
    });
    socket.on('edit-denied', () => {
      addToast('❌ Request denied by admin.', 'error');
    });

    const docs = yjsDocs.current;
    return () => {
      socket.disconnect();
      docs.forEach(doc => { try { doc.destroy(); } catch { /* ignore */ } });
    };
  }, [roomId, addToast, activeFilePath]);

  const activeSyncKey = activeFilePath;

  useEffect(() => {
    if (!yjsDocs.current.has(activeSyncKey)) yjsDocs.current.set(activeSyncKey, new Y.Doc());
    const doc = yjsDocs.current.get(activeSyncKey);
    const onUpdate = update => {
      if (socketRef.current?.connected && !isApplyingRemote.current) {
        socketRef.current.emit('sync-update', roomId, { fileName: activeSyncKey, update: Array.from(update) });
      }
    };
    doc.on('update', onUpdate);
    return () => doc.off('update', onUpdate);
  }, [activeSyncKey, roomId]);

  const applyTextDiff = useCallback((yText, newStr) => {
    const oldStr = yText.toString();
    if (oldStr === newStr) return;
    let start = 0;
    while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) start++;
    let oldEnd = oldStr.length;
    let newEnd = newStr.length;
    while (oldEnd > start && newEnd > start && oldStr[oldEnd - 1] === newStr[newEnd - 1]) { oldEnd--; newEnd--; }

    yText.doc.transact(() => {
      const deleteCount = oldEnd - start;
      if (deleteCount > 0) yText.delete(start, deleteCount);
      const insertStr = newStr.slice(start, newEnd);
      if (insertStr.length > 0) yText.insert(start, insertStr);
    });
  }, []);

  const handleEditorChange = useCallback(val => {
    if (isApplyingRemote.current) return;
    const newVal = val ?? '';
    setFileTree(prev => ({
      ...prev,
      [activeFilePath]: {
        ...(prev[activeFilePath] || { type: 'file', name: activeFilePath, language: inferLanguage(activeFilePath) }),
        value: newVal,
      },
    }));
    setDirtyFiles(prev => new Set(prev).add(activeFilePath));
    const doc = yjsDocs.current.get(activeFilePath);
    if (doc) applyTextDiff(doc.getText('content'), newVal);
  }, [activeFilePath, applyTextDiff]);

  const openFileInTab = useCallback(path => {
    setActiveFilePath(path);
    if (path.endsWith('.html')) setPreviewFilePath(path);
    setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path]);
  }, []);

  const closeTab = useCallback((path, e) => {
    e?.stopPropagation();
    setOpenTabs(prev => {
      const filtered = prev.filter(p => p !== path);
      if (activeFilePath === path) setActiveFilePath(filtered[filtered.length - 1] || 'index.html');
      return filtered;
    });
  }, [activeFilePath]);

  // ── Drag & Resize Handlers ────────────────────────────────────────────────
  const onSidebarResizeStart = useCallback(e => {
    e.preventDefault();
    isResizingSidebar.current = true;
    const onMove = ev => {
      if (!isResizingSidebar.current) return;
      setSidebarWidth(Math.max(160, Math.min(480, ev.clientX - 44)));
    };
    const onUp = () => {
      isResizingSidebar.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      editorRef.current?.layout();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const onSplitDragStart = useCallback(e => {
    e.preventDefault();
    isDraggingSplit.current = true;
    const onMove = ev => {
      if (!isDraggingSplit.current) return;
      const editorAreaStart = isSidebarCollapsed ? 44 : 44 + sidebarWidth;
      const totalWidth = window.innerWidth - editorAreaStart;
      const relativeX = ev.clientX - editorAreaStart;
      const pct = Math.max(25, Math.min(75, (relativeX / totalWidth) * 100));
      setSplitPct(pct);
    };
    const onUp = () => {
      isDraggingSplit.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      editorRef.current?.layout();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [isSidebarCollapsed, sidebarWidth]);

  // Relayout editor when returning to code mode or toggling preview
  useEffect(() => {
    if (workspaceMode === 'code') {
      const t = setTimeout(() => {
        editorRef.current?.layout();
      }, 60);
      return () => clearTimeout(t);
    }
  }, [workspaceMode, isPreviewOpen, splitPct]);

  const activeLanguage = inferLanguage(activeFilePath);

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER COLLABCODE FRONTEND WEB IDE ────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="cc-ide-root">
      {/* ── 1. Top Navigation Bar ───────────────────────────────────────────── */}
      <header className="cc-top-nav">
        {/* Brand & Main Menus */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" className="cc-nav-brand">
            <div className="cc-brand-badge">
              <Code2 size={14} />
            </div>
            <span>CollabCode</span>
          </Link>

          {/* Menus */}
          <div className="cc-nav-menus">
            {['File', 'Edit', 'Selection', 'View', 'Preview'].map(menu => (
              <div key={menu} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                <button
                  className="cc-menu-btn"
                  onClick={() => setActiveMenu(activeMenu === menu ? null : menu)}
                >
                  {menu}
                </button>
                {activeMenu === menu && (
                  <div className="cc-menu-dropdown">
                    <div className="cc-menu-item" onClick={() => { setActiveMenu(null); setIsQuickOpenVisible(true); }}>
                      <span>Quick Open...</span> <span style={{ color: 'var(--cc-text-muted)' }}>Ctrl+P</span>
                    </div>
                    <div className="cc-menu-item" onClick={() => { setActiveMenu(null); setIsPreviewOpen(!isPreviewOpen); }}>
                      <span>{isPreviewOpen ? 'Close Preview' : 'Open Live Preview'}</span>
                      <span style={{ color: 'var(--cc-text-muted)' }}>Alt+P</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center Quick Search Capsule */}
        <div
          className="cc-nav-search"
          onClick={() => { setIsQuickOpenVisible(true); setTimeout(() => quickOpenInputRef.current?.focus(), 40); }}
        >
          <Search size={13} />
          <span>Quick Open files (HTML, CSS, JS)...</span>
          <kbd>Ctrl P</kbd>
        </div>

        {/* Right Actions & Preview Toggle */}
        <div className="cc-nav-actions">
          {/* Workspace Switcher (Code vs AI Chat) */}
          <div className="cc-mode-pill-group">
            <button
              className={`cc-mode-pill ${workspaceMode === 'code' ? 'active' : ''}`}
              onClick={() => setWorkspaceMode('code')}
              title="Code Editor Workspace"
            >
              <Code2 size={12} />
              <span>Code</span>
            </button>
            <button
              className={`cc-mode-pill ${workspaceMode === 'ai' ? 'active ai' : ''}`}
              onClick={() => setWorkspaceMode('ai')}
              title="CollabCode AI Coding Chatbot"
            >
              <Sparkles size={12} />
              <span>AI Chat</span>
            </button>
          </div>

          {/* Dedicated Single Toggle Preview Button */}
          <button
            className={`cc-preview-btn ${isPreviewOpen ? 'active' : ''}`}
            onClick={() => setIsPreviewOpen(prev => !prev)}
            title={isPreviewOpen ? 'Hide Live Preview' : 'Open In-IDE Live Preview (Split View)'}
          >
            <Globe size={13} />
            <span>Preview</span>
            {isPreviewOpen && <span className="cc-preview-active-indicator" />}
          </button>

          {/* Room ID Collaboration Badge */}
          <div
            className="cc-room-badge"
            title="Click to copy Room ID"
            onClick={async () => {
              await navigator.clipboard.writeText(roomId);
              setCopied(true);
              addToast(`Copied Room ID: ${roomId}`, 'success');
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <span className="dot" />
            <span style={{ color: 'var(--cc-text-muted)' }}>Room</span>
            <span className="cc-room-code">{roomId}</span>
            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} color="#9fa6b2" />}
          </div>
        </div>
      </header>

      {/* ── TOAST LAYER ──────────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 30, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toasts.map(t => <Toast key={t.id} t={t} />)}
        </AnimatePresence>
        <AnimatePresence>
          {incomingRequests.slice(0, 1).map(req => (
            <div key={req.requesterSocketId} style={{ pointerEvents: 'auto' }}>
              <EditRequestPopup
                req={req}
                onApprove={() => socketRef.current?.emit('grant-edit', { requesterSocketId: req.requesterSocketId, roomId })}
                onDeny={() => socketRef.current?.emit('deny-edit', { requesterSocketId: req.requesterSocketId, roomId })}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── QUICK OPEN MODAL ─────────────────────────────────────────────────── */}
      {isQuickOpenVisible && (
        <div className="quick-open-overlay" onClick={() => setIsQuickOpenVisible(false)}>
          <div className="quick-open-dialog" onClick={e => e.stopPropagation()}>
            <input
              ref={quickOpenInputRef}
              className="quick-open-input"
              value={quickOpenFilter}
              onChange={e => setQuickOpenFilter(e.target.value)}
              placeholder="Search file by name..."
              autoFocus
            />
            <div className="quick-open-results">
              {openTabs
                .filter(name => name.toLowerCase().includes(quickOpenFilter.toLowerCase()))
                .map(name => (
                  <div key={name} className="quick-open-result" onClick={() => { openFileInTab(name); setIsQuickOpenVisible(false); }}>
                    <FileIcon name={name} size={14} />
                    <span>{name}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. IDE BODY (Activity Bar + Sidebar + Main Workspace) ───────────── */}
      <div className="cc-ide-body">
        {/* Activity Bar */}
        <aside className="cc-activity-bar">
          <button
            className={`cc-act-btn ${workspaceMode === 'code' && activeActivityTab === 'explorer' && !isSidebarCollapsed ? 'active' : ''}`}
            onClick={() => {
              setWorkspaceMode('code');
              if (activeActivityTab === 'explorer') setIsSidebarCollapsed(!isSidebarCollapsed);
              else { setActiveActivityTab('explorer'); setIsSidebarCollapsed(false); }
            }}
            title="Files Explorer"
          >
            <Files size={18} />
          </button>

          <button
            className={`cc-act-btn ${workspaceMode === 'code' && activeActivityTab === 'search' && !isSidebarCollapsed ? 'active' : ''}`}
            onClick={() => {
              setWorkspaceMode('code');
              if (activeActivityTab === 'search') setIsSidebarCollapsed(!isSidebarCollapsed);
              else { setActiveActivityTab('search'); setIsSidebarCollapsed(false); }
            }}
            title="Search Workspace"
          >
            <Search size={18} />
          </button>

          <button
            className={`cc-act-btn ${workspaceMode === 'code' && activeActivityTab === 'collab' && !isSidebarCollapsed ? 'active' : ''}`}
            onClick={() => {
              setWorkspaceMode('code');
              if (activeActivityTab === 'collab') setIsSidebarCollapsed(!isSidebarCollapsed);
              else { setActiveActivityTab('collab'); setIsSidebarCollapsed(false); }
            }}
            title="Collaborators"
          >
            <Users size={18} />
          </button>

          <button
            className={`cc-act-btn ${workspaceMode === 'ai' ? 'active ai-active' : ''}`}
            onClick={() => {
              setWorkspaceMode(prev => prev === 'ai' ? 'code' : 'ai');
            }}
            title="CollabCode AI Coding Chatbot (Groq LLM)"
          >
            <Sparkles size={18} />
          </button>

          <div className="cc-act-spacer" />

          <button className="cc-act-btn" title="Settings">
            <Settings size={18} />
          </button>
        </aside>

        {/* Sidebar (Explorer / Search / Collab) */}
        <aside
          className={`cc-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}
          style={{ width: isSidebarCollapsed ? 0 : sidebarWidth }}
        >
          {!isSidebarCollapsed && (
            <div className="resize-handle-h" onMouseDown={onSidebarResizeStart} />
          )}

          {activeActivityTab === 'explorer' && (
            <>
              <div className="cc-sidebar-header">
                <span className="cc-sidebar-title">Explorer</span>
                <div className="cc-sidebar-tools">
                  <button className="cc-tool-btn" onClick={() => setNewItem({ visible: true, parent: '', type: 'file', name: '' })} title="New File">
                    <FilePlus size={13} />
                  </button>
                  <button className="cc-tool-btn" onClick={() => setNewItem({ visible: true, parent: '', type: 'folder', name: '' })} title="New Folder">
                    <FolderPlus size={13} />
                  </button>
                </div>
              </div>

              {newItem.visible && (
                <div className="new-item-row-light">
                  <FileText size={12} color="#6366f1" />
                  <input
                    ref={newItemRef}
                    value={newItem.name}
                    onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const name = newItem.name.trim();
                        if (name) {
                          const lang = inferLanguage(name);
                          setFileTree(p => ({ ...p, [name]: { type: 'file', name, language: lang, value: '' } }));
                          openFileInTab(name);
                        }
                        setNewItem({ visible: false, parent: '', type: 'file', name: '' });
                      }
                      if (e.key === 'Escape') setNewItem({ visible: false, parent: '', type: 'file', name: '' });
                    }}
                    placeholder="filename.html / style.css / script.js"
                    className="new-item-input-light"
                    autoFocus
                  />
                </div>
              )}

              <div className="cc-sidebar-tree">
                {Object.entries(fileTree).map(([path, node]) => (
                  <TreeNode
                    key={path}
                    path={path}
                    node={node}
                    tree={fileTree}
                    level={0}
                    activeFilePath={activeFilePath}
                    onFileClick={openFileInTab}
                    onDelete={p => setFileTree(prev => { const n = { ...prev }; delete n[p]; return n; })}
                    expandedFolders={expandedFolders}
                    toggleFolder={f => setExpandedFolders(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; })}
                    onAddFile={() => setNewItem({ visible: true, parent: '', type: 'file', name: '' })}
                    onAddFolder={() => setNewItem({ visible: true, parent: '', type: 'folder', name: '' })}
                  />
                ))}
              </div>
            </>
          )}

          {activeActivityTab === 'search' && (
            <div className="cc-search-container">
              <div className="cc-sidebar-header">
                <span className="cc-sidebar-title">Search Project</span>
              </div>
              <div className="cc-search-input-box">
                <input
                  className="cc-search-field"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Find in files..."
                  autoFocus
                />
              </div>
              <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--cc-text-muted)' }}>
                {searchQuery ? `Searching for "${searchQuery}" in HTML/CSS/JS...` : 'Type to search across workspace files.'}
              </div>
            </div>
          )}

          {activeActivityTab === 'collab' && (
            <div className="cc-search-container">
              <div className="cc-sidebar-header">
                <span className="cc-sidebar-title">Collaborators</span>
              </div>
              <div style={{ padding: 14, fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ fontWeight: 600 }}>You ({isAdmin ? 'Admin' : canEdit ? 'Editor' : 'Viewer'})</span>
                </div>
                <div style={{ color: 'var(--cc-text-muted)', fontSize: 11, lineHeight: 1.5 }}>
                  Share Room ID: <strong style={{ color: '#f1f3f7' }}>{roomId}</strong> with peers to write and preview code together in real time.
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* ── 3. Central Main Workspace (Monaco Editor & In-IDE Live Preview OR AI Chat) ── */}
        <section className="cc-main-workspace">
          {/* Code Editor Workspace (Kept mounted in DOM so editor state, cursors & Yjs sync are NEVER destroyed) */}
          <div
            style={{
              display: workspaceMode === 'code' ? 'flex' : 'none',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {/* Tab Strip */}
            <div className="cc-tabs-strip">
              {openTabs.map(tabPath => {
                const isActive = activeFilePath === tabPath;
                const isDirty = dirtyFiles.has(tabPath);
                return (
                  <div
                    key={tabPath}
                    className={`cc-tab ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveFilePath(tabPath)}
                  >
                    <FileIcon name={tabPath} size={13} />
                    <span>{tabPath}</span>
                    {isDirty && <span className="cc-tab-dirty" />}
                    <button className="cc-tab-close" onClick={e => closeTab(tabPath, e)}>
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Editor Surface: 100% Monaco Editor when preview is off, split view when preview is on */}
            <div className="cc-editor-surface">
              {/* Monaco Editor Container */}
              <div
                className="cc-monaco-wrap"
                style={{
                  width: isPreviewOpen ? `${splitPct}%` : '100%',
                  flex: isPreviewOpen ? `0 0 ${splitPct}%` : '1 1 100%',
                }}
              >
                <MonacoEditor
                  path={activeFilePath}
                  height="100%"
                  language={activeLanguage}
                  value={fileTree[activeFilePath]?.value ?? ''}
                  onChange={handleEditorChange}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    defineCollabCodeTheme(monaco);
                    editor.onDidChangeCursorPosition(e => {
                      setCursorPosition({ line: e.position.lineNumber, column: e.position.column });
                    });
                  }}
                  theme="collabcode-dark"
                  options={{
                    minimap: { enabled: true, maxColumn: 80, renderCharacters: false },
                    fontSize: 13.5,
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    fontLigatures: true,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    cursorBlinking: 'smooth',
                    renderLineHighlight: 'all',
                    bracketPairColorization: { enabled: true },
                    autoClosingBrackets: 'always',
                    autoClosingQuotes: 'always',
                    readOnly: !canEdit,
                    automaticLayout: true,
                  }}
                />
              </div>

              {/* Split Resizer Handle (Visible ONLY when preview is open) */}
              {isPreviewOpen && (
                <div className="resize-handle-split" onMouseDown={onSplitDragStart} />
              )}

              {/* In-IDE Live Website Preview Pane (Visible ONLY when preview is open) */}
              {isPreviewOpen && (
                <div
                  className="cc-preview-pane"
                  style={{
                    width: `${100 - splitPct}%`,
                    flex: `0 0 ${100 - splitPct}%`,
                  }}
                >
                  {/* Preview Pane Header */}
                  <div className="cc-preview-pane-header">
                    <div className="cc-preview-pane-title">
                      <Globe size={13} color="#10b981" />
                      <span>Live Preview</span>
                      <span className="cc-preview-file-tag">{previewFilePath}</span>
                    </div>
                    <div className="cc-preview-pane-actions">
                      <button
                        className="cc-tool-btn"
                        onClick={() => setPreviewKey(k => k + 1)}
                        title="Reload Preview"
                      >
                        <RefreshCw size={12} />
                      </button>
                      <button
                        className="cc-tool-btn"
                        onClick={() => setIsPreviewOpen(false)}
                        title="Close Preview (Return to Full Width Editor)"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Preview Frame Container */}
                  <div className="cc-preview-frame-wrap">
                    <iframe
                      key={previewKey}
                      title="CollabCode In-IDE Live Preview"
                      srcDoc={srcDoc}
                      sandbox="allow-scripts allow-modals"
                      className="cc-preview-iframe"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AI Chat Workspace (Kept mounted in DOM so chat state, scrolling & active requests are NEVER destroyed on switch) */}
          <div
            style={{
              display: workspaceMode === 'ai' ? 'flex' : 'none',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <AiChatWorkspace
              onSwitchToCode={() => setWorkspaceMode('code')}
              activeFileName={activeFilePath}
              messages={aiMessages}
              setMessages={setAiMessages}
              inputPrompt={aiInputPrompt}
              setInputPrompt={setAiInputPrompt}
              isLoading={isAiLoading}
              setIsLoading={setIsAiLoading}
              errorMessage={aiErrorMessage}
              setErrorMessage={setAiErrorMessage}
              isVisible={workspaceMode === 'ai'}
            />
          </div>
        </section>
      </div>

      {/* ── 4. Status Bar (Footer) ───────────────────────────────────────────── */}
      <footer className="cc-statusbar">
        <div className="cc-status-group">
          <div className="cc-status-pill accent">
            <Radio size={11} style={{ marginRight: 3 }} />
            <span>{isConnected ? 'Collab: Connected' : 'Collab: Local'}</span>
          </div>

          <div
            className={`cc-status-pill clickable ${workspaceMode === 'ai' ? 'accent' : ''}`}
            onClick={() => setWorkspaceMode(prev => prev === 'ai' ? 'code' : 'ai')}
            title="Toggle CollabCode AI Chat"
          >
            <Sparkles size={11} color="#c084fc" style={{ marginRight: 3 }} />
            <span>CollabCode AI</span>
          </div>
        </div>

        <div className="cc-status-group">
          {/* Live Preview status toggle */}
          <div
            className={`cc-status-pill clickable ${isPreviewOpen ? 'accent' : ''}`}
            onClick={() => setIsPreviewOpen(prev => !prev)}
            title="Toggle Live In-IDE Preview"
          >
            <Globe size={11} style={{ marginRight: 3, color: isPreviewOpen ? '#10b981' : 'inherit' }} />
            <span>{isPreviewOpen ? 'Preview: On' : 'Preview: Off'}</span>
          </div>

          <div className="cc-status-pill">Ln {cursorPosition.line}, Col {cursorPosition.column}</div>
          <div className="cc-status-pill">Spaces: 2</div>
          <div className="cc-status-pill">UTF-8</div>
          <div className="cc-status-pill clickable" style={{ color: 'var(--cc-text-primary)', fontWeight: 600 }}>
            {getLanguageDisplayName(activeLanguage)}
          </div>
        </div>
      </footer>
    </div>
  );
}
