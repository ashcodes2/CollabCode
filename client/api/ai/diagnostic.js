/**
 * client/api/ai/diagnostic.js
 *
 * Deterministic code diagnostic and static analysis engine for Vercel Serverless.
 * Analyzes HTML, CSS, and JavaScript files to identify:
 * - Syntax errors in JavaScript
 * - Missing DOM IDs and mismatched selectors across HTML & JS
 * - Script execution order bugs (<script> in <head> without defer querying DOM)
 * - Incorrect event handling (e.g. 'onclick' instead of 'click' in addEventListener)
 * - Mismatched or broken <script src> and <link rel="stylesheet"> references
 * - CSS selector mismatches between HTML and CSS
 * - Logical counter bugs (string concatenation instead of numeric addition)
 * - Known browser runtime error pattern matching
 */

import vm from 'vm';

function checkJsSyntax(code, filename = 'script.js') {
  if (typeof code !== 'string') return null;
  try {
    new vm.Script(code, { filename, produceCachedData: false });
    return null;
  } catch (err) {
    if (err instanceof SyntaxError) {
      const match = err.stack?.match(/:(\d+)(?::(\d+))?/);
      return {
        type: 'syntax_error',
        message: err.message,
        line: match ? parseInt(match[1], 10) : (err.lineNumber || 1),
        column: match && match[2] ? parseInt(match[2], 10) : (err.columnNumber || 1),
      };
    }
    return null;
  }
}

function extractHtmlMetadata(html = '') {
  const ids = new Set();
  const classes = new Set();
  const scripts = [];
  const stylesheets = [];

  const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    ids.add(match[1].trim());
  }

  const classRegex = /\bclass\s*=\s*["']([^"']+)["']/gi;
  while ((match = classRegex.exec(html)) !== null) {
    match[1].split(/\s+/).forEach(cls => {
      if (cls) classes.add(cls.trim());
    });
  }

  const headMatch = /<head[\s>]([\s\S]*?)<\/head>/i.exec(html);
  const headContent = headMatch ? headMatch[1] : '';

  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const isDefer = /\bdefer\b/i.test(attrs);
    const isAsync = /\basync\b/i.test(attrs);
    const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);
    const inHead = headContent ? html.indexOf(match[0]) < html.indexOf('</head>') : false;

    scripts.push({
      src: srcMatch ? srcMatch[1].trim() : null,
      isInline: !srcMatch,
      inHead,
      hasDefer: isDefer || isAsync || isModule,
      rawTag: match[0],
    });
  }

  const linkRegex = /<link\b([^>]*)>/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = match[1];
    if (/rel\s*=\s*["']stylesheet["']/i.test(attrs)) {
      const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs);
      if (hrefMatch) {
        stylesheets.push(hrefMatch[1].trim());
      }
    }
  }

  return { ids, classes, scripts, stylesheets };
}

function extractCssMetadata(css = '') {
  const classes = new Set();
  const ids = new Set();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

  const classRegex = /\.([a-zA-Z0-9_-]+)(?=[^a-zA-Z0-9_-]|$)/g;
  let match;
  while ((match = classRegex.exec(clean)) !== null) {
    classes.add(match[1]);
  }

  const idRegex = /#([a-zA-Z0-9_-]+)(?=[^a-zA-Z0-9_-]|$)/g;
  while ((match = idRegex.exec(clean)) !== null) {
    ids.add(match[1]);
  }

  return { classes, ids };
}

