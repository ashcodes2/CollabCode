import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Code2, ArrowLeft, Terminal, Compass } from 'lucide-react';
import '../index.css';

export default function NotFoundPage() {
  useEffect(() => {
    document.title = '404: Page Not Found — CollabCode';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        'The page, room session, or link you were looking for does not exist on CollabCode.'
      );
    }
  }, []);

  return (
    <div className="landing-root" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top Bar */}
      <header className="lp-nav">
        <Link to="/" className="lp-nav-logo">
          <Code2 size={16} color="#3B82F6" />
          <span>CollabCode</span>
        </Link>
        <div className="lp-nav-actions">
          <Link to="/" className="btn-ghost">
            <ArrowLeft size={12} />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main 404 Hero */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{
            maxWidth: 540,
            width: '100%',
            textAlign: 'center',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-xl)',
            padding: '48px 32px',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          {/* Status Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 'var(--r-md)',
              background: 'var(--error-dim)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--error)',
              fontSize: '0.72rem',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              marginBottom: 20,
            }}
          >
            <Compass size={12} />
            HTTP 404 • ROUTE_NOT_FOUND
          </div>

          {/* Large 404 Number */}
          <div
            style={{
              fontSize: 'clamp(4.5rem, 10vw, 6.5rem)',
              fontWeight: 800,
              letterSpacing: '-0.05em',
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              marginBottom: 12,
              userSelect: 'none',
            }}
          >
            404
          </div>

          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 10,
              letterSpacing: '-0.02em',
            }}
          >
            Session or Page Not Found
          </h1>

          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              maxWidth: 420,
              margin: '0 auto 28px',
            }}
          >
            The link you followed may be expired, the collaborative room was closed, or the requested URL does not exist.
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.84rem' }}>
              <ArrowLeft size={14} />
              Return to Home
            </Link>
            <Link to="/editor" className="btn-ghost" style={{ padding: '8px 18px', fontSize: '0.84rem' }}>
              <Terminal size={14} />
              Open Editor
            </Link>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-dim)', padding: '20px', textAlign: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          CollabCode — Real-Time Collaborative Cloud IDE
        </span>
      </footer>
    </div>
  );
}
