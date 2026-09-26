import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import { emmetHTML, emmetCSS, emmetJSX } from 'emmet-monaco-es';
import {
  Code2, Globe, RefreshCw, Copy, Check,
  FileCode, FileText, Braces, FileCog, Trash2,
  ChevronDown, ChevronRight, FolderOpen, Folder,
  FilePlus, FolderPlus, Play, Terminal as TerminalIcon,
  Layout, Clock, Cpu, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Y from 'yjs';
import { io } from 'socket.io-client';
import '../index.css';

// ══════════════════════════════════════════════════════════════════════════════
// ── Language definitions (UNCHANGED) ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const LANGUAGES = [
  { key:'javascript', label:'JavaScript', ext:'js',    monacoLang:'javascript', color:'#f7df1e', bg:'rgba(247,223,30,0.12)',    icon:'𝙅𝙎', starter:`// JavaScript — Node.js\nconst readline = require('readline');\nconst rl = readline.createInterface({ input: process.stdin });\nlet lines = [];\nrl.on('line', l => lines.push(l.trim()));\nrl.on('close', () => {\n  console.log('Hello, World! 👋');\n});` },
  { key:'typescript', label:'TypeScript', ext:'ts',    monacoLang:'typescript', color:'#3178c6', bg:'rgba(49,120,198,0.15)',    icon:'𝙏𝙎', starter:`// TypeScript\nfunction greet(name: string): string {\n  return \`Hello, \${name}! 👋\`;\n}\nconsole.log(greet('World'));` },
  { key:'python',     label:'Python',     ext:'py',    monacoLang:'python',     color:'#3572A5', bg:'rgba(53,114,165,0.15)',    icon:'🐍', starter:`# Python 3\ndef solve():\n    name = input("Enter name: ")\n    print(f"Hello, {name}! 👋")\nsolve()` },
  { key:'ruby',       label:'Ruby',       ext:'rb',    monacoLang:'ruby',       color:'#cc342d', bg:'rgba(204,52,45,0.12)',     icon:'💎', starter:`# Ruby\nputs "Hello, World! 👋"\nname = gets&.chomp || "World"\nputs "Welcome, #{name}!"` },
  { key:'php',        label:'PHP',        ext:'php',   monacoLang:'php',        color:'#777bb4', bg:'rgba(119,123,180,0.15)',   icon:'🐘', starter:`<?php\n$name = "World";\necho "Hello, $name! 👋\\n";` },
  { key:'perl',       label:'Perl',       ext:'pl',    monacoLang:'perl',       color:'#0298c3', bg:'rgba(2,152,195,0.12)',     icon:'🔮', starter:`#!/usr/bin/perl\nuse strict;\nmy $name = "World";\nprint "Hello, $name! 👋\\n";` },
  { key:'c',          label:'C',          ext:'c',     monacoLang:'c',          color:'#555555', bg:'rgba(85,85,85,0.15)',      icon:'©',  starter:`#include <stdio.h>\nint main() {\n    printf("Hello, World! 👋\\n");\n    return 0;\n}` },
  { key:'cpp',        label:'C++',        ext:'cpp',   monacoLang:'cpp',        color:'#00599c', bg:'rgba(0,89,156,0.15)',      icon:'⊕',  starter:`#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    cout << "Hello, World! 👋" << endl;\n    return 0;\n}` },
  { key:'java',       label:'Java',       ext:'java',  monacoLang:'java',       color:'#b07219', bg:'rgba(176,114,25,0.15)',    icon:'☕', starter:`import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World! 👋");\n    }\n}` },
  { key:'go',         label:'Go',         ext:'go',    monacoLang:'go',         color:'#00ADD8', bg:'rgba(0,173,216,0.12)',     icon:'🐹', starter:`package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Hello, World! 👋")\n}` },
  { key:'rust',       label:'Rust',       ext:'rs',    monacoLang:'rust',       color:'#dea584', bg:'rgba(222,165,132,0.12)',   icon:'🦀', starter:`fn main() {\n    println!("Hello, World! 👋");\n}` },
  { key:'kotlin',     label:'Kotlin',     ext:'kt',    monacoLang:'kotlin',     color:'#A97BFF', bg:'rgba(169,123,255,0.12)',   icon:'🎯', starter:`fun main() {\n    println("Hello, World! 👋")\n}` },
  { key:'swift',      label:'Swift',      ext:'swift', monacoLang:'swift',      color:'#F05138', bg:'rgba(240,81,56,0.12)',     icon:'🐦', starter:`import Foundation\nprint("Hello, World! 👋")` },
  { key:'csharp',     label:'C#',         ext:'cs',    monacoLang:'csharp',     color:'#239120', bg:'rgba(35,145,32,0.12)',     icon:'♯',  starter:`using System;\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, World! 👋");\n    }\n}` },
  { key:'scala',      label:'Scala',      ext:'scala', monacoLang:'scala',      color:'#DC322F', bg:'rgba(220,50,47,0.12)',     icon:'⚖️', starter:`object Main extends App {\n  println("Hello, World! 👋")\n}` },
  { key:'haskell',    label:'Haskell',    ext:'hs',    monacoLang:'haskell',    color:'#5e5086', bg:'rgba(94,80,134,0.15)',     icon:'λ',  starter:`main :: IO ()\nmain = putStrLn "Hello, World! 👋"` },
  { key:'r',          label:'R',          ext:'r',     monacoLang:'r',          color:'#276dc3', bg:'rgba(39,109,195,0.12)',    icon:'📊', starter:`cat("Hello, World! 👋\\n")` },
  { key:'bash',       label:'Bash',       ext:'sh',    monacoLang:'shell',      color:'#89e051', bg:'rgba(137,224,81,0.10)',    icon:'$_', starter:`#!/bin/bash\necho "Hello, World! 👋"` },
  { key:'sql',        label:'SQL',        ext:'sql',   monacoLang:'sql',        color:'#e38c00', bg:'rgba(227,140,0,0.12)',     icon:'🗄️', starter:`-- SQL (SQLite)\nCREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users VALUES (1, 'Alice');\nSELECT * FROM users;` },
];
const LANG_BY_KEY = Object.fromEntries(LANGUAGES.map(l => [l.key, l]));

// ── Web mode starters (UNCHANGED) ─────────────────────────────────────────────
const STARTER_HTML = (title = 'My Page') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Hello from ${title}! 👋</h1>
    <p>Edit the files to see a live preview.</p>
    <button onclick="greet()">Click me!</button>
    <p id="output"></p>
  </div>
  <script src="script.js"></script>
</body>
</html>`;

const STARTER_CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  color: white;
}
.container {
  text-align: center; padding: 40px;
  background: rgba(255,255,255,0.07);
  border-radius: 20px; border: 1px solid rgba(255,255,255,0.15);
  backdrop-filter: blur(10px);
}
h1 { font-size: 2.5rem; margin-bottom: 16px; background: linear-gradient(90deg,#6366f1,#ec4899); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
p { opacity:0.7; margin-bottom:24px; font-size:1.1rem; }
button { padding:12px 28px; background:linear-gradient(135deg,#6366f1,#ec4899); border:none; border-radius:50px; color:white; font-size:1rem; font-weight:600; cursor:pointer; }
#output { margin-top:20px; font-size:1.2rem; color:#4ade80; }`;

