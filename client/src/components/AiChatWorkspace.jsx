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
  Sparkles, Send, Trash2, RotateCcw, Copy, Check,
  Bot, User, Code2, AlertCircle, ArrowLeft, Terminal,
  ExternalLink, Lightbulb
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  messages: parentMessages,
  setMessages: parentSetMessages,
  inputPrompt: parentInputPrompt,
  setInputPrompt: parentSetInputPrompt,
  isLoading: parentIsLoading,
  setIsLoading: parentSetIsLoading,
  errorMessage: parentErrorMessage,
  setErrorMessage: parentSetErrorMessage,
  isVisible = true,
}) {
  const [internalMessages, setInternalMessages] = useState(DEFAULT_AI_MESSAGES);
  const messages = parentMessages !== undefined ? parentMessages : internalMessages;
  const setMessages = parentSetMessages || setInternalMessages;

  const [internalInputPrompt, setInternalInputPrompt] = useState('');
  const inputPrompt = parentInputPrompt !== undefined ? parentInputPrompt : internalInputPrompt;
  const setInputPrompt = parentSetInputPrompt || setInternalInputPrompt;

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
    { title: 'Center with Flexbox', prompt: 'How do I center a div horizontally and vertically using modern CSS Flexbox and Grid?' },
    { title: 'Interactive Button JS', prompt: 'Show me how to create an interactive button in JavaScript that changes background color and increments a counter.' },
    { title: 'Responsive Navbar', prompt: 'Write an HTML and CSS responsive navigation bar with a mobile hamburger menu.' },
    { title: 'Async/Await vs Promises', prompt: 'Explain the difference between JavaScript Promises and async/await with clean examples.' },
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
      
      // Prefer relative endpoint proxied by Vite dev server (/api/ai/chat)
      // or configured external backend in production
      const primaryUrl = configuredBackend ? `${configuredBackend}/api/ai/chat` : '/api/ai/chat';
      const fallbackUrl = 'http://127.0.0.1:3001/api/ai/chat';

      // Send sanitized history to backend
      const payloadMessages = historyToSend
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), 40000);

      let res;
      try {
        res = await fetch(primaryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: payloadMessages }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        // If relative URL failed and no custom backend was set, try direct fallback to 127.0.0.1:3001
        if (!configuredBackend && fetchErr.name !== 'AbortError') {
          try {
            res = await fetch(fallbackUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: payloadMessages }),
              signal: controller.signal,
            });
          } catch (fallbackErr) {
            throw fetchErr;
          }
        } else {
          throw fetchErr;
        }
      } finally {
        clearTimeout(timeoutTimer);
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const status = res.status;
        let descriptiveError = errorData.error;

        if (!descriptiveError) {
          if (status === 401) descriptiveError = 'Authentication failure: Invalid Groq API key in server configuration.';
          else if (status === 404) descriptiveError = 'Model error: The specified Groq model was not found.';
          else if (status === 429) descriptiveError = 'Rate limit exceeded: Too many requests to Groq. Please wait a moment before trying again.';
          else if (status === 502 || status === 503) descriptiveError = 'Groq service error: AI service is currently unavailable.';
          else if (status === 504) descriptiveError = 'Network timeout: Request to Groq API timed out.';
          else descriptiveError = `Server returned HTTP ${status}: ${res.statusText}`;
        }

        throw new Error(descriptiveError);
      }

      const data = await res.json();
      if (!data.message || !data.message.content) {
        throw new Error('Received an empty response from AI service.');
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message.content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Groq AI Chat Error:', err);

      let userFriendlyError = err.message;
      if (err.name === 'AbortError') {
        userFriendlyError = 'Network timeout: The AI service took longer than 40 seconds to respond. Please try again.';
      } else if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        userFriendlyError = 'Backend unavailable: Could not connect to the CollabCode server on port 3001. Please ensure the backend server is running ("npm run server" or "npm start").';
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
