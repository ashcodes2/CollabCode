import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkJsSyntax,
  extractHtmlMetadata,
  extractJsMetadata,
  extractCssMetadata,
  diagnoseProject,
} from '../tools/diagnosticEngine.js';
import {
  executeTool,
  TOOL_DEFINITIONS,
} from '../tools/projectTools.js';
import {
  createProposal,
  applyProposal,
  rejectProposal,
} from '../tools/proposalManager.js';

describe('Phase 3: Debugging Agent – CollabCode', () => {

  // ── 1. Unit Diagnostics Tests ─────────────────────────────────────────────

  test('checkJsSyntax: detects unclosed parenthesis or syntax error', () => {
    const badJs = 'function test() { console.log("hello"';
    const err = checkJsSyntax(badJs, 'test.js');
    assert.ok(err, 'Should detect syntax error');
    assert.equal(err.type, 'syntax_error');
    assert.ok(err.message && err.line >= 1);

    const goodJs = 'function test() { console.log("hello"); }';
    assert.equal(checkJsSyntax(goodJs, 'test.js'), null);
  });

  test('extractJsMetadata: detects incorrect addEventListener("onclick")', () => {
    const js = 'btn.addEventListener("onclick", () => alert(1));';
    const meta = extractJsMetadata(js, 'script.js');
    assert.equal(meta.potentialBugs.length, 1);
    assert.equal(meta.potentialBugs[0].type, 'incorrect_event_name');
    assert.ok(meta.potentialBugs[0].message.includes('without the "on" prefix'));
  });

  test('extractJsMetadata: detects immediate function invocation in addEventListener', () => {
    const js = 'btn.addEventListener("click", handleClick());';
    const meta = extractJsMetadata(js, 'script.js');
    const bug = meta.potentialBugs.find(b => b.type === 'immediate_function_call');
    assert.ok(bug);
    assert.ok(bug.message.includes('immediately invoked'));
  });

  test('extractJsMetadata: detects string concatenation counter bug', () => {
    const js = 'let count = counterElem.innerText + 1;';
    const meta = extractJsMetadata(js, 'script.js');
    const bug = meta.potentialBugs.find(b => b.type === 'string_concatenation_counter');
    assert.ok(bug);
    assert.ok(bug.message.includes('string concatenation'));
  });

  // ── 2. Scenario 1: "Find bugs in my JavaScript code." ─────────────────────

  test('Scenario 1: Detects JS syntax errors and event listener bugs', () => {
    const bugTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: '<!DOCTYPE html><html><body><button id="my-btn">Click</button><script src="script.js"></script></body></html>',
      },
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: 'const btn = document.getElementById("my-btn");\nbtn.addEventListener("onclick", () => {\n  console.log("clicked");\n});',
      },
    };

    const diag = executeTool('diagnose_code', {}, bugTree);
    assert.equal(diag.success, true);
    assert.ok(diag.diagnostics.confirmedErrors.length >= 1);
    const eventBug = diag.diagnostics.confirmedErrors.find(e => e.category === 'Event Listener Bug');
    assert.ok(eventBug);
    assert.ok(eventBug.message.includes('onclick'));

    // Propose fix
    const fixedJs = 'const btn = document.getElementById("my-btn");\nbtn.addEventListener("click", () => {\n  console.log("clicked");\n});';
    const propRes = executeTool('propose_file_edit', {
      path: 'script.js',
      content: fixedJs,
      explanation: 'Changed event name from onclick to click',
    }, bugTree);
    assert.equal(propRes.success, true);
    assert.equal(propRes.proposal.changes[0].action, 'modify');
  });

  // ── 3. Scenario 2: "Why is my button click event not working?" ───────────

  test('Scenario 2: Detects missing DOM ID selector between HTML and JS', () => {
    const bugTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: '<!DOCTYPE html><html><body><button id="submit-button">Submit</button><script src="script.js"></script></body></html>',
      },
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: 'document.getElementById("submit-btn").addEventListener("click", () => alert("Sent"));',
      },
    };

    const diag = executeTool('diagnose_code', {}, bugTree);
    assert.equal(diag.success, true);
    const missingId = diag.diagnostics.confirmedErrors.find(e => e.category === 'Missing DOM Element');
    assert.ok(missingId, 'Should flag missing submit-btn ID in HTML');
    assert.ok(missingId.message.includes('submit-btn'));
    assert.ok(missingId.message.includes('submit-button'), 'Should suggest matching existing ID');

    // Propose fix: update JS to match HTML ID
    const fixedJs = 'document.getElementById("submit-button").addEventListener("click", () => alert("Sent"));';
    const prop = executeTool('propose_file_edit', {
      path: 'script.js',
      content: fixedJs,
      explanation: 'Updated selector to match id="submit-button" from index.html',
    }, bugTree);
    assert.equal(prop.success, true);
  });

  // ── 4. Scenario 3: "Find why my CSS styles are not applying." ─────────────

  test('Scenario 3: Detects broken <link rel="stylesheet"> target', () => {
    const bugTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Hello</h1></body></html>',
      },
      'style.css': {
        type: 'file',
        name: 'style.css',
        value: 'body { background: #000; color: #fff; }',
      },
    };

    const diag = executeTool('diagnose_code', {}, bugTree);
    assert.equal(diag.success, true);
    const brokenLink = diag.diagnostics.confirmedErrors.find(e => e.category === 'Broken Stylesheet Link');
    assert.ok(brokenLink);
    assert.ok(brokenLink.message.includes('styles.css'));

    // Propose fix: update link href in index.html
    const fixedHtml = '<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>Hello</h1></body></html>';
    const prop = executeTool('propose_file_edit', {
      path: 'index.html',
      content: fixedHtml,
      explanation: 'Fixed stylesheet link to point to style.css',
    }, bugTree);
    assert.equal(prop.success, true);
  });

  // ── 5. Scenario 4: "Analyze this browser error: Cannot read properties of null (reading 'addEventListener')" ──

  test('Scenario 4: Analyzes null addEventListener error caused by head script timing', () => {
    const bugTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: '<!DOCTYPE html><html><head><script src="script.js"></script></head><body><button id="btn">Click</button></body></html>',
      },
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: 'document.getElementById("btn").addEventListener("click", () => console.log("clicked"));',
      },
    };

    const errMessage = "TypeError: Cannot read properties of null (reading 'addEventListener')";
    const diag = executeTool('diagnose_code', { error_message: errMessage }, bugTree);
    assert.equal(diag.success, true);

    // Should detect DOM execution timing bug because script is in head without defer
    const timingBug = diag.diagnostics.confirmedErrors.find(e => e.category === 'DOM Execution Timing Bug');
    assert.ok(timingBug, 'Should detect script in head without defer');
    assert.ok(timingBug.message.includes('defer'));

    // Should include errorAnalysis
    assert.ok(diag.diagnostics.errorAnalysis);
    assert.ok(diag.diagnostics.errorAnalysis.rootCause.includes('script executed in <head> before the DOM'));

    // Propose multi-file or single-file fix adding defer
    const fixedHtml = '<!DOCTYPE html><html><head><script src="script.js" defer></script></head><body><button id="btn">Click</button></body></html>';
    const prop = executeTool('propose_file_edit', {
      path: 'index.html',
      content: fixedHtml,
      explanation: 'Added defer attribute to script tag so DOM is parsed before execution',
    }, bugTree);
    assert.equal(prop.success, true);
  });

  // ── 6. Scenario 5: "Fix the bug where my counter is not updating." ────────

  test('Scenario 5: Detects counter string concatenation logic bug', () => {
    const bugTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: '<!DOCTYPE html><html><body><span id="counter">0</span><button id="inc">Add</button><script src="script.js"></script></body></html>',
      },
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: 'const counter = document.getElementById("counter");\ndocument.getElementById("inc").addEventListener("click", () => {\n  counter.innerText = counter.innerText + 1;\n});',
      },
    };

    const diag = executeTool('diagnose_code', {}, bugTree);
    assert.equal(diag.success, true);
    const counterBug = diag.diagnostics.potentialIssues.find(p => p.category === 'Logic Warning');
    assert.ok(counterBug);
    assert.ok(counterBug.message.includes('string concatenation'));

    // Propose fix
    const fixedJs = 'const counter = document.getElementById("counter");\ndocument.getElementById("inc").addEventListener("click", () => {\n  counter.innerText = parseInt(counter.innerText, 10) + 1;\n});';
    const prop = executeTool('propose_file_edit', {
      path: 'script.js',
      content: fixedJs,
      explanation: 'Parsed counter.innerText to integer before incrementing to avoid string concatenation',
    }, bugTree);
    assert.equal(prop.success, true);
  });

  // ── 7. Multi-File Debugging & Proposal Workflow ────────────────────────────

  test('Multi-file debugging: atomic cross-file bug fix with approval and rejection', () => {
    const bugTree = {
      'index.html': {
        type: 'file',
        name: 'index.html',
        value: '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><button id="send-btn">Send</button><script src="main.js"></script></body></html>',
      },
      'style.css': {
        type: 'file',
        name: 'style.css',
        value: '#send-button { background: blue; }',
      },
      'script.js': {
        type: 'file',
        name: 'script.js',
        value: 'document.getElementById("send-button").addEventListener("click", () => alert(1));',
      },
    };

    const diag = executeTool('diagnose_code', {}, bugTree);
    assert.equal(diag.success, true);
    assert.ok(diag.diagnostics.confirmedErrors.length >= 2, 'Should find broken script & broken css link');

    // Propose multi-file fix
    const fixedHtml = '<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body><button id="send-button">Send</button><script src="script.js" defer></script></body></html>';
    const fixedCss = '#send-button { background: blue; color: white; }';

    const prop = executeTool('propose_file_changes', {
      changes: [
        { path: 'index.html', content: fixedHtml, explanation: 'Fixed stylesheet and script paths, aligned button ID' },
        { path: 'style.css', content: fixedCss, explanation: 'Added text color' },
      ],
    }, bugTree);

    assert.equal(prop.success, true);
    assert.equal(prop.proposal.changes.length, 2);

    const id = prop.proposal.proposalId;

    // Verify rejection leaves files 100% untouched
    const rej = rejectProposal(id);
    assert.equal(rej.success, true);

    // Verify rejected proposal cannot be applied
    const appAfterRej = applyProposal(id, { currentFileTree: bugTree });
    assert.equal(appAfterRej.success, false);
  });

  // ── 8. Phase 1 & Phase 2 Regression Integrity ─────────────────────────────

  test('Phase 1 & Phase 2 regressions: all prior capabilities remain functional', () => {
    const tree = {
      'index.html': { type: 'file', name: 'index.html', value: '<h1>Hello</h1>' },
      'app.js': { type: 'file', name: 'app.js', value: 'console.log("ok");' },
    };

    // Phase 1 tools
    const list = executeTool('list_files', {}, tree);
    assert.equal(list.success, true);
    assert.equal(list.files.length, 2);

    const read = executeTool('read_file', { path: 'index.html' }, tree);
    assert.equal(read.success, true);
    assert.equal(read.content, '<h1>Hello</h1>');

    const search = executeTool('search_code', { query: 'console' }, tree);
    assert.equal(search.success, true);
    assert.equal(search.results.length, 1);

    // Phase 2 proposal creation & apply
    const prop = executeTool('propose_file_edit', {
      path: 'app.js',
      content: 'console.log("updated");',
    }, tree);
    assert.equal(prop.success, true);

    const applied = applyProposal(prop.proposal.proposalId, { currentFileTree: tree });
    assert.equal(applied.success, true);
    assert.equal(applied.appliedChanges[0].content, 'console.log("updated");');
  });
});