const STARTER_JS = `function greet() {
  const msgs = ["Hello from JavaScript! 🚀","CollabCode is awesome! ✨","Build together, ship faster! 💻"];
  document.getElementById('output').textContent = msgs[Math.floor(Math.random()*msgs.length)];
}`;

const DEFAULT_TREE = {
  'index.html': { type:'file', name:'index.html', language:'html',       value: STARTER_HTML('CollabCode 3D') },
  'style.css':  { type:'file', name:'style.css',  language:'css',        value: STARTER_CSS },
  'script.js':  { type:'file', name:'script.js',  language:'javascript', value: STARTER_JS },
};

// ── Pure helpers (UNCHANGED) ──────────────────────────────────────────────────
function inferLanguage(name) {
  const ext = name.split('.').pop();
  return { html:'html',css:'css',js:'javascript',ts:'typescript',json:'json',
           py:'python',rb:'ruby',php:'php',pl:'perl',c:'c',cpp:'cpp',
           java:'java',go:'go',rs:'rust',kt:'kotlin',swift:'swift',
           cs:'csharp',scala:'scala',hs:'haskell',r:'r',sh:'shell',sql:'sql' }[ext] ?? 'plaintext';
}

function resolvePath(folderPath, href) {
  href = href.replace(/^\.\//, '');
  if (href.startsWith('../')) {
    const parts = folderPath.split('/').filter(Boolean); parts.pop(); href = href.slice(3);
    return parts.length ? `${parts.join('/')}/${href}` : href;
  }
  return folderPath ? `${folderPath}/${href}` : href;
}

function buildSrcDoc(tree, previewPath) {
  const htmlNode = tree[previewPath];
  if (!htmlNode || htmlNode.type !== 'file') return '';
  const folderPath = previewPath.includes('/') ? previewPath.split('/').slice(0,-1).join('/') : '';
  let html = htmlNode.value ?? '';
  html = html.replace(/<link([^>]*)href=["']([^"']+\.css)["']([^>]*)>/gi,
    (_m,a,href,b) => { const n=tree[resolvePath(folderPath,href)]; return n?`<style>${n.value}</style>`:`<link${a}href="${href}"${b}>`; });
  html = html.replace(/<script([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi,
    (_m,a,src,b) => { const n=tree[resolvePath(folderPath,src)]; return n?`<script${a}${b}>\n${n.value}\n</script>`:`<script${a}src="${src}"${b}></script>`; });
  return html;
}

function getChildren(tree, prefix) {
  return Object.entries(tree)
    .filter(([path]) => {
      if (prefix==='') return !path.includes('/');
      const rest = path.slice(prefix.length+1);
      return path.startsWith(prefix+'/') && !rest.includes('/');
    })
    .sort(([,a],[,b]) => {
      if (a.type==='folder'&&b.type!=='folder') return -1;
      if (b.type==='folder'&&a.type!=='folder') return  1;
      return 0;
    });
}

function starterFiles(folderPath) {
  const name = folderPath.split('/').pop();
  return {
    [`${folderPath}/index.html`]:{ type:'file',name:'index.html',language:'html',      value:STARTER_HTML(name) },
    [`${folderPath}/style.css`]: { type:'file',name:'style.css', language:'css',       value:STARTER_CSS },
    [`${folderPath}/script.js`]: { type:'file',name:'script.js', language:'javascript',value:STARTER_JS },
  };
}

// ── Monaco theme (dark professional) ────────────────────────────────────────
let emmetInitialized = false;
function defineTheme(monaco) {
  monaco.editor.defineTheme('collab-dark', {
    base:'vs-dark', inherit:true,
    rules:[
      { token:'comment',    foreground:'5A5A70', fontStyle:'italic' },
      { token:'keyword',    foreground:'60A5FA' },
      { token:'string',     foreground:'34D399' },
      { token:'number',     foreground:'F59E0B' },
    ],
    colors:{
      'editor.background':                 '#0D0D0F',
      'editor.foreground':                 '#E4E4E7',
      'editor.lineHighlightBackground':    '#141417',
      'editorLineNumber.foreground':       '#3A3A45',
      'editorLineNumber.activeForeground': '#60606E',
      'editorGutter.background':           '#0D0D0F',
      'editorIndentGuide.background1':     '#1C1C20',
      'editor.selectionBackground':        '#3B82F630',
      'editorCursor.foreground':           '#3B82F6',
      'editor.findMatchBackground':        '#3B82F640',
    },
  });
  monaco.editor.setTheme('collab-dark');
  if (!emmetInitialized) {
    emmetHTML(monaco,['html','php','vue']);
    emmetCSS(monaco,['css','scss','less']);
    emmetJSX(monaco,['javascript','typescript','jsx','tsx']);
    emmetInitialized = true;
  }
  const jsD = monaco.languages.typescript.javascriptDefaults;
  jsD.setCompilerOptions({ target:monaco.languages.typescript.ScriptTarget.ESNext, allowNonTsExtensions:true, moduleResolution:monaco.languages.typescript.ModuleResolutionKind.NodeJs, module:monaco.languages.typescript.ModuleKind.CommonJS, noEmit:true, esModuleInterop:true, jsx:monaco.languages.typescript.JsxEmit.React, allowJs:true, typeRoots:['node_modules/@types'] });
  jsD.setDiagnosticsOptions({ noSemanticValidation:false, noSyntaxValidation:false });
  jsD.setEagerModelSync(true);
  monaco.languages.html.htmlDefaults.setOptions({ format:{tabSize:2,insertSpaces:true}, suggest:{html5:true} });
  monaco.languages.css.cssDefaults.setOptions({ validate:true });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── File icon (redesigned) ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function FileIcon({ name, size=13 }) {
  const ext = name.split('.').pop();
  if (ext==='html') return <FileCode  size={size} color="#e44d26" />;
  if (ext==='css')  return <FileCog   size={size} color="#5b8af5" />;
  if (ext==='js')   return <Braces    size={size} color="#b59700" />;
  return <FileText size={size} color="rgba(255,255,255,0.3)" />;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TreeNode (redesigned visuals, identical props/logic) ──────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function TreeNode({ path,node,tree,level=0, activeFilePath,previewFilePath, onFileClick,onSetPreview,onDelete, expandedFolders,toggleFolder, onAddFile,onAddFolder }) {
  const [hovered, setHovered] = useState(false);
  const indent = level * 13;

  if (node.type === 'folder') {
    const isOpen = expandedFolders.has(path);
    const children = getChildren(tree, path);
    return (
      <>
        <div
          onClick={() => toggleFolder(path)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display:'flex', alignItems:'center', gap:5,
            padding:`5px 10px 5px ${8+indent}px`,
            cursor:'pointer',
            color: hovered ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)',
            fontSize:'0.78rem', userSelect:'none', borderRadius:6,
            background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
            transition:'all 0.15s',
          }}
        >
          {isOpen
            ? <ChevronDown  size={10} color="rgba(255,255,255,0.25)" />
            : <ChevronRight size={10} color="rgba(255,255,255,0.25)" />}
          {isOpen
            ? <FolderOpen size={12} color="#F59E0B" />
            : <Folder     size={12} color="#F59E0B" />}
          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'0.77rem' }}>
            {node.name}
          </span>
          {hovered && (
            <div style={{ display:'flex', gap:2 }}>
              <button onClick={e=>{e.stopPropagation();onAddFile(path);}} title="New file"
                style={treeBtnLight} onMouseEnter={e=>e.currentTarget.style.color='#3B82F6'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.25)'}>
                <FilePlus size={10}/>
              </button>
              <button onClick={e=>{e.stopPropagation();onDelete(path);}} title="Delete"
                style={treeBtnLight} onMouseEnter={e=>e.currentTarget.style.color='#EF4444'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.25)'}>
                <Trash2 size={10}/>
              </button>
            </div>
          )}
        </div>
        {isOpen && children.map(([cp,cn]) => (
          <TreeNode key={cp} path={cp} node={cn} tree={tree} level={level+1}
            activeFilePath={activeFilePath} previewFilePath={previewFilePath}
            onFileClick={onFileClick} onSetPreview={onSetPreview} onDelete={onDelete}
            expandedFolders={expandedFolders} toggleFolder={toggleFolder}
            onAddFile={onAddFile} onAddFolder={onAddFolder} />
        ))}
      </>
    );
  }

  const isActive  = activeFilePath  === path;
  const isPreview = previewFilePath === path;
  const isHtml    = node.name.endsWith('.html');

  return (
    <div
      onClick={() => onFileClick(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:'flex', alignItems:'center', gap:6,
        padding:`5px 10px 5px ${8+indent}px`,
        cursor:'pointer', borderRadius:6,
        background:  isActive ? 'rgba(59,130,246,0.10)' : hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        borderLeft: `2px solid ${isActive ? '#3B82F6' : 'transparent'}`,
        color:       isActive ? '#3B82F6' : hovered ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)',
        fontSize:'0.77rem', transition:'all 0.12s',
      }}
    >
      <FileIcon name={node.name} />
      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isActive ? 600 : 400 }}>
        {node.name}
      </span>
      {isHtml && (
        <button title="Set as live preview"
          onClick={e=>{e.stopPropagation();onSetPreview(path);}}
          style={{
            background: isPreview ? 'rgba(34,197,94,0.10)' : 'transparent',
            border:`1px solid ${isPreview ? 'rgba(34,197,94,0.22)' : 'transparent'}`,
            borderRadius:4, cursor:'pointer',
            color: isPreview ? '#22C55E' : 'rgba(255,255,255,0.25)',
            padding:'1px 4px', display:'flex', alignItems:'center', transition:'all 0.15s',
          }}
          onMouseEnter={e=>{if(!isPreview)e.currentTarget.style.color='#22C55E';}}
          onMouseLeave={e=>{if(!isPreview)e.currentTarget.style.color='rgba(255,255,255,0.25)';}}>
          <Globe size={9}/>
        </button>
      )}
      {hovered && (
        <button onClick={e=>{e.stopPropagation();onDelete(path);}} title="Delete file"
          style={treeBtnLight} onMouseEnter={e=>e.currentTarget.style.color='#EF4444'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.25)'}>
          <Trash2 size={10}/>
        </button>
      )}
    </div>
  );
}
const treeBtnLight = { background:'transparent',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.25)',display:'flex',padding:'1px',flexShrink:0,transition:'color 0.15s' };


