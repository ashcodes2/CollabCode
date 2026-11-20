import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeLineDiff } from '../tools/diffEngine.js';
import {
  createProposal,
  getProposal,
  applyProposal,
  rejectProposal,
  validateProposedFile,
} from '../tools/proposalManager.js';
import {
  TOOL_DEFINITIONS,
  executeTool,
  sanitizeProjectPath,
} from '../tools/projectTools.js';

describe('Phase 2: Code Generation, Diff Engine & Controlled Editing', () => {
  const mockFileTree = {
    'index.html': {
      type: 'file',
      name: 'index.html',
      language: 'html',
      value: '<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Welcome</h1>\n  <script src="script.js"></script>\n</body>\n</html>',
    },
    'style.css': {
      type: 'file',
      name: 'style.css',
      language: 'css',
      value: 'body {\n  font-family: sans-serif;\n  background-color: #ffffff;\n  margin: 0;\n}',
    },
    'script.js': {
      type: 'file',
      name: 'script.js',
      language: 'javascript',
      value: 'console.log("App loaded");',
    },
  };

  test('Diff Engine: computes additions accurately', () => {
    const orig = 'line1\nline2';
    const prop = 'line1\nline_new\nline2';
    const diff = computeLineDiff(orig, prop);
    assert.equal(diff.additions, 1);
    assert.equal(diff.deletions, 0);
    assert.ok(diff.unifiedText.includes('+line_new'));
  });

  test('Diff Engine: computes deletions and modifications', () => {
    const orig = 'color: red;';
    const prop = 'color: darkblue;';
    const diff = computeLineDiff(orig, prop);
    assert.equal(diff.additions, 1);
    assert.equal(diff.deletions, 1);
    assert.ok(diff.unifiedText.includes('-color: red;'));
    assert.ok(diff.unifiedText.includes('+color: darkblue;'));
  });

  test('Security: blocks path traversal attempts', () => {
    const t1 = validateProposedFile('../config.js', 'alert(1)');
    assert.equal(t1.valid, false);

    const t2 = validateProposedFile('%2e%2e/index.html', 'alert(1)');
    assert.equal(t2.valid, false);
  });

  test('Security: blocks sensitive files (.env, keys)', () => {
    const r1 = validateProposedFile('.env', 'SECRET=123');
    assert.equal(r1.valid, false);

    const r2 = validateProposedFile('id_rsa', 'key');
    assert.equal(r2.valid, false);
  });

  test('Security: restricts editing to HTML, CSS, JavaScript only', () => {
    const py = validateProposedFile('test.py', 'print(1)');
    assert.equal(py.valid, false);

    const html = validateProposedFile('contact.html', '<h1>Contact</h1>');
    assert.equal(html.valid, true);

    const css = validateProposedFile('theme.css', 'body {}');
    assert.equal(css.valid, true);

    const js = validateProposedFile('utils.js', 'export const x = 1;');
    assert.equal(js.valid, true);
  });

  test('Scenario 1: Add a button to HTML page', () => {
    const newHtml = '<!DOCTYPE html>\n<html>\n<body>\n  <button id="btn">Click</button>\n</body>\n</html>';
    const res = executeTool('propose_file_edit', {
      path: 'index.html',
      content: newHtml,
      explanation: 'Added button',
    }, mockFileTree);

    assert.equal(res.success, true);
    assert.ok(res.proposal);
    assert.equal(res.proposal.changes[0].action, 'modify');
    assert.equal(res.proposal.status, 'pending');
  });

  test('Scenario 2: Change background color to dark blue in CSS', () => {
    const newCss = 'body {\n  background-color: #00008b;\n}';
    const res = executeTool('propose_file_edit', {
      path: 'style.css',
      content: newCss,
      explanation: 'Dark blue background',
    }, mockFileTree);

    assert.equal(res.success, true);
    assert.equal(res.proposal.changes[0].path, 'style.css');
  });

  test('Scenario 3: Add click event to JavaScript file', () => {
    const newJs = 'console.log("App loaded");\nbtn.addEventListener("click", () => alert(1));';
    const res = executeTool('propose_file_edit', {
      path: 'script.js',
      content: newJs,
      explanation: 'Click event',
    }, mockFileTree);

    assert.equal(res.success, true);
    assert.equal(res.proposal.changes[0].path, 'script.js');
  });

  test('Scenario 4: Create new contact.html file', () => {
    const contactHtml = '<!DOCTYPE html>\n<html>\n<head><title>Contact</title></head>\n</html>';
    const res = executeTool('propose_file_edit', {
      path: 'contact.html',
      content: contactHtml,
      explanation: 'Created contact page',
    }, mockFileTree);

    assert.equal(res.success, true);
    assert.equal(res.proposal.changes[0].action, 'create');
  });

  test('Scenario 5: Modify multiple files for navigation bar', () => {
    const res = executeTool('propose_file_changes', {
      changes: [
        { path: 'index.html', content: '<nav><a href="#">Home</a></nav>', explanation: 'Nav HTML' },
        { path: 'style.css', content: 'nav { display: flex; }', explanation: 'Nav CSS' },
      ],
    }, mockFileTree);

    assert.equal(res.success, true);
    assert.equal(res.proposal.changes.length, 2);
  });

  test('Rejection: leaves files untouched and locks proposal', () => {
    const res = createProposal({
      items: [{ path: 'index.html', content: '<h1>Rejected</h1>' }],
      fileTree: mockFileTree,
    });
    const id = res.proposal.proposalId;

    const rej = rejectProposal(id);
    assert.equal(rej.success, true);

    const apply = applyProposal(id, { currentFileTree: mockFileTree });
    assert.equal(apply.success, false);
  });

  test('Approval: applies reviewed changes and detects concurrency conflicts', () => {
    const res = createProposal({
      items: [{ path: 'index.html', content: '<h1>Applied</h1>' }],
      fileTree: mockFileTree,
    });
    const id = res.proposal.proposalId;

    // Concurrent modification simulation
    const conflictTree = {
      ...mockFileTree,
      'index.html': { ...mockFileTree['index.html'], value: 'different' },
    };
    const conflictApply = applyProposal(id, { currentFileTree: conflictTree });
    assert.equal(conflictApply.success, false);
    assert.ok(conflictApply.error.includes('Concurrent modification'));

    // Valid approval
    const validApply = applyProposal(id, { currentFileTree: mockFileTree });
    assert.equal(validApply.success, true);
    assert.equal(validApply.appliedChanges[0].content, '<h1>Applied</h1>');
  });

  test('Phase 1 regression: list_files, read_file, search_code work properly', () => {
    const list = executeTool('list_files', {}, mockFileTree);
    assert.equal(list.success, true);
    assert.equal(list.files.length, 3);

    const read = executeTool('read_file', { path: 'index.html' }, mockFileTree);
    assert.equal(read.success, true);
    assert.ok(read.content.includes('Welcome'));

    const search = executeTool('search_code', { query: 'Welcome' }, mockFileTree);
    assert.equal(search.success, true);
    assert.equal(search.results.length, 1);
  });
});