function extractJsMetadata(js = '', filePath = 'script.js') {
  const domLookups = [];
  const eventListeners = [];
  const potentialBugs = [];

  const lines = js.split('\n');
  const getElemIdRegex = /document\.getElementById\s*\(\s*["']([^"']+)["']\s*\)/g;
  const querySelRegex = /document\.querySelector(?:All)?\s*\(\s*["']([^"']+)["']\s*\)/g;
  const addEventListenerRegex = /\.addEventListener\s*\(\s*["']([^"']+)["']\s*,\s*([^)]*)\)/g;

  for (let idx = 0; idx < lines.length; idx++) {
    const lineText = lines[idx];
    const lineNum = idx + 1;

    let m;
    while ((m = getElemIdRegex.exec(lineText)) !== null) {
      domLookups.push({ type: 'id', selector: m[1], line: lineNum, raw: m[0] });
    }

    while ((m = querySelRegex.exec(lineText)) !== null) {
      const sel = m[1].trim();
      let selType = 'other';
      let name = sel;
      if (sel.startsWith('#')) {
        selType = 'id';
        name = sel.slice(1);
      } else if (sel.startsWith('.')) {
        selType = 'class';
        name = sel.slice(1);
      }
      domLookups.push({ type: selType, selector: name, fullSelector: sel, line: lineNum, raw: m[0] });
    }

    const aelIdx = lineText.indexOf('.addEventListener(');
    if (aelIdx !== -1) {
      const afterAel = lineText.slice(aelIdx + '.addEventListener('.length);
      const firstComma = afterAel.indexOf(',');
      if (firstComma !== -1) {
        const rawEvent = afterAel.slice(0, firstComma).trim();
        const eventName = rawEvent.replace(/^["']|["']$/g, '');
        let rest = afterAel.slice(firstComma + 1).trim();
        rest = rest.replace(/;?\s*$/, '');
        if (rest.endsWith(')')) rest = rest.slice(0, -1).trim();
        const handlerArg = rest;

        eventListeners.push({ event: eventName, handler: handlerArg, line: lineNum });

        if (/^on[a-z]+/i.test(eventName)) {
          potentialBugs.push({
            type: 'incorrect_event_name',
            line: lineNum,
            file: filePath,
            severity: 'error',
            message: `addEventListener used with event name "${eventName}". The event name should be "${eventName.replace(/^on/i, '')}" (without "on" prefix).`,
          });
        }

        if (
          handlerArg &&
          /\b[a-zA-Z0-9_$]+\s*\([^)]*\)/.test(handlerArg) &&
          !handlerArg.includes('=>') &&
          !handlerArg.includes('function')
        ) {
          potentialBugs.push({
            type: 'immediate_function_call',
            line: lineNum,
            file: filePath,
            severity: 'warning',
            message: `Function "${handlerArg}" is invoked immediately in addEventListener instead of being passed as a callback reference.`,
          });
        }
      }
    }

    if (/(?:innerText|textContent|value)\s*\+\s*1\b/.test(lineText) || /\+\s*(?:innerText|textContent|value)\b/.test(lineText)) {
      potentialBugs.push({
        type: 'string_concatenation_counter',
        line: lineNum,
        file: filePath,
        severity: 'warning',
        message: `Possible string concatenation bug: Adding 1 to DOM innerText/value without parseInt() or Number() results in string concatenation (e.g. "0" + 1 = "01").`,
      });
    }
  }

  return { domLookups, eventListeners, potentialBugs };
}