// ══════════════════════════════════════════════════════════════════════════════
// ── Language Selector (redesigned) ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function LanguageSelector({ currentLang, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const lang = LANG_BY_KEY[currentLang] ?? LANGUAGES[0];

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const groups = [
    { label:'Web & Scripting', keys:['javascript','typescript','python','ruby','php','perl'] },
    { label:'Systems',         keys:['c','cpp','java','go','rust','kotlin','swift','csharp','scala'] },
    { label:'Other',           keys:['haskell','r','bash','sql'] },
  ];

  return (
    <div ref={ref} style={{ position:'relative', userSelect:'none' }}>
      <button
        onClick={() => !disabled && setOpen(o=>!o)}
        disabled={disabled}
        style={{
          display:'flex', alignItems:'center', gap:7,
          padding:'5px 10px 5px 8px', borderRadius:8, cursor:disabled?'default':'pointer',
          background: open ? '#1C1C20' : '#141417',
          border:'1px solid rgba(255,255,255,0.08)',
          color:'rgba(255,255,255,0.75)', fontSize:'0.78rem', fontWeight:600,
          transition:'all 0.2s', minWidth:130, whiteSpace:'nowrap',
        }}
      >
        <span style={{ fontSize:'0.88rem', lineHeight:1 }}>{lang.icon}</span>
        <span style={{ flex:1 }}>{lang.label}</span>
        <ChevronDown size={12} style={{ opacity:0.5, transform:open?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity:0, y:-6, scale:0.97 }}
            animate={{ opacity:1, y:0,  scale:1    }}
            exit={{    opacity:0, y:-6, scale:0.97 }}
            transition={{ duration:0.15 }}
            className="lang-dropdown-light"
          >
            {groups.map(group => (
              <div key={group.label}>
                <div className="lang-group-label-light">
                  {group.label}
                </div>
                {group.keys.map(key => {
                  const l = LANG_BY_KEY[key];
                  const isActive = key === currentLang;
                  return (
                    <div key={key} onClick={() => { onChange(key); setOpen(false); }}
                      style={{
                        display:'flex', alignItems:'center', gap:8,
                        padding:'6px 8px', borderRadius:7, cursor:'pointer',
                        background: isActive ? 'rgba(59,130,246,0.10)' : 'transparent',
                        border:`1px solid ${isActive ? 'rgba(59,130,246,0.2)' : 'transparent'}`,
                        marginBottom:2, transition:'background 0.12s',
                      }}
                      onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background='rgba(255,255,255,0.05)'; }}
                      onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background='transparent'; }}
                    >
                      <span style={{ fontSize:'0.82rem', width:20, textAlign:'center', flexShrink:0 }}>{l.icon}</span>
                      <span style={{ fontSize:'0.78rem', color: isActive ? '#3B82F6' : 'rgba(255,255,255,0.65)', fontWeight: isActive?700:400, flex:1 }}>{l.label}</span>
                      <span style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.22)', fontFamily:'monospace' }}>.{l.ext}</span>
                    </div>
                  );
                })}
                <div style={{ height:4 }}/>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Output Panel (redesigned) ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function OutputPanel({ output, isRunning, onRun, stdin, onStdinChange, cpuTime, memory, canEdit }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }); }, [output]);

  return (
    <div className="output-panel-light">
      {/* ── Top bar ── */}
      <div className="output-topbar-light">
        <div className="output-label-light">
          <TerminalIcon size={12} color="#3B82F6" />
          Output
        </div>
        <div style={{ flex:1 }}/>
        {cpuTime && (
          <div className="output-meta-light">
            <Clock size={10}/> {cpuTime}s
          </div>
        )}
        {memory && (
          <div className="output-meta-light">
            <Cpu size={10}/> {memory}KB
          </div>
        )}
        {canEdit && (
          <motion.button
            whileHover={{ scale:1.04 }}
            whileTap={{ scale:0.97 }}
            onClick={onRun}
            disabled={isRunning}
            className="run-full-btn-light"
          >
            {isRunning
              ? <span style={{ display:'inline-block', animation:'spin 0.8s linear infinite' }}>↻</span>
              : <Play size={11} fill="currentColor"/>}
            {isRunning ? 'Running…' : 'Run Code'}
          </motion.button>
        )}
      </div>

      {/* ── stdin ── */}
      {canEdit && (
        <div className="stdin-row-light">
          <span className="stdin-label-light">stdin</span>
          <textarea
            value={stdin}
            onChange={e => onStdinChange(e.target.value)}
            placeholder="Provide input (one value per line)…"
            rows={2}
            className="stdin-textarea-light"
          />
        </div>
      )}

      {/* ── Output area ── */}
      <div className="output-scroll-light">
        {output === null && !isRunning && (
          <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.78rem', fontFamily:'Inter,sans-serif', display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
            <Zap size={13} color="rgba(255,255,255,0.15)"/>
            Click <strong style={{ color:'#22C55E', margin:'0 4px' }}>Run Code</strong> to execute your program
          </div>
        )}
        {output !== null && output.trim() === '' && !isRunning && (
          <div style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.75rem', fontFamily:'Inter,sans-serif', display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
            <Check size={12} color="#22C55E"/>
            <span>Program finished with exit code 0 (no stdout output)</span>
          </div>
        )}
        {isRunning && (
          <div style={{ display:'flex', alignItems:'center', gap:8, color:'#3B82F6', fontSize:'0.78rem', fontFamily:'Inter,sans-serif' }}>
            <span style={{ display:'inline-block', animation:'spin 0.8s linear infinite' }}>↻</span>
            Executing on JDoodle sandbox…
          </div>
        )}
        {output && output.trim() !== '' && !isRunning && (
          <pre style={{ color:'rgba(255,255,255,0.82)', whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0, lineHeight:1.65, fontSize:'12.5px', fontFamily:"'JetBrains Mono',monospace" }}>
            {output}
          </pre>
        )}
        <div ref={endRef}/>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Toast notification (redesigned) ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function Toast({ t }) {
  const cls = t.type === 'success' ? 'toast-success-light' : t.type === 'error' ? 'toast-error-light' : 'toast-info-light';
  return (
    <motion.div
      initial={{ x:80, opacity:0 }}
      animate={{ x:0,  opacity:1 }}
      exit={{    x:80, opacity:0 }}
      transition={{ type:'spring', stiffness:400, damping:30 }}
      className={cls}
    >
      {t.msg}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Edit-request popup (redesigned) ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function EditRequestPopup({ req, onApprove, onDeny, extraCount }) {
  return (
    <motion.div
      initial={{ x:80, opacity:0, scale:0.95 }}
      animate={{ x:0,  opacity:1, scale:1    }}
      exit={{    x:80, opacity:0, scale:0.95 }}
      transition={{ type:'spring', stiffness:350, damping:28 }}
      className="edit-req-popup-light"
    >
      <div className="edit-req-header-light">
        <div className="edit-req-avatar-light">👤</div>
        <div>
          <div style={{ fontSize:'0.62rem',color:'rgba(255,255,255,0.28)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'Inter,sans-serif' }}>Edit Request</div>
          <div style={{ fontSize:'0.88rem',fontWeight:700,color:'rgba(255,255,255,0.9)',fontFamily:'Inter,sans-serif' }}>{req.requesterName}</div>
        </div>
        {extraCount > 0 && (
          <span style={{ marginLeft:'auto',fontSize:'0.65rem',background:'rgba(59,130,246,0.10)',padding:'2px 7px',borderRadius:99,color:'#3B82F6',fontWeight:700,fontFamily:'Inter,sans-serif' }}>
            +{extraCount}
          </span>
        )}
      </div>
      <div style={{ padding:'10px 16px', fontSize:'0.78rem',color:'rgba(255,255,255,0.42)',fontFamily:'Inter,sans-serif' }}>
        Wants to <strong style={{ color:'rgba(255,255,255,0.88)' }}>edit</strong> this room. Grant access?
      </div>
      <div style={{ display:'flex',gap:8,padding:'0 16px 14px' }}>
        <button onClick={onApprove} className="edit-req-approve-light">
          ✅ Approve
        </button>
        <button onClick={onDeny} className="edit-req-deny-light">
          ❌ Deny
        </button>
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main EditorPage ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function EditorPage() {
  // ── Room & permission (UNCHANGED) ─────────────────────────────────────────
  const [roomId] = useState(() => {
    const u = new URLSearchParams(window.location.search);
    let r = u.get('room');
    if (!r) { r = Math.random().toString(36).substring(2,9).toUpperCase(); window.history.replaceState(null,'',`?room=${r}`); }
    return r;
  });
  const [canEdit,            setCanEdit]            = useState(() => { const rid=new URLSearchParams(window.location.search).get('room')??''; return sessionStorage.getItem(`can_edit_${rid}`) === 'true'; });
  const [isAdmin,            setIsAdmin]            = useState(false);
  const [editRequestPending, setEditRequestPending] = useState(false);
  const [incomingRequests,   setIncomingRequests]   = useState([]);
  const [toasts,             setToasts]             = useState([]);

  const addToast = useCallback((msg, type='info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Editor mode (UNCHANGED) ───────────────────────────────────────────────
  const [editorMode,   setEditorMode]   = useState('web');
  const [selectedLang, setSelectedLang] = useState('javascript');
  const [codeContent,  setCodeContent]  = useState(() => LANG_BY_KEY['javascript'].starter);
  const [stdinValue,   setStdinValue]   = useState('');
  const [codeOutput,   setCodeOutput]   = useState(null);
  const [isRunning,    setIsRunning]    = useState(false);
  const [runMeta,      setRunMeta]      = useState({ cpuTime:null, memory:null });

  const codeModeKey = useCallback(lang => `__code__/main.${LANG_BY_KEY[lang]?.ext ?? 'txt'}`, []);

  // ── File tree state (UNCHANGED) ───────────────────────────────────────────
  const [fileTree,        setFileTree]        = useState(DEFAULT_TREE);
  const [activeFilePath,  setActiveFilePath]  = useState('index.html');
  const [previewFilePath, setPreviewFilePath] = useState('index.html');
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [newItem,         setNewItem]         = useState({ visible:false, parent:'', type:'file', name:'' });
  const newItemRef = useRef(null);

  // ── Yjs / Socket refs (UNCHANGED) ────────────────────────────────────────
  const yjsDocs  = useRef(new Map());
  const socketRef = useRef(null);

  // ── Layout (UNCHANGED) ───────────────────────────────────────────────────
  const [splitPct, setSplitPct] = useState(55);
  const isDragging  = useRef(false);
  const containerRef = useRef(null);
  const SIDEBAR_W = 200;

  // ── Misc ─────────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const [srcDoc,  setSrcDoc]  = useState('');
  const [mobileTab, setMobileTab] = useState('editor'); // 'editor' | 'output'
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ── SEO Page Meta ─────────────────────────────────────────────────────────
  useEffect(() => {
    document.title = roomId ? `Room ${roomId} — CollabCode IDE` : 'CollabCode IDE — Real-Time Editor';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        `Live collaborative code editor session in room ${roomId}. Write, sync, and execute code in real-time across 19 languages.`
      );
    }
  }, [roomId]);

  // ── Live preview (UNCHANGED) ──────────────────────────────────────────────
  useEffect(() => {
    if (editorMode !== 'web') return;
    const t = setTimeout(() => setSrcDoc(buildSrcDoc(fileTree, previewFilePath)), 300);
    return () => clearTimeout(t);
  }, [fileTree, previewFilePath, editorMode]);

  // ── Socket.io + Yjs bootstrap (UNCHANGED) ─────────────────────────────────
  useEffect(() => {
    const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');
    socketRef.current = socket;
    Object.keys(DEFAULT_TREE).forEach(p => { if (!yjsDocs.current.has(p)) yjsDocs.current.set(p, new Y.Doc()); });

    socket.on('connect', () => socket.emit('join-room', roomId));

    socket.on('room-role', ({ isAdmin: f }) => {
      setIsAdmin(f);
      if (f) { setCanEdit(true); sessionStorage.setItem(`can_edit_${roomId}`, 'true'); }
      else   { setCanEdit(false); sessionStorage.removeItem(`can_edit_${roomId}`); }
    });

    socket.on('sync-step-1', ({ fileName, update }) => {
      if (!fileName || !update) return;
      if (!yjsDocs.current.has(fileName)) yjsDocs.current.set(fileName, new Y.Doc());
      const doc = yjsDocs.current.get(fileName);
      try {
        Y.applyUpdate(doc, new Uint8Array(update));
        const newValue = doc.getText('content').toString();
        if (newValue) {
          if (fileName.startsWith('__code__/')) {
            const ext = fileName.split('.').pop();
            const langKey = LANGUAGES.find(l => l.ext === ext)?.key ?? 'javascript';
            setSelectedLang(langKey); setCodeContent(newValue);
          }
          setFileTree(prev => {
            if (!prev[fileName]) { const name=fileName.split('/').pop(); return {...prev,[fileName]:{type:'file',name,language:inferLanguage(name),value:newValue}}; }
            return {...prev,[fileName]:{...prev[fileName],value:newValue}};
          });
        }
      } catch { /* intentionally swallow Yjs applyUpdate errors on malformed packets */ }
    });

    socket.on('sync-update', ({ fileName, update }) => {
      if (!fileName || !update) return;
      if (!yjsDocs.current.has(fileName)) yjsDocs.current.set(fileName, new Y.Doc());
      const doc = yjsDocs.current.get(fileName);
      try {
        Y.applyUpdate(doc, new Uint8Array(update));
        const newValue = doc.getText('content').toString();
        if (fileName.startsWith('__code__/')) {
          const ext = fileName.split('.').pop();
          const langKey = LANGUAGES.find(l => l.ext === ext)?.key ?? 'javascript';
          setSelectedLang(langKey); setCodeContent(newValue);
        }
        setFileTree(prev => {
          if (!prev[fileName]) { const name=fileName.split('/').pop(); return {...prev,[fileName]:{type:'file',name,language:inferLanguage(name),value:newValue}}; }
          return {...prev,[fileName]:{...prev[fileName],value:newValue}};
        });
      } catch { /* intentionally swallow Yjs applyUpdate errors on malformed packets */ }
    });

    socket.on('tree-init', (serverTree) => {
      Object.entries(serverTree).forEach(([p,n]) => {
        if (n.type==='file') {
          if (!yjsDocs.current.has(p)) {
            const doc=new Y.Doc();
            if (n.value) { const yText=doc.getText('content'); if(yText.length===0) doc.transact(()=>{yText.insert(0,n.value);}); }
            yjsDocs.current.set(p, doc);
          }
          if (p.startsWith('__code__/') && n.value) {
            const ext=p.split('.').pop();
            const langKey=LANGUAGES.find(l=>l.ext===ext)?.key??'javascript';
            setSelectedLang(langKey); setCodeContent(n.value); setEditorMode('code');
          }
        }
      });
      setFileTree(prev => ({...prev,...serverTree}));
      const folders=Object.entries(serverTree).filter(([,n])=>n.type==='folder').map(([p])=>p);
      if (folders.length) setExpandedFolders(prev=>new Set([...prev,...folders]));
    });

    socket.on('tree-change', ({ op, path, node, extraPaths }) => {
      if (op==='add') {
        if (node?.type==='file'&&!yjsDocs.current.has(path)) yjsDocs.current.set(path, new Y.Doc());
        if (extraPaths) Object.entries(extraPaths).forEach(([p,n])=>{ if(n.type==='file'&&!yjsDocs.current.has(p)) yjsDocs.current.set(p,new Y.Doc()); });
        setFileTree(prev=>({...prev,[path]:node,...(extraPaths??{})}));
        if (node?.type==='folder') setExpandedFolders(prev=>new Set([...prev,path]));
      } else if (op==='delete') {
        setFileTree(prev=>{ const next={...prev}; Object.keys(next).forEach(k=>{if(k===path||k.startsWith(path+'/'))delete next[k];}); return next; });
      }
    });

    socket.on('mode-change', ({ mode, lang }) => { setEditorMode(mode); if(lang) setSelectedLang(lang); });

    socket.on('edit-request', req  => setIncomingRequests(p=>[...p,req]));
    socket.on('edit-granted',  ()  => { setEditRequestPending(false); setCanEdit(true); sessionStorage.setItem(`can_edit_${roomId}`,'true'); addToast('✅ Edit access granted! You can now type.','success'); });
    socket.on('edit-denied',   ()  => { setEditRequestPending(false); addToast('❌ Request denied by admin.','error'); });

    // Snapshot the Map reference so the cleanup can safely iterate it
    // even if the ref has been reassigned by the time it runs.
    const docs = yjsDocs.current;
    return () => { socket.disconnect(); docs.forEach(doc => doc.destroy()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Yjs broadcast (UNCHANGED) ────────────────────────────────────────────
  const activeSyncKey = editorMode==='code' ? codeModeKey(selectedLang) : activeFilePath;

  useEffect(() => {
    if (!yjsDocs.current.has(activeSyncKey)) yjsDocs.current.set(activeSyncKey, new Y.Doc());
    const doc = yjsDocs.current.get(activeSyncKey);
    const onUpdate = update => { if(socketRef.current?.connected) socketRef.current.emit('sync-update',roomId,{fileName:activeSyncKey,update:Array.from(update)}); };
    doc.on('update', onUpdate);
    return () => doc.off('update', onUpdate);
  }, [activeSyncKey, roomId]);

  // ── Editor change (UNCHANGED) ─────────────────────────────────────────────
  const handleEditorChange = useCallback(val => {
    const newVal = val ?? '';
    if (editorMode==='code') { setCodeContent(newVal); }
    else { setFileTree(prev=>({...prev,[activeFilePath]:{...prev[activeFilePath],value:newVal}})); }
    const doc = yjsDocs.current.get(activeSyncKey);
    if (doc) { const yText=doc.getText('content'); if(yText.toString()!==newVal) doc.transact(()=>{yText.delete(0,yText.length);yText.insert(0,newVal);}); }
  }, [activeFilePath, activeSyncKey, editorMode]);

  // ── Language change (UNCHANGED) ───────────────────────────────────────────
  const handleLangChange = useCallback(newKey => {
    const lang = LANG_BY_KEY[newKey]; if (!lang) return;
    setSelectedLang(newKey); setCodeContent(lang.starter); setCodeOutput(null); setRunMeta({cpuTime:null,memory:null});
    const key = codeModeKey(newKey);
    if (!yjsDocs.current.has(key)) yjsDocs.current.set(key, new Y.Doc());
    socketRef.current?.emit('mode-change', roomId, { mode:'code', lang:newKey });
  }, [codeModeKey, roomId]);

  // ── Mode switch (UNCHANGED) ───────────────────────────────────────────────
  const handleModeSwitch = useCallback(mode => {
    setEditorMode(mode); setCodeOutput(null);
    socketRef.current?.emit('mode-change', roomId, { mode, lang:selectedLang });
  }, [roomId, selectedLang]);

  // ── Run code ──────────────────────────────────────────────────────────────
  const handleRunCode = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setCodeOutput(null);
    setRunMeta({ cpuTime:null, memory:null });
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ language:selectedLang, sourceCode:codeContent, stdin:stdinValue })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCodeOutput(`❌ Execution failed: ${data.error || res.statusText || 'Unable to execute code.'}`);
        addToast(`Execution error: ${data.error || 'Failed to run code'}`, 'error');
      } else {
        const out = data.run?.output;
        setCodeOutput(out !== undefined && out !== null && out !== '' ? out : 'Program executed successfully with no stdout output.');
        setRunMeta({ cpuTime:data.run?.cpuTime ?? null, memory:data.run?.memory ?? null });
        addToast('Code executed successfully', 'success');
      }
    } catch(err) {
      setCodeOutput(`❌ Network error: Could not reach execution server (${err.message}). Make sure the backend server is running.`);
      addToast('Network error: server unreachable', 'error');
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, selectedLang, codeContent, stdinValue, addToast]);

  // ── File tree operations (UNCHANGED) ──────────────────────────────────────
  const handleFileClick  = useCallback(path => setActiveFilePath(path), []);
  const handleSetPreview = useCallback(path => setPreviewFilePath(path), []);
  const toggleFolder     = useCallback(path => { setExpandedFolders(prev => { const next=new Set(prev); next.has(path)?next.delete(path):next.add(path); return next; }); }, []);

  const handleDeleteItem = useCallback(path => {
    if (activeFilePath===path||activeFilePath.startsWith(path+'/')) { const r=Object.entries(fileTree).find(([k,n])=>k!==path&&!k.startsWith(path+'/')&&n.type==='file'); if(r) setActiveFilePath(r[0]); }
    if (previewFilePath===path||previewFilePath.startsWith(path+'/')) { const r=Object.entries(fileTree).find(([k,n])=>k!==path&&!k.startsWith(path+'/')&&n.type==='file'&&k.endsWith('.html')); if(r) setPreviewFilePath(r[0]); }
    setFileTree(prev => { const next={...prev}; Object.keys(next).forEach(k=>{if(k===path||k.startsWith(path+'/'))delete next[k];}); return next; });
    socketRef.current?.emit('tree-change', roomId, { op:'delete', path });
  }, [activeFilePath, previewFilePath, fileTree, roomId]);

  const openNewItemForm = useCallback((type, parent='') => {
    setNewItem({visible:true,parent,type,name:''}); if(parent) setExpandedFolders(prev=>new Set([...prev,parent]));
    setTimeout(()=>newItemRef.current?.focus(), 60);
  }, []);

  const handleCreateItem = useCallback(() => {
    const {parent,type,name} = newItem; const trimmed = name.trim();
    if (!trimmed) { setNewItem({visible:false,parent:'',type:'file',name:''}); return; }
    const fullPath = parent?`${parent}/${trimmed}`:trimmed;
    if (fileTree[fullPath]) return;
    if (type==='folder') {
      const folderNode={type:'folder',name:trimmed}; const starters=starterFiles(fullPath);
      setFileTree(prev=>({...prev,[fullPath]:folderNode,...starters})); setExpandedFolders(prev=>new Set([...prev,fullPath]));
      setActiveFilePath(`${fullPath}/index.html`);
      Object.keys(starters).forEach(p=>{ if(!yjsDocs.current.has(p)) yjsDocs.current.set(p,new Y.Doc()); });
      socketRef.current?.emit('tree-change', roomId, {op:'add',path:fullPath,node:folderNode,extraPaths:starters});
    } else {
      const lang=inferLanguage(trimmed); const node={type:'file',name:trimmed,language:lang,value:''};
      setFileTree(prev=>({...prev,[fullPath]:node})); setActiveFilePath(fullPath);
      if(!yjsDocs.current.has(fullPath)) yjsDocs.current.set(fullPath,new Y.Doc());
      socketRef.current?.emit('tree-change', roomId, {op:'add',path:fullPath,node});
    }
    setNewItem({visible:false,parent:'',type:'file',name:''});
  }, [newItem, fileTree, roomId]);

  // ── Permission actions (UNCHANGED) ────────────────────────────────────────
  const requestEditAccess = useCallback(() => {
    if (!socketRef.current?.connected||editRequestPending) return;
    setEditRequestPending(true);
    socketRef.current.emit('request-edit',{roomId,requesterName:`Guest_${socketRef.current.id?.slice(0,4)??'???'}`});
    addToast('📨 Edit request sent to admin…','info');
  }, [editRequestPending, roomId, addToast]);

  const respondToRequest = useCallback((req, approved) => {
    if (!socketRef.current?.connected) return;
    setIncomingRequests(p=>p.filter(r=>r.requesterSocketId!==req.requesterSocketId));
    if (approved) { socketRef.current.emit('grant-edit',{requesterSocketId:req.requesterSocketId,roomId}); addToast(`✅ Granted edit to ${req.requesterName}`,'success'); }
    else          { socketRef.current.emit('deny-edit', {requesterSocketId:req.requesterSocketId,roomId}); addToast(`❌ Denied ${req.requesterName}`,'error'); }
  }, [roomId, addToast]);

  // ── Drag to resize (UNCHANGED) ────────────────────────────────────────────
  const onDragStart = useCallback(e => { e.preventDefault(); isDragging.current=true; document.body.style.cursor='col-resize'; document.body.style.userSelect='none'; }, []);
  useEffect(() => {
    const onMove = e => { if(!isDragging.current||!containerRef.current) return; const rect=containerRef.current.getBoundingClientRect(); const avail=rect.width-SIDEBAR_W-10; const x=e.clientX-rect.left-SIDEBAR_W-5; setSplitPct(Math.min(80,Math.max(20,(x/avail)*100))); };
    const onUp = () => { isDragging.current=false; document.body.style.cursor=''; document.body.style.userSelect=''; };
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
    return () => { window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); };
  }, []);

  // ── Misc ─────────────────────────────────────────────────────────────────
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      addToast('Room ID copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Could not access clipboard. Please copy manually.', 'error');
    }
  };
  const refreshPreview = () => { setSrcDoc(''); setTimeout(()=>setSrcDoc(buildSrcDoc(fileTree,previewFilePath)),60); };

  const activeFileNode  = editorMode==='web' ? fileTree[activeFilePath] : null;
  const rootChildren    = getChildren(fileTree, '');
  const pathParts       = activeFilePath.split('/');
  const fileName        = pathParts.pop();
  const dirPart         = pathParts.join('/');
  const currentLangDef  = LANG_BY_KEY[selectedLang] ?? LANGUAGES[0];
  const sidebarW        = editorMode==='web' ? SIDEBAR_W : 46;

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER ────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="editor-root-light">
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="editor-header-light">
        {/* Logo */}
        <Link to="/" className="logo-text-light">
          <Code2 size={17} color="#3B82F6" />
          <span>CollabCode</span>
        </Link>

        {/* Divider */}
        <div className="header-divider-light" />

        {/* Mode toggle */}
        <div className="mode-toggle-light">
          {[
            { mode:'web',  icon:<Layout size={12}/>,       label:'Web'  },
            { mode:'code', icon:<TerminalIcon size={12}/>, label:'Code' },
          ].map(m => {
            const active = editorMode === m.mode;
            return (
              <button key={m.mode}
                className={`mode-btn-light${active ? ` active ${m.mode}` : ''}`}
                onClick={() => handleModeSwitch(m.mode)}
              >
                {m.icon} {m.label}
              </button>
            );
          })}
        </div>

        {/* Language selector (code mode) */}
        {editorMode === 'code' && (
          <LanguageSelector currentLang={selectedLang} onChange={handleLangChange} disabled={!canEdit} />
        )}

        {/* Mobile View Switcher (visible on mobile <= 768px) */}
        <div className="mobile-editor-tabs">
          {editorMode === 'web' && (
            <button
              onClick={() => setMobileSidebarOpen(o => !o)}
              className={`mobile-tab-btn ${mobileSidebarOpen ? 'active' : ''}`}
              title="Toggle File Explorer"
            >
              <FolderOpen size={11} /> Files
            </button>
          )}
          <button
            className={`mobile-tab-btn ${mobileTab === 'editor' ? 'active' : ''}`}
            onClick={() => { setMobileTab('editor'); setMobileSidebarOpen(false); }}
          >
            Code
          </button>
          <button
            className={`mobile-tab-btn ${mobileTab === 'output' ? 'active' : ''}`}
            onClick={() => { setMobileTab('output'); setMobileSidebarOpen(false); }}
          >
            {editorMode === 'web' ? 'Preview' : 'Output'}
          </button>
        </div>

        <div style={{ flex:1 }}/>

        {/* Right side controls */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Admin badge */}
          {isAdmin && (
            <div className="badge-admin-light">
              👑 Admin
            </div>
          )}

          {/* View-only + request button */}
          {!canEdit && !isAdmin && (
            <>
              <div className="badge-view-light">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                View Only
              </div>
              <button onClick={requestEditAccess} disabled={editRequestPending}
                className="request-edit-btn-light">
                {editRequestPending
                  ? <><span style={{ width:9,height:9,border:'1.5px solid #3B82F6',borderTopColor:'transparent',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite' }}/> Waiting…</>
                  : '🔓 Request Edit'}
              </button>
            </>
          )}

          {/* Room ID */}
          <div className="room-chip-light">
            <div className="room-chip-dot" />
            <span style={{ color:'rgba(255,255,255,0.32)' }}>Room</span>
            <strong style={{ color:'rgba(255,255,255,0.9)', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em' }}>{roomId}</strong>
          </div>

          {/* Copy Room ID button */}
          <motion.button
            whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
            onClick={copyRoomId}
            className={`copy-btn-light${copied ? ' copied' : ''}`}>
            {copied ? <Check size={12} color="#22C55E"/> : <Copy size={12}/>}
            {copied ? 'Copied!' : 'Copy ID'}
          </motion.button>
        </div>
      </header>

      {/* ── TOAST LAYER ──────────────────────────────────────────────────────── */}
      <div style={{ position:'fixed', bottom:20, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end', pointerEvents:'none' }}>
        <AnimatePresence>
          {toasts.map(t => <Toast key={t.id} t={t} />)}
        </AnimatePresence>
        <AnimatePresence>
          {incomingRequests.slice(0,1).map(req => (
            <div key={req.requesterSocketId} style={{ pointerEvents:'auto' }}>
              <EditRequestPopup
                req={req}
                extraCount={incomingRequests.length-1}
                onApprove={() => respondToRequest(req,true)}
                onDeny={()    => respondToRequest(req,false)}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── MAIN LAYOUT ──────────────────────────────────────────────────────── */}
      <main ref={containerRef} className="editor-main-light">

        {/* ══ WEB MODE SIDEBAR ══════════════════════════════════════════════ */}
        {editorMode === 'web' && (
          <div className={`sidebar-light${mobileSidebarOpen ? ' mobile-open' : ''}`}>
            {/* Sidebar header */}
            <div className="sidebar-header-light">
              <span>Explorer</span>
              <div style={{ display:'flex', gap:2 }}>
                <button onClick={() => openNewItemForm('file','')} title="New File"
                  className="sidebar-icon-btn-light">
                  <FilePlus size={12}/>
                </button>
                <button onClick={() => openNewItemForm('folder','')} title="New Folder"
                  className="sidebar-icon-btn-light">
                  <FolderPlus size={12}/>
                </button>
              </div>
            </div>

            {/* New-item input */}
            {newItem.visible && (
              <div className="new-item-row-light">
                {newItem.type==='folder' ? <Folder size={11} color="#F59E0B"/> : <FileText size={11} color="rgba(255,255,255,0.3)"/>}
                <input
                  ref={newItemRef}
                  value={newItem.name}
                  onChange={e=>setNewItem(p=>({...p,name:e.target.value}))}
                  onKeyDown={e=>{if(e.key==='Enter')handleCreateItem();if(e.key==='Escape')setNewItem({visible:false,parent:'',type:'file',name:''}); }}
                  placeholder={newItem.type==='folder'?'folder-name':'filename.ext'}
                  className="new-item-input-light"
                />
              </div>
            )}

            {/* File tree */}
            <div className="tree-scroll-light" style={{ flex:1, overflowY:'auto', padding:'4px 4px' }}>
              {rootChildren.length === 0 ? (
                <div style={{ padding: '28px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.32)', fontSize: '0.74rem' }}>
                  <FolderOpen size={22} style={{ opacity: 0.35, margin: '0 auto 8px', display: 'block' }} />
                  <div style={{ fontWeight: 500 }}>No files yet</div>
                  <div style={{ fontSize: '0.67rem', opacity: 0.7, marginTop: 4 }}>Click + to create a file or folder</div>
                </div>
              ) : (
                rootChildren.map(([path,node]) => (
                  <TreeNode key={path} path={path} node={node} tree={fileTree} level={0}
                    activeFilePath={activeFilePath} previewFilePath={previewFilePath}
                    onFileClick={handleFileClick} onSetPreview={handleSetPreview} onDelete={handleDeleteItem}
                    expandedFolders={expandedFolders} toggleFolder={toggleFolder}
                    onAddFile={p=>openNewItemForm('file',p)} onAddFolder={p=>openNewItemForm('folder',p)}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* ══ CODE MODE LANG STRIP ══════════════════════════════════════════ */}
        {editorMode === 'code' && (
          <div className="lang-strip-light">
            {LANGUAGES.map(l => {
              const active = l.key === selectedLang;
              return (
                <button key={l.key} title={l.label}
                  onClick={() => canEdit && handleLangChange(l.key)}
                  style={{
                    width:32, height:32, borderRadius:7,
                    cursor:canEdit?'pointer':'default',
                    background: active ? l.bg : 'transparent',
                    border:`1px solid ${active ? `${l.color}55` : 'transparent'}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.65rem', transition:'all 0.15s',
                  }}
                  onMouseEnter={e=>{if(!active)e.currentTarget.style.background='rgba(255,255,255,0.06)';}}
                  onMouseLeave={e=>{if(!active)e.currentTarget.style.background='transparent';}}>
                  <span style={{ userSelect:'none', lineHeight:1 }}>{l.icon}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ══ EDITOR PANEL ═════════════════════════════════════════════════ */}
        <div className={`editor-panel-light ${mobileTab !== 'editor' ? 'mobile-hidden' : ''}`} style={{ flex:`0 0 calc((100% - ${sidebarW + 14}px) * ${splitPct/100})` }}>
          {/* Tab bar */}
          <div className="editor-tab-bar-light">
            <div className={`editor-tab-light ${editorMode}`} style={{ borderBottomColor: editorMode==='code' ? currentLangDef.color : '#3B82F6' }}>
              {editorMode === 'web' ? (
                <>
                  {activeFileNode && <FileIcon name={activeFileNode.name} size={12}/>}
                  {dirPart && <span style={{ color:'rgba(255,255,255,0.28)', fontSize:'0.68rem' }}>{dirPart} /&nbsp;</span>}
                  <span>{fileName}</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize:'0.82rem', lineHeight:1 }}>{currentLangDef.icon}</span>
                  <span>main.{currentLangDef.ext}</span>
                  <span style={{ fontSize:'0.62rem', color:currentLangDef.color, background:currentLangDef.bg, padding:'1px 6px', borderRadius:99, border:`1px solid ${currentLangDef.color}44` }}>
                    {currentLangDef.label}
                  </span>
                </>
              )}
            </div>
            <div style={{ flex:1 }}/>
            {editorMode==='code' && canEdit && (
              <motion.button
                whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
                onClick={handleRunCode} disabled={isRunning}
                className="run-btn-light">
                {isRunning
                  ? <span style={{ display:'inline-block', animation:'spin 0.8s linear infinite' }}>↻</span>
                  : <Play size={10} fill="currentColor"/>}
                {isRunning ? 'Running…' : '▶ Run'}
              </motion.button>
            )}
          </div>

          {/* Monaco */}
          <div style={{ flex:1, minHeight:0 }}>
            <MonacoEditor
              path={editorMode==='code' ? codeModeKey(selectedLang) : activeFilePath}
              height="100%"
              language={editorMode==='code' ? currentLangDef.monacoLang : (activeFileNode?.language ?? 'plaintext')}
              value={editorMode==='code' ? codeContent : (activeFileNode?.value ?? '')}
              onChange={handleEditorChange}
              onMount={(_,monaco) => defineTheme(monaco)}
              theme="collab-dark"
              options={{
                minimap:{enabled:false}, fontSize:14,
                fontFamily:"'JetBrains Mono',Consolas,monospace", fontLigatures:true,
                wordWrap:'on', padding:{top:14},
                scrollbar:{verticalScrollbarSize:4,horizontalScrollbarSize:4},
                overviewRulerBorder:false, renderLineHighlight:'line',
                readOnly:!canEdit, domReadOnly:!canEdit,
                cursorBlinking:'smooth', cursorSmoothCaretAnimation:'on',
                quickSuggestions:canEdit?{other:true,comments:true,strings:true}:false,
                suggestOnTriggerCharacters:canEdit,
                wordBasedSuggestions:'currentDocument', snippetSuggestions:'inline',
                parameterHints:{enabled:canEdit}, autoClosingBrackets:'always',
                autoClosingQuotes:'always', autoSurround:'languageDefined',
                formatOnType:canEdit, formatOnPaste:canEdit,
                autoClosingTags:true, linkedEditing:canEdit, automaticLayout:true,
              }}
            />
          </div>
        </div>

        {/* ══ DRAG HANDLE ══════════════════════════════════════════════════ */}
        <div onMouseDown={onDragStart} className="drag-handle-light">
          <div className="drag-handle-bar-light"
            onMouseEnter={e=>e.currentTarget.style.background='#3B82F6'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.07)'}/>
        </div>

        {/* ══ RIGHT PANEL ══════════════════════════════════════════════════ */}
        <div className={`right-panel-light ${mobileTab !== 'output' ? 'mobile-hidden' : ''}`}>
          {editorMode === 'web' ? (
            <>
              {/* Preview bar */}
              <div className="preview-bar-light">
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  {['#ff5f57','#febc2e','#28c840'].map(c => <span key={c} style={{ width:8,height:8,borderRadius:'50%',background:c,display:'inline-block' }}/>)}
                  <div className="preview-url-chip-light" style={{ marginLeft:8 }}>
                    <Globe size={9}/> {previewFilePath}
                  </div>
                </div>
                <button onClick={refreshPreview} className="refresh-btn-light">
                  <RefreshCw size={11}/> Refresh
                </button>
              </div>
              <iframe srcDoc={srcDoc} title="Live Preview" sandbox="allow-scripts allow-same-origin"
                style={{ flex:1,border:'none',background:'#fafafa',width:'100%' }}/>
            </>
          ) : (
            <OutputPanel
              output={codeOutput} isRunning={isRunning} onRun={handleRunCode}
              stdin={stdinValue} onStdinChange={setStdinValue}
              cpuTime={runMeta.cpuTime} memory={runMeta.memory} canEdit={canEdit}
            />
          )}
        </div>
      </main>
    </div>
  );
}
