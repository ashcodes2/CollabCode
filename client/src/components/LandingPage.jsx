import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, Lock, LogIn, Plus, Eye, EyeOff,
  AlertCircle, Zap, Users, Terminal, Globe, Shield,
  ArrowRight, RefreshCw, Copy, Check,
  GitBranch, Play, Cpu, ArrowUpRight,
} from 'lucide-react';
import '../index.css';

// ── Utilities ─────────────────────────────────────────────────────────────────
function generateRoomId() {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const CODE_LINES = [
  { text: 'const room = await Room.join(id);',      color: '#60A5FA', delay: 0    },
  { text: 'room.on("sync", applyUpdate);',          color: '#A78BFA', delay: 0.3  },
  { text: 'editor.setLanguage("python");',          color: '#34D399', delay: 0.6  },
  { text: 'socket.emit("tree-change", payload);',   color: '#60A5FA', delay: 0.9  },
  { text: 'Y.applyUpdate(doc, new Uint8Array(u));', color: '#A78BFA', delay: 1.2  },
];

const COLLABORATORS = [
  { name: 'Alex', color: '#3B82F6', pos: { x: 58,  y: 38  }, delay: 0    },
  { name: 'Sam',  color: '#8B5CF6', pos: { x: 166, y: 72  }, delay: 0.4  },
  { name: 'Mia',  color: '#10B981', pos: { x: 106, y: 120 }, delay: 0.8  },
];

const FEATURES = [
  {
    icon: <Zap size={18} />,
    title: 'Real-time CRDT Sync',
    desc: 'Conflict-free collaborative editing powered by Yjs. Changes from multiple users merge automatically without data loss.',
  },
  {
    icon: <Terminal size={18} />,
    title: '19-Language Cloud Execution',
    desc: 'Write and run JavaScript, Python, Go, Rust, C++, Java and more — executed instantly in isolated cloud sandboxes.',
  },
  {
    icon: <Users size={18} />,
    title: 'Role-based Access Control',
    desc: 'Room admins control who can type. Viewers follow along live, request write access, or be promoted by the admin.',
  },
  {
    icon: <Globe size={18} />,
    title: 'Live Web Preview',
    desc: 'Build HTML/CSS/JS projects with a multi-file explorer and a live iframe preview that updates as you type.',
  },
];

const TECH_STACK = [
  { name: 'React 19',       role: 'Frontend framework',        dot: '#61DAFB' },
  { name: 'Yjs',            role: 'CRDT sync engine',          dot: '#8B5CF6' },
  { name: 'Monaco Editor',  role: 'Code editing surface',      dot: '#3B82F6' },
  { name: 'Socket.io',      role: 'Real-time WebSocket layer', dot: '#10B981' },
  { name: 'Node.js',        role: 'Backend runtime',           dot: '#68A063' },
  { name: 'Express',        role: 'HTTP API server',           dot: '#E2E2E2' },
  { name: 'Three.js',       role: '3D background rendering',   dot: '#06B6D4' },
  { name: 'Vite',           role: 'Build tooling',             dot: '#646CFF' },
  { name: 'Framer Motion',  role: 'Animation library',         dot: '#EC4899' },
  { name: 'JDoodle API',    role: 'Cloud code execution',      dot: '#EAB308' },
  { name: 'Vercel',         role: 'Frontend hosting',          dot: '#E2E2E2' },
  { name: 'Lucide React',   role: 'Icon system',               dot: '#F97316' },
];

const STEPS = [
  { num: '01', title: 'Create a room', desc: 'A unique room ID is generated. You become admin with full edit access and optional password protection.' },
  { num: '02', title: 'Share the ID', desc: 'Share the room ID with teammates. They connect via WebSocket and immediately receive the full Yjs document state.' },
  { num: '03', title: 'Edit together', desc: 'Every keystroke is encoded as a Yjs CRDT update and broadcast to all peers in real-time via Socket.io.' },
  { num: '04', title: 'Run in the cloud', desc: 'Click Run — the server forwards your code to JDoodle, executes it in an isolated sandbox, and streams output back.' },
];

// ── CollabDemo (preserved) ────────────────────────────────────────────────────
function CollabDemo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, duration: 0.7 }}
      className="lp-demo-wrap"
    >
      {/* Window chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#161619',
      }}>
        {['#FF5F57','#FEBC2E','#28C840'].map(c => (
          <span key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
        ))}
        <span style={{ marginLeft: 7, fontSize: '0.67rem', color: 'rgba(255,255,255,0.22)', fontFamily: '"JetBrains Mono", monospace' }}>
          main.py — CollabCode
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {COLLABORATORS.map(c => (
            <div key={c.name} style={{
              width: 20, height: 20, borderRadius: '50%',
              background: c.color, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700,
              color: '#fff', border: '1.5px solid #161619', fontFamily: 'Inter, sans-serif',
            }}>
              {c.name[0]}
            </div>
          ))}
        </div>
      </div>

      {/* Code body */}
      <div style={{
        padding: '10px 14px', position: 'relative',
        fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
        background: '#0D0D0F', minHeight: 158,
      }}>
        {CODE_LINES.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1 + i * 0.11, duration: 0.35 }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}
          >
            <span style={{ color: 'rgba(255,255,255,0.14)', fontSize: 10, width: 14, textAlign: 'right', flexShrink: 0 }}>
              {i + 1}
            </span>
            <span style={{ color: line.color, fontSize: 11.5 }}>{line.text}</span>
          </motion.div>
        ))}

        {/* Animated cursors */}
        {COLLABORATORS.map(c => (
          <motion.div
            key={c.name}
            animate={{ opacity: [0.7, 1, 0.7], y: [0, -2, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: c.delay, ease: 'easeInOut' }}
            style={{ position: 'absolute', left: c.pos.x, top: c.pos.y, pointerEvents: 'none' }}
          >
            <div style={{
              background: c.color, color: '#fff',
              fontSize: 8, fontWeight: 700, padding: '1px 5px',
              borderRadius: '3px 3px 3px 0', fontFamily: 'Inter, sans-serif',
              whiteSpace: 'nowrap', marginBottom: 2,
            }}>
              {c.name}
            </div>
            <div style={{ width: 2, height: 14, background: c.color, borderRadius: 1 }} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav className="lp-nav">
      <a href="/" className="lp-nav-logo">
        <Code2 size={15} color="#3B82F6" />
        CollabCode
      </a>
      <div className="lp-nav-links">
        <a href="#features" className="lp-nav-link">Features</a>
        <a href="#architecture" className="lp-nav-link">Architecture</a>
        <a href="#tech" className="lp-nav-link">Stack</a>
      </div>
      <div className="lp-nav-actions">
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost"
        >
          <GitBranch size={12} />
          GitHub
          <ArrowUpRight size={11} />
        </a>
      </div>
    </nav>
  );
}

// ── Section reveal animation ──────────────────────────────────────────────────
const fadeUp = {
  hidden:  { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.48 } },
};

// ── Main LandingPage ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();

  // ── State (100% unchanged from original) ────────────────────────────────────
  const [tab,            setTab]            = useState('create');
  const [createRoomId,   setCreateRoomId]   = useState(() => generateRoomId());
  const [createPassword, setCreatePassword] = useState('');
  const [showCreatePass, setShowCreatePass] = useState(false);
  const [joinRoomId,     setJoinRoomId]     = useState('');
  const [joinPassword,   setJoinPassword]   = useState('');
  const [showJoinPass,   setShowJoinPass]   = useState(false);
  const [joinError,      setJoinError]      = useState('');
  const [copiedId,       setCopiedId]       = useState(false);

  // ── Handlers (100% unchanged from original) ──────────────────────────────────
  const handleCreate = () => {
    const rid = createRoomId.trim().toUpperCase();
    if (!rid) return;
    if (createPassword.trim()) {
      localStorage.setItem(`room_pass_${rid}`, createPassword.trim());
    } else {
      localStorage.removeItem(`room_pass_${rid}`);
    }
    sessionStorage.setItem(`can_edit_${rid}`, 'true');
    navigate(`/editor?room=${rid}`);
  };

  const handleJoin = () => {
    const rid = joinRoomId.trim().toUpperCase();
    if (!rid) { setJoinError('Please enter a Room ID.'); return; }
    setJoinError('');
    const storedPass = localStorage.getItem(`room_pass_${rid}`);
    if (!storedPass) {
      sessionStorage.setItem(`can_edit_${rid}`, 'true');
      navigate(`/editor?room=${rid}`);
    } else if (joinPassword.trim() === storedPass) {
      sessionStorage.setItem(`can_edit_${rid}`, 'true');
      navigate(`/editor?room=${rid}`);
    } else {
      sessionStorage.removeItem(`can_edit_${rid}`);
      navigate(`/editor?room=${rid}&readonly=1`);
    }
  };

  const copyRoomId = async () => {
    await navigator.clipboard.writeText(createRoomId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="landing-root">
      <Navbar />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        {/* Left: headline + demo */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="lp-status-badge"
          >
            <span className="lp-status-dot" />
            Live — no account required
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.55 }}
            className="lp-headline"
          >
            Collaborative code editing,{' '}
            <span className="lp-headline-accent">in the browser.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.5 }}
            className="lp-subtitle"
          >
            Real-time collaborative IDE with Yjs CRDT synchronization, cloud
            code execution across 19 languages, live web preview, and
            role-based access control.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.45 }}
            className="lp-chips"
          >
            {[
              { icon: <Zap size={11} />,      label: 'Yjs CRDT sync'     },
              { icon: <Terminal size={11} />,  label: '19 languages'      },
              { icon: <Shield size={11} />,    label: 'Role-based access' },
              { icon: <Globe size={11} />,     label: 'Live web preview'  },
            ].map(c => (
              <div key={c.label} className="lp-chip">
                <span className="lp-chip-icon">{c.icon}</span>
                {c.label}
              </div>
            ))}
          </motion.div>

          <CollabDemo />
        </div>

        {/* Right: room panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.55 }}
          className="lp-room-panel"
        >
          <div className="lp-room-panel-header">
            <div className="lp-room-logo-icon">
              <Code2 size={16} color="#3B82F6" />
            </div>
            <div>
              <div className="lp-room-logo-text">CollabCode</div>
              <div className="lp-room-logo-sub">Start a session in seconds</div>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="lp-tabs">
            {[
              { key: 'create', label: 'Create Room', icon: <Plus size={11} /> },
              { key: 'join',   label: 'Join Room',   icon: <LogIn size={11} /> },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setJoinError(''); }}
                className={`lp-tab-btn${tab === t.key ? ' active' : ''}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── CREATE TAB ── */}
            {tab === 'create' && (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.16 }}
              >
                <div className="lp-form-group">
                  <label className="lp-label">Room ID</label>
                  <div className="lp-input-row">
                    <div className="lp-input-with-icon">
                      <input
                        className="lp-input lp-input-mono"
                        value={createRoomId}
                        onChange={e => setCreateRoomId(e.target.value.toUpperCase())}
                        placeholder="e.g. ABC1234"
                        style={{ paddingRight: 34 }}
                      />
                      <button
                        onClick={copyRoomId}
                        title="Copy room ID"
                        className="lp-input-suffix"
                        style={{ color: copiedId ? '#22C55E' : undefined }}
                      >
                        {copiedId ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <button
                      onClick={() => setCreateRoomId(generateRoomId())}
                      title="Generate new ID"
                      className="lp-random-btn"
                    >
                      <RefreshCw size={10} /> New
                    </button>
                  </div>
                </div>

                <div className="lp-form-group" style={{ marginBottom: 20 }}>
                  <label className="lp-label">
                    <Lock size={8} style={{ display: 'inline', marginRight: 4 }} />
                    Password
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>
                      (optional)
                    </span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="lp-input"
                      type={showCreatePass ? 'text' : 'password'}
                      value={createPassword}
                      onChange={e => setCreatePassword(e.target.value)}
                      placeholder="Leave blank for open room"
                      style={{ paddingRight: 36 }}
                    />
                    <button
                      onClick={() => setShowCreatePass(v => !v)}
                      className="lp-input-suffix"
                    >
                      {showCreatePass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {!createPassword && (
                    <p className="lp-help-text">Without a password, anyone can edit this room.</p>
                  )}
                </div>

                <motion.button
                  className="lp-cta-btn"
                  whileHover={{ opacity: 0.9 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleCreate}
                >
                  Create Room <ArrowRight size={14} />
                </motion.button>
              </motion.div>
            )}

            {/* ── JOIN TAB ── */}
            {tab === 'join' && (
              <motion.div
                key="join"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.16 }}
              >
                <div className="lp-form-group">
                  <label className="lp-label">Room ID</label>
                  <input
                    className="lp-input lp-input-mono"
                    value={joinRoomId}
                    onChange={e => { setJoinRoomId(e.target.value.toUpperCase()); setJoinError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    placeholder="Enter Room ID"
                  />
                </div>

                <div className="lp-form-group" style={{ marginBottom: 8 }}>
                  <label className="lp-label">
                    <Lock size={8} style={{ display: 'inline', marginRight: 4 }} />
                    Password
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>
                      (optional)
                    </span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="lp-input"
                      type={showJoinPass ? 'text' : 'password'}
                      value={joinPassword}
                      onChange={e => { setJoinPassword(e.target.value); setJoinError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleJoin()}
                      placeholder="Enter password for edit access"
                      style={{ paddingRight: 36 }}
                    />
                    <button
                      onClick={() => setShowJoinPass(v => !v)}
                      className="lp-input-suffix"
                    >
                      {showJoinPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>

                <p className="lp-help-text" style={{ marginBottom: 14 }}>
                  Without the correct password, you join in read-only view mode.
                </p>

                <AnimatePresence>
                  {joinError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="lp-error"
                    >
                      <AlertCircle size={12} /> {joinError}
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  className="lp-cta-btn"
                  whileHover={{ opacity: 0.9 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleJoin}
                >
                  Join Room <ArrowRight size={14} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="lp-panel-footer">
            Free to use · No account required · Open source
          </div>
        </motion.div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <hr className="lp-section-rule" />
      <motion.section
        id="features"
        className="lp-section"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
      >
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Capabilities</div>
          <h2 className="lp-section-title">Everything you need to collaborate</h2>
          <p className="lp-section-subtitle">
            Built on proven open-source technology. Fast, reliable, and entirely in the browser.
          </p>
        </div>
        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="lp-feature-card"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <div className="lp-feature-icon-wrap">{f.icon}</div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── ARCHITECTURE ──────────────────────────────────────────────────── */}
      <hr className="lp-section-rule" />
      <motion.section
        id="architecture"
        className="lp-section"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
      >
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">How it works</div>
          <h2 className="lp-section-title">Architecture overview</h2>
          <p className="lp-section-subtitle">
            A lightweight WebSocket-based system with CRDT synchronization and cloud execution.
          </p>
        </div>

        {/* Flow diagram */}
        <div className="lp-arch-flow">
          <motion.div
            className="lp-arch-node"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
          >
            <div className="lp-arch-node-icon" style={{ color: '#3B82F6' }}>
              <Code2 size={20} />
            </div>
            <div className="lp-arch-node-label">Browser Clients</div>
            <div className="lp-arch-node-sub">React · Monaco<br/>Yjs CRDT</div>
          </motion.div>

          <div className="lp-arch-connector">
            <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.7rem' }}>⟷</div>
            <div className="lp-arch-connector-line" />
            <div className="lp-arch-connector-label">Socket.io</div>
          </div>

          <motion.div
            className="lp-arch-node"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.12 }}
          >
            <div className="lp-arch-node-icon" style={{ color: '#10B981' }}>
              <Cpu size={20} />
            </div>
            <div className="lp-arch-node-label">Node.js Server</div>
            <div className="lp-arch-node-sub">Express · Socket.io<br/>Room + Yjs relay</div>
          </motion.div>

          <div className="lp-arch-connector">
            <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.7rem' }}>→</div>
            <div className="lp-arch-connector-line" />
            <div className="lp-arch-connector-label">HTTPS API</div>
          </div>

          <motion.div
            className="lp-arch-node"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="lp-arch-node-icon" style={{ color: '#F59E0B' }}>
              <Play size={20} />
            </div>
            <div className="lp-arch-node-label">JDoodle API</div>
            <div className="lp-arch-node-sub">Isolated sandboxes<br/>19 languages</div>
          </motion.div>
        </div>

        {/* Steps */}
        <div className="lp-steps-grid">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.num}
              className="lp-step-card"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
            >
              <div className="lp-step-num">{s.num}</div>
              <div className="lp-step-title">{s.title}</div>
              <div className="lp-step-desc">{s.desc}</div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── TECH STACK ────────────────────────────────────────────────────── */}
      <hr className="lp-section-rule" />
      <motion.section
        id="tech"
        className="lp-section"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
      >
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Technology</div>
          <h2 className="lp-section-title">Built with modern open-source tools</h2>
        </div>
        <div className="lp-tech-grid">
          {TECH_STACK.map((t, i) => (
            <motion.div
              key={t.name}
              className="lp-tech-card"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.035, duration: 0.35 }}
            >
              <div className="lp-tech-dot" style={{ background: t.dot }} />
              <div>
                <div className="lp-tech-name">{t.name}</div>
                <div className="lp-tech-role">{t.role}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="lp-footer-inner">
          <a href="/" className="lp-footer-logo">
            <Code2 size={13} color="#3B82F6" />
            CollabCode
          </a>
          <span className="lp-footer-copy">Open source collaborative IDE</span>
          <div className="lp-footer-links">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="lp-footer-link">GitHub</a>
            <a href="#features" className="lp-footer-link">Features</a>
            <a href="#architecture" className="lp-footer-link">Architecture</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