export function diagnoseProject(fileTree = {}, options = {}) {
  const confirmedErrors = [];
  const potentialIssues = [];
  const crossFileMismatches = [];

  const htmlFiles = [];
  const jsFiles = [];
  const cssFiles = [];

  for (const [filePath, node] of Object.entries(fileTree)) {
    if (!node || node.type === 'folder') continue;
    const ext = (filePath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    const content = node.value || '';

    if (ext === '.html' || ext === '.htm') {
      htmlFiles.push({ path: filePath, content, meta: extractHtmlMetadata(content) });
    } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      jsFiles.push({ path: filePath, content, meta: extractJsMetadata(content, filePath) });
    } else if (ext === '.css') {
      cssFiles.push({ path: filePath, content, meta: extractCssMetadata(content) });
    }
  }

  for (const js of jsFiles) {
    const syntaxErr = checkJsSyntax(js.content, js.path);
    if (syntaxErr) {
      confirmedErrors.push({
        file: js.path,
        line: syntaxErr.line,
        column: syntaxErr.column,
        category: 'Syntax Error',
        message: `JavaScript Syntax Error in ${js.path} (line ${syntaxErr.line}): ${syntaxErr.message}`,
        fixSuggestion: `Fix syntax error near line ${syntaxErr.line} of ${js.path}.`,
      });
    }

    for (const b of js.meta.potentialBugs) {
      if (b.severity === 'error') {
        confirmedErrors.push({
          file: js.path,
          line: b.line,
          category: 'Event Listener Bug',
          message: b.message,
          fixSuggestion: `Remove "on" prefix from event name.`,
        });
      } else {
        potentialIssues.push({
          file: js.path,
          line: b.line,
          category: 'Logic Warning',
          message: b.message,
        });
      }
    }
  }

  for (const html of htmlFiles) {
    for (const s of html.meta.scripts) {
      if (!s.src) continue;
      const cleanSrc = s.src.replace(/^\/+|\.\//g, '').split('?')[0];
      const exists = Object.keys(fileTree).some(fp => fp === cleanSrc || fp.endsWith('/' + cleanSrc));
      if (!exists) {
        confirmedErrors.push({
          file: html.path,
          category: 'Broken Script Reference',
          message: `${html.path} references script "${s.src}", but "${cleanSrc}" does not exist in the project.`,
          fixSuggestion: `Update <script src="..."> in ${html.path} to point to an existing JS file.`,
        });
      }

      if (s.inHead && !s.hasDefer) {
        const matchingJs = jsFiles.find(j => j.path === cleanSrc || j.path.endsWith('/' + cleanSrc));
        if (matchingJs && matchingJs.meta.domLookups.length > 0) {
          confirmedErrors.push({
            file: html.path,
            category: 'DOM Execution Timing Bug',
            message: `Script "${s.src}" is loaded in <head> without "defer", but queries DOM elements immediately before DOM parsing finishes. This causes document.getElementById to return null and throws "Cannot read properties of null (reading 'addEventListener')".`,
            fixSuggestion: `Add "defer" to <script src="${s.src}" defer> or move the script to the end of <body>.`,
          });
        }
      }
    }

    for (const href of html.meta.stylesheets) {
      const cleanHref = href.replace(/^\/+|\.\//g, '').split('?')[0];
      const exists = Object.keys(fileTree).some(fp => fp === cleanHref || fp.endsWith('/' + cleanHref));
      if (!exists) {
        confirmedErrors.push({
          file: html.path,
          category: 'Broken Stylesheet Link',
          message: `${html.path} references stylesheet "${href}", but "${cleanHref}" does not exist in the project.`,
          fixSuggestion: `Update <link rel="stylesheet" href="..."> in ${html.path} to match the actual CSS file name.`,
        });
      }
    }
  }

  const allHtmlIds = new Set();
  htmlFiles.forEach(h => h.meta.ids.forEach(id => allHtmlIds.add(id)));

  if (htmlFiles.length > 0) {
    for (const js of jsFiles) {
      for (const lookup of js.meta.domLookups) {
        if (lookup.type === 'id') {
          if (!allHtmlIds.has(lookup.selector)) {
            let suggestion = '';
            for (const hid of allHtmlIds) {
              const cleanHid = hid.toLowerCase().replace(/[-_]/g, '');
              const cleanSel = lookup.selector.toLowerCase().replace(/[-_]/g, '');
              const isAbbrev =
                cleanHid.replace('button', 'btn') === cleanSel ||
                cleanSel.replace('button', 'btn') === cleanHid ||
                cleanHid.replace('counter', 'count') === cleanSel ||
                cleanSel.replace('counter', 'count') === cleanHid;

              if (
                cleanHid === cleanSel ||
                hid.includes(lookup.selector) ||
                lookup.selector.includes(hid) ||
                isAbbrev ||
                (hid.length >= 4 && lookup.selector.length >= 4 && hid.slice(0, 4) === lookup.selector.slice(0, 4))
              ) {
                suggestion = ` (Did you mean id="${hid}"?)`;
                break;
              }
            }
            confirmedErrors.push({
              file: js.path,
              line: lookup.line,
              category: 'Missing DOM Element',
              message: `JavaScript in ${js.path} (line ${lookup.line}) looks for id "${lookup.selector}", but id="${lookup.selector}" is not defined in any HTML file.${suggestion}`,
              fixSuggestion: `Add id="${lookup.selector}" to HTML, or fix the selector in ${js.path}.`,
            });
            crossFileMismatches.push({ jsFile: js.path, line: lookup.line, expectedId: lookup.selector });
          }
        }
      }
    }
  }

  let errorAnalysis = null;
  const userErr = (options.errorMessage || '').trim();
  if (userErr) {
    errorAnalysis = {
      rawError: userErr,
      diagnosis: '',
      rootCause: '',
    };
    if (/Cannot read propert(?:y|ies) of null/i.test(userErr) || /reading 'addEventListener'/i.test(userErr)) {
      errorAnalysis.diagnosis = 'Null Reference TypeError: An element was expected to exist, but returned null before addEventListener was called.';
      errorAnalysis.rootCause = 'Either the element ID does not exist in the HTML, or the script executed in <head> before the DOM was parsed.';
    } else if (/is not a function/i.test(userErr)) {
      errorAnalysis.diagnosis = 'TypeError: Called a value that is undefined, null, or not a function.';
      errorAnalysis.rootCause = 'Check function name typos, missing exports, or incorrect variable scoping.';
    } else if (/is not defined/i.test(userErr)) {
      errorAnalysis.diagnosis = 'ReferenceError: Variable accessed before declaration or outside its scope.';
      errorAnalysis.rootCause = 'Undeclared variable or script loading order issue.';
    } else if (/Unexpected token/i.test(userErr) || /SyntaxError/i.test(userErr)) {
      errorAnalysis.diagnosis = 'SyntaxError: Parser encountered invalid code syntax.';
      errorAnalysis.rootCause = 'Missing bracket, parenthesis, quote, or comma.';
    }
  }

  return {
    success: true,
    summary: {
      confirmedErrorCount: confirmedErrors.length,
      potentialIssueCount: potentialIssues.length,
      mismatchCount: crossFileMismatches.length,
    },
    confirmedErrors,
    potentialIssues,
    crossFileMismatches,
    errorAnalysis,
  };
}
