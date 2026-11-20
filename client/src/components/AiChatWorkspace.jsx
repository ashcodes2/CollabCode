import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import {
  Sparkles, Send, Trash2, RotateCcw, Copy, Check, X,
  Bot, User, Code2, AlertCircle, ArrowLeft, Terminal,
  ExternalLink, Lightbulb, FileCode, CheckCircle2,
  XCircle, Layers, FilePlus, FileEdit, Eye, AlertTriangle,
  ShieldCheck, HelpCircle, Play, Pause, Square, ListTodo,
  ChevronDown, ChevronUp, Clock, Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Error Boundary to prevent any card from blanking the screen ───────────────
class ChatCardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[ChatCardErrorBoundary] Caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 6, color: '#f87171', fontSize: 11, margin: '8px 0' }}>
          Unable to display component: {this.state.error?.message || 'Rendering error'}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Syntax Highlighted Code Block with Copy Action ────────────────────────────
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [code]);

  const highlightedHtml = useMemo(() => {
    if (!code) return '';
    const normLang = (language || '').toLowerCase().trim();
    const langAliases = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      sh: 'bash',
      shell: 'bash',
      zsh: 'bash',
      html: 'markup',
      xml: 'markup',
      svg: 'markup',
      css: 'css',
      json: 'json',
      md: 'markdown',
      sql: 'sql',
    };
    const target = langAliases[normLang] || normLang;
    const grammar = Prism.languages[target] || Prism.languages.javascript || Prism.languages.markup;
    try {
      return Prism.highlight(code, grammar, target);
    } catch {
      return code;
    }
  }, [code, language]);

  const displayLang = (language || 'code').toUpperCase();

  return (
    <div className="cc-ai-code-block">
      <div className="cc-ai-code-header">
        <span className="cc-ai-code-lang">{displayLang}</span>
        <button
          className="cc-ai-copy-btn"
          onClick={handleCopy}
          title="Copy code to clipboard"
          type="button"
        >
          {copied ? (
            <>
              <Check size={12} color="#10b981" />
              <span style={{ color: '#10b981' }}>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>
      <pre className="cc-ai-code-body">
        <code
          className={`language-${language || 'text'}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}

// ── Markdown Formatter Component (react-markdown + remark-gfm) ───────────────
function FormattedMessage({ content }) {
  if (!content) return null;

  return (
    <div className="cc-ai-markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            // Fenced code blocks are handled here
            if (React.isValidElement(children)) {
              const codeString = String(children.props?.children || '').replace(/\n$/, '');
              const className = children.props?.className || '';
              const match = /language-(\w+)/.exec(className);
              const language = match ? match[1] : '';
              return <CodeBlock language={language} code={codeString} />;
            }
            return <pre className="cc-ai-pre">{children}</pre>;
          },
          code({ node, className, children, ...props }) {
            // Inline code rendering
            return (
              <code className="cc-ai-inline-code" {...props}>
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="cc-ai-table-wrap">
                <table className="cc-ai-table">{children}</table>
              </div>
            );
          },
          th({ children, style }) {
            return <th className="cc-ai-th" style={style}>{children}</th>;
          },
          td({ children, style }) {
            return <td className="cc-ai-td" style={style}>{children}</td>;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="cc-ai-link">
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return <blockquote className="cc-ai-blockquote">{children}</blockquote>;
          },
          h1({ children }) {
            return <h1 className="cc-ai-h1">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="cc-ai-h2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="cc-ai-h3">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="cc-ai-h4">{children}</h4>;
          },
          p({ children }) {
            return <p className="cc-ai-p">{children}</p>;
          },
          ul({ children }) {
            return <ul className="cc-ai-ul">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="cc-ai-ol">{children}</ol>;
          },
          li({ children }) {
            return <li className="cc-ai-li">{children}</li>;
          },
          hr() {
            return <hr className="cc-ai-hr" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Diff Preview Component (Phase 2: Code Generation & Editing) ──────────────
function DiffPreview({ proposal, onApprove, onReject }) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [viewMode, setViewMode] = useState('diff'); // 'diff' | 'full'
  const [status, setStatus] = useState(proposal?.status || 'pending');
  const [error, setError] = useState(null);

  // Sync status if parent proposal changes
  useEffect(() => {
    if (proposal?.status && proposal.status !== status) {
      setStatus(proposal.status);
    }
  }, [proposal?.status]);

  const changes = proposal?.changes || [];
  const currentFile = changes[activeFileIndex] || changes[0];

  const totalAdditions = useMemo(() => {
    return changes.reduce((acc, c) => acc + (c.stats?.additions || 0), 0);
  }, [changes]);

  const totalDeletions = useMemo(() => {
    return changes.reduce((acc, c) => acc + (c.stats?.deletions || 0), 0);
  }, [changes]);

  const handleApprove = async () => {
    if (status !== 'pending' || !onApprove) return;
    setStatus('approving');
    setError(null);
    try {
      await onApprove(proposal);
      setStatus('applied');
    } catch (err) {
      setStatus('pending');
      setError(err.message || 'Failed to apply proposal.');
    }
  };

  const handleReject = async () => {
    if (status !== 'pending' || !onReject) return;
    setStatus('rejecting');
    setError(null);
    try {
      await onReject(proposal);
      setStatus('rejected');
    } catch (err) {
      setStatus('pending');
      setError(err.message || 'Failed to reject proposal.');
    }
  };

  if (!proposal || changes.length === 0) return null;

  return (
    <div className="cc-diff-preview-box">
      {/* Header */}
      <div className="cc-diff-header">
        <div className="cc-diff-header-title">
          <FileCode size={16} color="#818cf8" />
          <span>Proposed Changes ({changes.length} {changes.length === 1 ? 'file' : 'files'})</span>
        </div>
        <div className="cc-diff-header-meta">
          <span className="cc-diff-stat-add">+{totalAdditions}</span>
          <span className="cc-diff-stat-del">-{totalDeletions}</span>
          <span className={`cc-diff-status-pill ${status}`}>
            {status === 'pending' ? 'Review Required' : status === 'applied' ? 'Approved & Applied' : status === 'rejected' ? 'Rejected' : status}
          </span>
        </div>
      </div>

      {/* File selector tabs if multiple files */}
      {changes.length > 1 && (
        <div className="cc-diff-file-tabs">
          {changes.map((c, idx) => (
            <button
              key={c.path}
              type="button"
              className={`cc-diff-file-tab ${idx === activeFileIndex ? 'active' : ''}`}
              onClick={() => setActiveFileIndex(idx)}
            >
              <span className={`cc-diff-action-tag ${c.action}`}>
                {c.action === 'create' ? '+ CREATE' : '✎ EDIT'}
              </span>
              <span>{c.path}</span>
            </button>
          ))}
        </div>
      )}

      {/* Explanation banner if present */}
      {currentFile?.explanation && (
        <div className="cc-diff-explanation">
          💡 {currentFile.explanation}
        </div>
      )}

      {/* View Toggle */}
      <div className="cc-diff-view-toggle">
        {changes.length === 1 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
            <span className={`cc-diff-action-tag ${currentFile?.action}`}>
              {currentFile?.action === 'create' ? '+ CREATE' : '✎ MODIFY'}
            </span>
            <span>{currentFile?.path}</span>
          </div>
        )}
        <button
          type="button"
          className={`cc-diff-mode-btn ${viewMode === 'diff' ? 'active' : ''}`}
          onClick={() => setViewMode('diff')}
        >
          Line Diff
        </button>
        <button
          type="button"
          className={`cc-diff-mode-btn ${viewMode === 'full' ? 'active' : ''}`}
          onClick={() => setViewMode('full')}
        >
          Full Code
        </button>
      </div>

      {/* Diff / Code Body */}
      <div className="cc-diff-content-scroll">
        {viewMode === 'diff' ? (
          <div>
            {(currentFile?.diff || []).map((line, lIdx) => {
              const lineType = line.type; // 'added' | 'deleted' | 'unchanged'
              const lineNum = lineType === 'deleted' ? line.originalLine : line.proposedLine;
              const sign = lineType === 'added' ? '+' : lineType === 'deleted' ? '-' : ' ';
              return (
                <div key={lIdx} className={`cc-diff-line ${lineType}`}>
                  <span className="cc-diff-line-num">{lineNum || ''}</span>
                  <span className="cc-diff-sign">{sign}</span>
                  <span className="cc-diff-text">{line.text}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <pre style={{ margin: 0, padding: '10px 14px', color: '#e2e8f0', fontSize: 12, overflowX: 'auto' }}>
            <code>{currentFile?.proposedContent}</code>
          </pre>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{ padding: '8px 14px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: 12, borderTop: '1px solid rgba(239, 68, 68, 0.3)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Actions */}
      <div className="cc-diff-actions">
        {status === 'pending' || status === 'approving' || status === 'rejecting' ? (
          <>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Changes will not modify files until you approve.
            </div>
            <div className="cc-diff-actions-buttons">
              <button
                type="button"
                className="cc-diff-reject-btn"
                onClick={handleReject}
                disabled={status !== 'pending'}
              >
                <X size={13} />
                <span>{status === 'rejecting' ? 'Rejecting...' : 'Reject Changes'}</span>
              </button>
              <button
                type="button"
                className="cc-diff-approve-btn"
                onClick={handleApprove}
                disabled={status !== 'pending'}
              >
                <Check size={13} />
                <span>{status === 'approving' ? 'Applying...' : 'Approve & Apply'}</span>
              </button>
            </div>
          </>
        ) : status === 'applied' ? (
          <div className="cc-diff-resolved-msg applied">
            <CheckCircle2 size={15} />
            <span>Changes approved and applied to your project.</span>
          </div>
        ) : (
          <div className="cc-diff-resolved-msg rejected">
            <XCircle size={15} />
            <span>Changes rejected. All files left untouched.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Test Results Card (Phase 4 & 5: Testing Agent with Runtime Browser Testing) ─
function TestResultsCard({ testResults, onFixTest, onRunRuntimeTests, onUpdateTestResults }) {
  const [filter, setFilter] = useState('all');
  const [isRunningRuntime, setIsRunningRuntime] = useState(false);
  const [runtimeExecutionError, setRuntimeExecutionError] = useState(null);

  if (!testResults || !Array.isArray(testResults.results)) return null;

  const results = testResults.results;
  const filtered = results.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const { passed, failed, notTested, total } = testResults.summary || {
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    notTested: results.filter(r => r.status === 'not_tested').length,
    total: results.length,
  };

  const handleExecuteInPreview = async () => {
    if (!onRunRuntimeTests) return;
    setIsRunningRuntime(true);
    setRuntimeExecutionError(null);
    try {
      const response = await onRunRuntimeTests(results);
      if (response && Array.isArray(response.results)) {
        if (onUpdateTestResults) {
          onUpdateTestResults(response.results, response.consoleLogs);
        }
      }
    } catch (err) {
      setRuntimeExecutionError(err.message || 'Failed to execute tests in browser preview.');
    } finally {
      setIsRunningRuntime(false);
    }
  };

  return (
    <div className="cc-test-results-box" style={{ marginTop: 12, background: '#1c1f26', border: '1px solid #2d333b', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: '#f1f3f7' }}>
          <ShieldCheck size={16} color="#818cf8" />
          <span>Project Test Results ({total})</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {failed > 0 && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontWeight: 600 }}>
              {failed} Failed
            </span>
          )}
          {passed > 0 && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 600 }}>
              {passed} Passed
            </span>
          )}
          {notTested > 0 && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 600 }}>
              {notTested} Not Tested
            </span>
          )}
        </div>
      </div>

      {/* Run Runtime Tests Button */}
      {onRunRuntimeTests && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            disabled={isRunningRuntime}
            onClick={handleExecuteInPreview}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: isRunningRuntime ? 'not-allowed' : 'pointer',
              opacity: isRunningRuntime ? 0.7 : 1,
            }}
          >
            {isRunningRuntime ? (
              <>
                <RotateCcw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Executing Interactive Tests in Live Preview...</span>
              </>
            ) : (
              <>
                <Play size={13} fill="currentColor" />
                <span>{notTested > 0 ? `Run Interactive Tests in Live Preview (${notTested} unverified)` : 'Re-run All Tests in Live Preview'}</span>
              </>
            )}
          </button>
          {runtimeExecutionError && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 4, background: 'rgba(239,68,68,0.1)', padding: '4px 8px', borderRadius: 4 }}>
              {runtimeExecutionError}
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['all', 'failed', 'not_tested', 'passed'].map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            type="button"
            style={{
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 4,
              border: 'none',
              background: filter === tab ? '#374151' : '#222631',
              color: filter === tab ? '#ffffff' : '#9ca3af',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Test List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(test => {
          const isPass = test.status === 'passed';
          const isFail = test.status === 'failed';
          const statusColor = isPass ? '#34d399' : isFail ? '#f87171' : '#fbbf24';
          const statusBg = isPass ? 'rgba(16, 185, 129, 0.1)' : isFail ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';

          return (
            <div
              key={test.id}
              style={{
                background: '#15171c',
                border: `1px solid ${isFail ? 'rgba(239, 68, 68, 0.3)' : '#2d333b'}`,
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isPass && <CheckCircle2 size={14} color="#34d399" />}
                  {isFail && <XCircle size={14} color="#f87171" />}
                  {!isPass && !isFail && <HelpCircle size={14} color="#fbbf24" />}
                  <span style={{ fontWeight: 600, color: '#f1f3f7' }}>{test.id}: {test.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#222631', color: '#9ca3af' }}>
                    {test.type}
                  </span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: statusBg, color: statusColor, fontWeight: 600 }}>
                    {test.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>
                <strong style={{ color: '#d1d5db' }}>Expected:</strong> {test.expected}
              </div>
              {test.actual && (
                <div style={{ fontSize: 11, color: isFail ? '#fca5a5' : '#9ca3af', marginBottom: 2 }}>
                  <strong style={{ color: '#d1d5db' }}>Actual:</strong> {test.actual}
                </div>
              )}
              {test.errorDetails && (
                <div style={{ fontSize: 11, color: '#f87171', background: 'rgba(239, 68, 68, 0.15)', padding: '4px 6px', borderRadius: 4, marginTop: 4 }}>
                  {test.errorDetails}
                </div>
              )}
              {test.runtimeErrors && test.runtimeErrors.length > 0 && (
                <div style={{ fontSize: 11, color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)', padding: '4px 6px', borderRadius: 4, marginTop: 4 }}>
                  <strong>Runtime Error:</strong> {test.runtimeErrors.join('; ')}
                </div>
              )}
              {isFail && onFixTest && (
                <button
                  type="button"
                  onClick={() => onFixTest(test)}
                  style={{
                    marginTop: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid rgba(129, 140, 248, 0.4)',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a5b4fc',
                    cursor: 'pointer',
                  }}
                >
                  <Sparkles size={11} />
                  <span>Propose Fix with AI</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Test Plan Card (Phase 4: Testing Agent) ─────────────────────────────────
function TestPlanCard({ testPlan }) {
  if (!testPlan || !Array.isArray(testPlan.testCases)) return null;

  return (
    <div className="cc-test-plan-box" style={{ marginTop: 12, background: '#1c1f26', border: '1px solid #2d333b', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: '#f1f3f7' }}>
          <ShieldCheck size={16} color="#818cf8" />
          <span>Testing Checklist & Plan ({testPlan.summary?.total || testPlan.testCases.length} cases)</span>
        </div>
      </div>

      {testPlan.featuresDetected && testPlan.featuresDetected.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {testPlan.featuresDetected.map((feat, idx) => (
            <span key={idx} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#222631', color: '#c7d2fe', border: '1px solid #374151' }}>
              {feat}
            </span>
          ))}
        </div>
      )}

      {testPlan.missingScenarios && testPlan.missingScenarios.length > 0 && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f87171', fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
            <AlertTriangle size={13} />
            <span>Missing Validation & Test Gaps Detected</span>
          </div>
          {testPlan.missingScenarios.map((ms, idx) => (
            <div key={idx} style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>
              • <strong>{ms.feature}:</strong> {ms.issue} — <em>{ms.recommendation}</em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Multi-Step Task Plan & Execution Card (Phase 6) ───────────────────────────
function TaskPlanCard({
  taskPlan,
  onPlanDecision,
  onPlanControl,
  onExecuteStep,
  onRecoverStep,
}) {
  const [expandedStepId, setExpandedStepId] = useState(null);
  const [isModifying, setIsModifying] = useState(false);
  const [modifyNotes, setModifyNotes] = useState('');

  if (!taskPlan || !Array.isArray(taskPlan.steps)) return null;

  const {
    planId,
    title,
    goal,
    status,
    steps,
    stats,
    allTargetFiles = [],
    userApproval,
  } = taskPlan;

  const safeStatus = typeof status === 'string' ? status : 'in_progress';
  const isAwaitingApproval = safeStatus === 'awaiting_user_approval';
  const isInProgress = safeStatus === 'in_progress';
  const isPaused = safeStatus === 'paused';
  const isCompleted = safeStatus === 'completed' || (stats && stats.completedSteps === stats.totalSteps && stats.totalSteps > 0);
  const isBlocked = safeStatus === 'blocked';
  const isCancelled = safeStatus === 'cancelled';
  const isRejected = safeStatus === 'rejected';

  const statusColors = {
    awaiting_user_approval: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: '#f59e0b' },
    approved: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: '#3b82f6' },
    in_progress: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: '#6366f1' },
    paused: { bg: 'rgba(234, 179, 8, 0.15)', text: '#facc15', border: '#eab308' },
    completed: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#10b981' },
    blocked: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '#ef4444' },
    cancelled: { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af', border: '#6b7280' },
    rejected: { bg: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5', border: '#dc2626' },
  };

  const currentTheme = statusColors[safeStatus] || statusColors.in_progress;
  const progressPercent = stats?.progressPercent || 0;

  const toggleExpand = (stepId) => {
    setExpandedStepId(prev => (prev === stepId ? null : stepId));
  };

  const handleModifySubmit = (e) => {
    e.preventDefault();
    if (onPlanDecision && modifyNotes.trim()) {
      onPlanDecision(taskPlan, 'modify', { feedback: modifyNotes.trim() });
      setIsModifying(false);
      setModifyNotes('');
    }
  };

  // Find the next step that can be executed
  const nextExecutableStep = steps.find(s => s.status === 'pending');

  return (
    <div
      className="cc-task-plan-box"
      style={{
        marginTop: 12,
        background: '#181b22',
        border: `1px solid ${currentTheme.border}40`,
        borderRadius: 8,
        padding: 14,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* ── Top Header & Status ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListTodo size={16} color="#818cf8" />
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              {typeof title === 'string' ? title : 'Task Execution Plan'}
            </h4>
          </div>
          {goal && (
            <p style={{ margin: '4px 0 0 24px', fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>
              {typeof goal === 'string' ? goal : JSON.stringify(goal)}
            </p>
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 9px',
            borderRadius: 12,
            background: currentTheme.bg,
            color: currentTheme.text,
            border: `1px solid ${currentTheme.border}60`,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {safeStatus.replace(/_/g, ' ')}
        </span>
      </div>

      {/* ── Progress Bar ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          <span>Execution Progress</span>
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
            {stats?.completedSteps || 0} of {stats?.totalSteps || steps.length} steps completed ({progressPercent}%)
          </span>
        </div>
        <div style={{ height: 6, background: '#262a35', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: isCompleted ? '#10b981' : isBlocked ? '#ef4444' : 'linear-gradient(90deg, #6366f1, #818cf8)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* ── Plan Approval Gateway ───────────────────────────────────────────── */}
      {isAwaitingApproval && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 6,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            <AlertCircle size={14} />
            <span>User Review Required Before Execution</span>
          </div>
          <div style={{ fontSize: 11, color: '#d1d5db', marginBottom: 8, lineHeight: 1.4 }}>
            Review the {steps.length} planned steps below. No files will be modified until you explicitly approve this execution plan.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onPlanDecision && onPlanDecision(taskPlan, 'approve')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: 5,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Check size={13} />
              <span>Approve Plan & Begin</span>
            </button>
            <button
              type="button"
              onClick={() => onPlanDecision && onPlanDecision(taskPlan, 'reject')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: 5,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <X size={13} />
              <span>Reject Plan</span>
            </button>
            <button
              type="button"
              onClick={() => setIsModifying(!isModifying)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#2d333b',
                color: '#c7d2fe',
                border: '1px solid #3b4252',
                borderRadius: 5,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Sliders size={13} />
              <span>{isModifying ? 'Cancel Modification' : 'Modify Plan'}</span>
            </button>
          </div>

          {isModifying && (
            <form onSubmit={handleModifySubmit} style={{ marginTop: 10 }}>
              <textarea
                value={modifyNotes}
                onChange={e => setModifyNotes(e.target.value)}
                placeholder="Describe how to adjust the plan (e.g. 'Combine steps 1 and 2, add step for dark mode')..."
                style={{
                  width: '100%',
                  background: '#15171c',
                  border: '1px solid #374151',
                  borderRadius: 5,
                  padding: 8,
                  color: '#e2e8f0',
                  fontSize: 11,
                  minHeight: 50,
                  resize: 'vertical',
                }}
              />
              <button
                type="submit"
                style={{
                  marginTop: 6,
                  background: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Submit Plan Modifications
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Active Execution Controls (Pause / Resume / Cancel) ─────────────── */}
      {(isInProgress || isPaused) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#20242e', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
            <Clock size={13} color="#818cf8" />
            <span>Execution Status: <strong style={{ color: currentTheme.text }}>{status.toUpperCase()}</strong></span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isInProgress ? (
              <button
                type="button"
                onClick={() => onPlanControl && onPlanControl(taskPlan, 'pause')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(234, 179, 8, 0.15)',
                  color: '#facc15',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: 4,
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Pause size={12} />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPlanControl && onPlanControl(taskPlan, 'resume')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 4,
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Play size={12} />
                <span>Resume</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onPlanControl && onPlanControl(taskPlan, 'cancel')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Square size={12} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Steps Timeline ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, idx) => {
          const isDone = step.status === 'completed';
          const isStepRunning = step.status === 'in_progress';
          const isFailed = step.status === 'failed';
          const isStepBlocked = step.status === 'blocked';
          const isSkipped = step.status === 'skipped';
          const isExpanded = expandedStepId === step.id;

          const stepStatusColor = isDone
            ? '#34d399'
            : isStepRunning
            ? '#818cf8'
            : isFailed || isStepBlocked
            ? '#f87171'
            : isSkipped
            ? '#6b7280'
            : '#94a3b8';

          return (
            <div
              key={step.id}
              style={{
                background: '#15171c',
                border: `1px solid ${isStepRunning ? '#6366f1' : isFailed || isStepBlocked ? '#ef4444' : '#2d333b'}`,
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
                onClick={() => toggleExpand(step.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {isDone ? (
                    <CheckCircle2 size={14} color="#34d399" />
                  ) : isFailed || isStepBlocked ? (
                    <XCircle size={14} color="#f87171" />
                  ) : isStepRunning ? (
                    <RotateCcw size={14} color="#818cf8" style={{ animation: 'spin 1.5s linear infinite' }} />
                  ) : (
                    <Clock size={14} color="#94a3b8" />
                  )}
                  <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
                    {step.id}: {step.title}
                  </span>
                  {step.actionType && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: '#222631',
                        color: '#a5b4fc',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      {step.actionType}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: stepStatusColor,
                      textTransform: 'uppercase',
                    }}
                  >
                    {step.status}
                  </span>
                  {isExpanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                </div>
              </div>

              {/* Target files tags */}
              {step.targetFiles && step.targetFiles.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, marginLeft: 20 }}>
                  {step.targetFiles.map(file => (
                    <span
                      key={file}
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: '#1e232d',
                        color: '#94a3b8',
                        fontFamily: 'monospace',
                        border: '1px solid #2d333b',
                      }}
                    >
                      📄 {file}
                    </span>
                  ))}
                  {step.dependencies && step.dependencies.length > 0 && (
                    <span style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', alignSelf: 'center' }}>
                      (Depends on: {step.dependencies.join(', ')})
                    </span>
                  )}
                </div>
              )}

              {/* Expandable step details */}
              {isExpanded && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #262a35', fontSize: 11, color: '#94a3b8', marginLeft: 20 }}>
                  {step.description && (
                    <div style={{ marginBottom: 4 }}>
                      <strong style={{ color: '#cbd5e1' }}>Objective:</strong> {step.description}
                    </div>
                  )}
                  {step.verificationCriteria && (
                    <div style={{ marginBottom: 4 }}>
                      <strong style={{ color: '#cbd5e1' }}>Verification Criteria:</strong> {step.verificationCriteria}
                    </div>
                  )}
                  {step.outputSummary && (
                    <div style={{ marginBottom: 4, color: '#93c5fd' }}>
                      <strong style={{ color: '#cbd5e1' }}>Result:</strong> {step.outputSummary}
                    </div>
                  )}
                  {step.errorDetails && (
                    <div style={{ padding: '6px 8px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', borderRadius: 4, marginTop: 4 }}>
                      <strong>Failure:</strong> {step.errorDetails}
                      {step.recoveryAttempts > 0 && (
                        <div style={{ marginTop: 2, fontSize: 10, color: '#f87171' }}>
                          Recovery Attempts: {step.recoveryAttempts} / {step.maxRecoveryAttempts || 2}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step Action Buttons */}
              {(isFailed || isStepBlocked) && step.recoveryAttempts < 2 && onRecoverStep && (
                <div style={{ marginTop: 8, marginLeft: 20 }}>
                  <button
                    type="button"
                    onClick={() => onRecoverStep(step)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 4,
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#fca5a5',
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={11} />
                    <span>Diagnose & Recover Step (Attempt {step.recoveryAttempts + 1}/2)</span>
                  </button>
                </div>
              )}

              {/* Next step execution button if approved */}
              {!isAwaitingApproval && !isCancelled && !isRejected && step.status === 'pending' && (!nextExecutableStep || nextExecutableStep.id === step.id) && onExecuteStep && (
                <div style={{ marginTop: 8, marginLeft: 20 }}>
                  <button
                    type="button"
                    onClick={() => onExecuteStep(step)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      padding: '4px 9px',
                      borderRadius: 4,
                      border: '1px solid #4f46e5',
                      background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Play size={11} fill="currentColor" />
                    <span>Execute Step {step.id}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Final Execution Summary Banner ─────────────────────────────────── */}
      {isCompleted && (
        <div
          style={{
            marginTop: 12,
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 6,
            padding: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399', fontWeight: 700, fontSize: 12 }}>
            <CheckCircle2 size={15} />
            <span>Multi-Step Task Execution Completed Successfully!</span>
          </div>
          <div style={{ fontSize: 11, color: '#d1d5db', marginTop: 4, lineHeight: 1.4 }}>
            All {steps.length} steps have been executed and verified.
            {allTargetFiles.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>Modified Files:</strong> {allTargetFiles.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Dedicated CollabCode AI Chat Workspace Component ──────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export const DEFAULT_AI_MESSAGES = [
  {
    id: 'welcome-1',
    role: 'assistant',
    content: `Hello! I'm **CollabCode AI**, your programming assistant powered by **Groq**.\n\nI can help you:\n- Write and debug **HTML, CSS, and JavaScript**\n- Explain complex programming concepts\n- Generate responsive UI components\n- Optimize algorithms and review code\n\nWhat are you working on today?`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
];

export default function AiChatWorkspace({
  onSwitchToCode,
  activeFileName,
  roomId,
  fileTree,
  messages: parentMessages,
  setMessages: parentSetMessages,
  inputPrompt: parentInputPrompt,
  setInputPrompt: parentSetInputPrompt,
  isLoading: parentIsLoading,
  setIsLoading: parentSetIsLoading,
  errorMessage: parentErrorMessage,
  setErrorMessage: parentSetErrorMessage,
  isVisible = true,
  onApproveProposal,
  onRejectProposal,
  onRunRuntimeTests,
  runtimeConsoleLogs,
}) {
  const [internalMessages, setInternalMessages] = useState(DEFAULT_AI_MESSAGES);
  const messages = parentMessages !== undefined ? parentMessages : internalMessages;
  const setMessages = parentSetMessages || setInternalMessages;

  const handleUpdateTestResults = useCallback((messageId, newResults, consoleLogs) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        const passed = newResults.filter(r => r.status === 'passed').length;
        const failed = newResults.filter(r => r.status === 'failed').length;
        const notTested = newResults.filter(r => r.status === 'not_tested').length;

        return {
          ...m,
          testResults: {
            ...m.testResults,
            summary: { total: newResults.length, passed, failed, notTested },
            results: newResults,
            consoleLogs,
          },
        };
      }
      return m;
    }));
  }, [setMessages]);

  const [internalInputPrompt, setInternalInputPrompt] = useState('');
  const inputPrompt = parentInputPrompt !== undefined ? parentInputPrompt : internalInputPrompt;
  const setInputPrompt = parentSetInputPrompt || setInternalInputPrompt;

  // ── Phase 6: Persistent Task Plan State ─────────────────────────────────────
  const storageKey = useMemo(() => `collabcode_task_plan_${roomId || 'default'}`, [roomId]);
  const [activeTaskPlan, setActiveTaskPlan] = useState(() => {
    try {
      const saved = localStorage.getItem(`collabcode_task_plan_${roomId || 'default'}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  useEffect(() => {
    try {
      if (activeTaskPlan) {
        localStorage.setItem(storageKey, JSON.stringify(activeTaskPlan));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {}
  }, [activeTaskPlan, storageKey]);

  // Synchronize approval of proposals into the active task plan
  const handleApproveProposal = useCallback(async (prop) => {
    if (onApproveProposal) {
      await onApproveProposal(prop);
    }
    setActiveTaskPlan(prev => {
      if (!prev || !Array.isArray(prev.steps)) return prev;
      const updatedSteps = prev.steps.map(s => {
        const matchesProposal = (s.proposals && s.proposals.some(p => p.id === prop.id)) ||
          (s.targetFiles && prop.changes && prop.changes.some(c => s.targetFiles.includes(c.path)));
        if (matchesProposal) {
          return {
            ...s,
            status: 'completed',
            completedAt: new Date().toISOString(),
            outputSummary: 'Changes approved and applied to project.',
          };
        }
        return s;
      });
      const completed = updatedSteps.filter(s => s.status === 'completed').length;
      const total = updatedSteps.length;
      const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
      const nextPending = updatedSteps.findIndex(s => s.status !== 'completed' && s.status !== 'skipped');

      const updated = {
        ...prev,
        steps: updatedSteps,
        currentStepIndex: nextPending >= 0 ? nextPending : total - 1,
        stats: {
          ...prev.stats,
          completedSteps: completed,
          progressPercent,
        },
        status: completed === total ? 'completed' : prev.status,
        updatedAt: new Date().toISOString(),
      };

      setMessages(msgs => msgs.map(m => m.taskPlan?.planId === prev.planId ? { ...m, taskPlan: updated } : m));
      return updated;
    });
  }, [onApproveProposal, setMessages]);

  const [internalIsLoading, setInternalIsLoading] = useState(false);
  const isLoading = parentIsLoading !== undefined ? parentIsLoading : internalIsLoading;
  const setIsLoading = parentSetIsLoading || setInternalIsLoading;

  const [internalErrorMessage, setInternalErrorMessage] = useState(null);
  const errorMessage = parentErrorMessage !== undefined ? parentErrorMessage : internalErrorMessage;
  const setErrorMessage = parentSetErrorMessage || setInternalErrorMessage;

  const isSubmittingRef = useRef(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isVisible) {
      scrollToBottom();
    }
  }, [messages, isLoading, isVisible, scrollToBottom]);

  // Focus textarea when workspace becomes visible
  useEffect(() => {
    if (isVisible) {
      textareaRef.current?.focus();
    }
  }, [isVisible]);

  // Quick Starter Prompts
  const quickPrompts = [
    { title: 'Test My Project', prompt: 'Test my project: inspect my files, generate a testing checklist, identify edge cases and test for bugs.' },
    { title: 'Interactive Button JS', prompt: 'Show me how to create an interactive button in JavaScript that changes background color and increments a counter.' },
    { title: 'Center with Flexbox', prompt: 'How do I center a div horizontally and vertically using modern CSS Flexbox and Grid?' },
    { title: 'Responsive Navbar', prompt: 'Write an HTML and CSS responsive navigation bar with a mobile hamburger menu.' },
  ];

  // ── Send Message to Backend Groq Service ──────────────────────────────────
  const handleSendMessage = async (textToSend, isRetry = false) => {
    if (isSubmittingRef.current || isLoading) return;

    let historyToSend = messages;

    if (!isRetry) {
      const text = (textToSend ?? inputPrompt).trim();
      if (!text) return;

      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      historyToSend = [...messages, userMessage];
      setMessages(historyToSend);
      setInputPrompt('');
    } else {
      // On retry, ensure we have at least one user message
      const hasUserMsg = messages.some(m => m.role === 'user');
      if (!hasUserMsg) return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const rawBackend = import.meta.env.VITE_BACKEND_URL;
      const configuredBackend = typeof rawBackend === 'string' && rawBackend.trim() ? rawBackend.trim().replace(/\/+$/, '') : null;

      // Send sanitized history to backend
      const payloadMessages = historyToSend
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      // Build the request payload including roomId and fileTree for agent tools
      const requestPayload = { messages: payloadMessages };
      if (roomId) requestPayload.roomId = roomId;
      if (activeTaskPlan) requestPayload.taskPlan = activeTaskPlan;
      // Send a lightweight snapshot of the file tree for Vercel serverless (which has no in-memory fileTrees)
      if (fileTree && typeof fileTree === 'object' && Object.keys(fileTree).length > 0) {
        requestPayload.fileTree = fileTree;
      }

      // Candidate endpoints in priority order:
      // 1. Same-origin relative endpoint '/api/ai/chat' (Vercel Serverless Function in production, Vite dev proxy in dev)
      // 2. Configured external backend (e.g. Render server) if provided
      // 3. Localhost fallback (127.0.0.1:3001) ONLY in local dev environment (http:), NEVER on https: (mixed content)
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const candidates = ['/api/ai/chat'];
      if (!isHttps && configuredBackend && !candidates.includes(`${configuredBackend}/api/ai/chat`)) {
        candidates.push(`${configuredBackend}/api/ai/chat`);
      }
      if (!isHttps && !candidates.includes('http://127.0.0.1:3001/api/ai/chat')) {
        candidates.push('http://127.0.0.1:3001/api/ai/chat');
      }

      let res = null;
      let lastErrorMessage = null;

      for (const endpoint of candidates) {
        const controller = new AbortController();
        const timeoutTimer = setTimeout(() => controller.abort(), 90000);

        try {
          const attemptRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload),
            signal: controller.signal,
          });

          if (attemptRes.ok) {
            res = attemptRes;
            break;
          } else {
            const errorData = await attemptRes.json().catch(() => ({}));
            const status = attemptRes.status;
            let descriptiveError = errorData.error;

            if (!descriptiveError) {
              if (status === 401) descriptiveError = 'Authentication failure: Invalid Groq API key in server configuration.';
              else if (status === 404) descriptiveError = 'Model error: The specified Groq model was not found.';
              else if (status === 429) descriptiveError = 'Rate limit exceeded: Too many requests to Groq. Please wait a moment before trying again.';
              else if (status === 502 || status === 503) descriptiveError = 'Groq service error: AI service is currently unavailable.';
              else if (status === 504) descriptiveError = 'Network timeout: Request to Groq API timed out.';
              else descriptiveError = `Server returned HTTP ${status}: ${attemptRes.statusText}`;
            }

            lastErrorMessage = descriptiveError;
            console.warn(`[AI Chat] Endpoint ${endpoint} returned HTTP ${status}:`, descriptiveError);

            // Definitive responses (rate limits, auth errors, bad requests, server errors) should not fall through to other endpoints
            if (status === 429 || status === 401 || status === 400 || status === 404 || status >= 500) {
              break;
            }
          }
        } catch (fetchErr) {
          if (fetchErr.name === 'AbortError') {
            lastErrorMessage = 'Network timeout: The AI service took longer than expected to respond. Please try again.';
          } else {
            lastErrorMessage = fetchErr.message;
          }
          console.warn(`[AI Chat] Network error reaching ${endpoint}:`, fetchErr.message);
        } finally {
          clearTimeout(timeoutTimer);
        }
      }

      if (!res) {
        throw new Error(lastErrorMessage || 'Could not connect to any CollabCode AI chat endpoint.');
      }

      const data = await res.json();
      if (!data.message || !data.message.content) {
        throw new Error('Received an empty response from AI service.');
      }

      if (data.taskPlan) {
        setActiveTaskPlan(data.taskPlan);
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message.content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        proposal: data.proposal || null,
        testPlan: data.testPlan || null,
        testResults: data.testResults || null,
        taskPlan: data.taskPlan || null,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Groq AI Chat Error:', err);

      let userFriendlyError = err.message;
      if (err.name === 'AbortError') {
        userFriendlyError = 'Network timeout: The AI service took longer than expected to respond. Please try again.';
      } else if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        userFriendlyError = isHttps
          ? 'Network error: Could not reach the AI service. Please check your connection and try again.'
          : 'Backend unavailable: Could not connect to the CollabCode server on port 3001. Please ensure the backend server is running ("npm run server" or "npm start").';
      }

      setErrorMessage(userFriendlyError);
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.isComposing) return;
      e.preventDefault();
      if (!isSubmittingRef.current && !isLoading && inputPrompt.trim()) {
        handleSendMessage();
      }
    }
  };

  const handlePlanDecision = useCallback(async (plan, action, options = {}) => {
    try {
      let updated = null;
      try {
        const res = await fetch('/api/ai/plan/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, action, options }),
        });
        if (res.ok) {
          const data = await res.json();
          updated = data.plan;
        }
      } catch {}

      if (!updated) {
        const now = new Date().toISOString();
        updated = JSON.parse(JSON.stringify(plan));
        if (action === 'approve') {
          updated.status = 'approved';
          updated.userApproval.status = 'approved';
          updated.userApproval.approvedAt = now;
        } else if (action === 'reject') {
          updated.status = 'rejected';
          updated.userApproval.status = 'rejected';
          updated.userApproval.rejectionReason = options.rejectionReason || 'User rejected execution plan.';
        }
      }

      setActiveTaskPlan(updated);
      setMessages(msgs => msgs.map(m => m.taskPlan?.planId === plan.planId ? { ...m, taskPlan: updated } : m));

      if (action === 'approve') {
        const firstStep = updated.steps[0];
        handleSendMessage(`Execution plan "${updated.title}" approved by user. Please begin executing ${firstStep.id}: ${firstStep.title}.`);
      } else if (action === 'reject') {
        handleSendMessage(`I have rejected this execution plan. Please inspect the project and propose an alternative approach.`);
      }
    } catch (err) {
      console.error('Plan decision error:', err);
    }
  }, [handleSendMessage, setMessages]);

  const handlePlanControl = useCallback(async (plan, action, reason = '') => {
    try {
      let updated = null;
      try {
        const res = await fetch('/api/ai/plan/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, action, reason }),
        });
        if (res.ok) {
          const data = await res.json();
          updated = data.plan;
        }
      } catch {}

      if (!updated) {
        const now = new Date().toISOString();
        updated = JSON.parse(JSON.stringify(plan));
        if (action === 'pause') {
          updated.status = 'paused';
          updated.pauseReason = reason || 'User paused plan execution.';
        } else if (action === 'resume') {
          updated.status = 'in_progress';
        } else if (action === 'cancel') {
          updated.status = 'cancelled';
          updated.steps.forEach(s => {
            if (s.status === 'pending' || s.status === 'in_progress') s.status = 'skipped';
          });
        }
      }

      setActiveTaskPlan(updated);
      setMessages(msgs => msgs.map(m => m.taskPlan?.planId === plan.planId ? { ...m, taskPlan: updated } : m));

      if (action === 'resume') {
        const nextStep = updated.steps.find(s => s.status === 'pending' || s.status === 'in_progress');
        if (nextStep) {
          handleSendMessage(`Execution resumed by user. Please continue executing ${nextStep.id}: ${nextStep.title}.`);
        }
      }
    } catch (err) {
      console.error('Plan control error:', err);
    }
  }, [handleSendMessage, setMessages]);

  const handleExecuteStep = useCallback((step) => {
    handleSendMessage(`Execute step ${step.id}: ${step.title}. Verify prerequisites before modifying files.`);
  }, [handleSendMessage]);

  const handleRecoverStep = useCallback((step) => {
    handleSendMessage(`Step ${step.id} failed with error: ${step.errorDetails || 'unknown'}. Use diagnose_code to analyze root cause and propose a fix with propose_file_edit.`);
  }, [handleSendMessage]);

  const handleNewChat = () => {
    isSubmittingRef.current = false;
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `New chat session started! What coding challenge or question would you like to explore?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setErrorMessage(null);
    setInputPrompt('');
    textareaRef.current?.focus();
  };

  return (
    <div className="cc-ai-workspace">
      {/* ── Top Chat Header ─────────────────────────────────────────────────── */}
      <header className="cc-ai-header">
        <div className="cc-ai-header-left">
          <button
            className="cc-ai-back-btn"
            onClick={onSwitchToCode}
            title="Return to Code Editor"
          >
            <ArrowLeft size={14} />
            <span>Code</span>
          </button>
          <div className="cc-ai-title-wrap">
            <div className="cc-ai-avatar-badge">
              <Sparkles size={14} />
            </div>
            <div>
              <div className="cc-ai-name">CollabCode AI</div>
              <div className="cc-ai-sub">Groq &bull; openai/gpt-oss-120b</div>
            </div>
          </div>
        </div>

        <div className="cc-ai-header-actions">
          <button
            className="cc-ai-tool-btn"
            onClick={handleNewChat}
            title="Start New Chat"
          >
            <RotateCcw size={13} />
            <span>New Chat</span>
          </button>
          <button
            className="cc-ai-tool-btn"
            onClick={() => setMessages([])}
            title="Clear Messages"
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>
      </header>

      {/* ── Conversation Message Area ───────────────────────────────────────── */}
      <div className="cc-ai-messages-area">
        {messages.length === 0 ? (
          <div className="cc-ai-empty-state">
            <div className="cc-ai-empty-icon">
              <Bot size={28} />
            </div>
            <h3>How can I assist your coding today?</h3>
            <p>Ask questions about HTML, CSS, JavaScript, React, or debug code in real time.</p>

            <div className="cc-ai-prompts-grid">
              {quickPrompts.map((item, idx) => (
                <button
                  key={idx}
                  className="cc-ai-prompt-card"
                  onClick={() => handleSendMessage(item.prompt)}
                >
                  <Lightbulb size={13} color="#818cf8" />
                  <span className="title">{item.title}</span>
                  <span className="desc">{item.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="cc-ai-message-list">
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`cc-ai-message-row ${isUser ? 'user-row' : 'assistant-row'}`}
                >
                  <div className="cc-ai-bubble-avatar">
                    {isUser ? <User size={13} /> : <Sparkles size={13} />}
                  </div>

                  <div className={`cc-ai-message-bubble ${isUser ? 'user' : 'assistant'}`}>
                    <div className="cc-ai-bubble-header">
                      <span className="cc-ai-sender">{isUser ? 'You' : 'CollabCode AI'}</span>
                      <span className="cc-ai-time">{msg.timestamp}</span>
                    </div>

                    <FormattedMessage content={msg.content} />

                    {msg.testResults && (
                      <ChatCardErrorBoundary>
                        <TestResultsCard
                          testResults={msg.testResults}
                          onRunRuntimeTests={onRunRuntimeTests}
                          onUpdateTestResults={(updatedResults, logs) => handleUpdateTestResults(msg.id, updatedResults, logs)}
                          onFixTest={(test) => handleSendMessage(`Runtime browser test failed for ${test.id} (${test.name}). Expected: ${test.expected}. Actual in Live Preview DOM: ${test.actual}.${test.errorDetails ? ` Error details: ${test.errorDetails}.` : ''} Please diagnose with analyze_runtime_test_failure and propose the fix.`)}
                        />
                      </ChatCardErrorBoundary>
                    )}

                    {msg.testPlan && !msg.testResults && (
                      <ChatCardErrorBoundary>
                        <TestPlanCard testPlan={msg.testPlan} />
                      </ChatCardErrorBoundary>
                    )}

                    {msg.taskPlan && (
                      <ChatCardErrorBoundary>
                        <TaskPlanCard
                          taskPlan={msg.taskPlan}
                          onPlanDecision={handlePlanDecision}
                          onPlanControl={handlePlanControl}
                          onExecuteStep={handleExecuteStep}
                          onRecoverStep={handleRecoverStep}
                        />
                      </ChatCardErrorBoundary>
                    )}

                    {msg.proposal && (
                      <ChatCardErrorBoundary>
                        <DiffPreview
                          proposal={msg.proposal}
                          onApprove={handleApproveProposal}
                          onReject={(prop) => onRejectProposal ? onRejectProposal(prop) : Promise.resolve()}
                        />
                      </ChatCardErrorBoundary>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="cc-ai-message-row assistant-row">
                <div className="cc-ai-bubble-avatar">
                  <Sparkles size={13} />
                </div>
                <div className="cc-ai-message-bubble assistant loading">
                  <div className="cc-ai-typing-indicator">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                  <span className="cc-ai-loading-text">CollabCode AI is thinking...</span>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="cc-ai-error-banner">
                <AlertCircle size={15} color="#f43f5e" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#fb7185' }}>Failed to generate response</div>
                  <div style={{ fontSize: 11, color: '#9fa6b2', marginTop: 2 }}>{errorMessage}</div>
                </div>
                <button
                  className="cc-ai-retry-btn"
                  disabled={isLoading}
                  onClick={() => handleSendMessage(null, true)}
                >
                  Retry
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input Box & Controls ────────────────────────────────────────────── */}
      <div className="cc-ai-input-container">
        {/* Quick chip for active file context if available */}
        {activeFileName && (
          <div className="cc-ai-context-chip">
            <Code2 size={11} color="#818cf8" />
            <span>Active file: <strong>{activeFileName}</strong></span>
          </div>
        )}

        <div className="cc-ai-input-box">
          <textarea
            ref={textareaRef}
            className="cc-ai-textarea"
            value={inputPrompt}
            onChange={e => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a coding question... (Press Enter to send, Shift+Enter for new line)"
            rows={2}
            disabled={isLoading}
          />

          <div className="cc-ai-input-actions">
            <span className="cc-ai-input-hint">
              <strong>Enter</strong> to send &bull; <strong>Shift+Enter</strong> for newline
            </span>

            <button
              className={`cc-ai-send-btn ${inputPrompt.trim() && !isLoading ? 'active' : ''}`}
              onClick={() => handleSendMessage()}
              disabled={!inputPrompt.trim() || isLoading}
              title="Send message (Enter)"
            >
              <Send size={13} />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
