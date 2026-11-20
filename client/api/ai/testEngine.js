/**
 * client/api/ai/testEngine.js
 *
 * Deterministic testing, test planning, and validation engine for CollabCode AI Agent (Phase 4).
 * Vercel Serverless ESM module.
 */

export function extractDomFeatures(html = '') {
  const forms = [];
  const inputs = [];
  const buttons = [];

  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let formMatch;
  while ((formMatch = formRegex.exec(html)) !== null) {
    const attrs = formMatch[1];
    const body = formMatch[2];
    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const id = idMatch ? idMatch[1] : null;

    const formInputRegex = /<input\b([^>]*)>/gi;
    let inputMatch;
    const formInputs = [];
    while ((inputMatch = formInputRegex.exec(body)) !== null) {
      const iAttrs = inputMatch[1];
      const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(iAttrs);
      const nameMatch = /\bname\s*=\s*["']([^"']+)["']/i.exec(iAttrs);
      const iIdMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(iAttrs);
      const required = /\brequired\b/i.test(iAttrs);
      const minLengthMatch = /\bminlength\s*=\s*["']?(\d+)["']?/i.exec(iAttrs);
      const patternMatch = /\bpattern\s*=\s*["']([^"']+)["']/i.exec(iAttrs);

      formInputs.push({
        id: iIdMatch ? iIdMatch[1] : null,
        name: nameMatch ? nameMatch[1] : null,
        type: typeMatch ? typeMatch[1].toLowerCase() : 'text',
        required,
        minLength: minLengthMatch ? parseInt(minLengthMatch[1], 10) : null,
        pattern: patternMatch ? patternMatch[1] : null,
      });
    }

    const formBtnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let btnMatch;
    const formButtons = [];
    while ((btnMatch = formBtnRegex.exec(body)) !== null) {
      const bAttrs = btnMatch[1];
      const bType = /\btype\s*=\s*["']([^"']+)["']/i.exec(bAttrs);
      const bId = /\bid\s*=\s*["']([^"']+)["']/i.exec(bAttrs);
      formButtons.push({
        id: bId ? bId[1] : null,
        type: bType ? bType[1].toLowerCase() : 'submit',
        text: btnMatch[2].replace(/<[^>]+>/g, '').trim(),
      });
    }

    forms.push({
      id,
      inputs: formInputs,
      buttons: formButtons,
      hasRequiredInputs: formInputs.some(i => i.required),
    });
  }

  const standaloneInputRegex = /<input\b([^>]*)>/gi;
  let sMatch;
  while ((sMatch = standaloneInputRegex.exec(html)) !== null) {
    const attrs = sMatch[1];
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const nameMatch = /\bname\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const required = /\brequired\b/i.test(attrs);

    inputs.push({
      id: idMatch ? idMatch[1] : null,
      name: nameMatch ? nameMatch[1] : null,
      type: typeMatch ? typeMatch[1].toLowerCase() : 'text',
      required,
    });
  }

  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let bMatch;
  while ((bMatch = buttonRegex.exec(html)) !== null) {
    const attrs = bMatch[1];
    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const classMatch = /\bclass\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const text = bMatch[2].replace(/<[^>]+>/g, '').trim();

    buttons.push({
      id: idMatch ? idMatch[1] : null,
      class: classMatch ? classMatch[1] : null,
      text,
    });
  }

  const hasCounterKeywords = /counter|count|increment|decrement/i.test(html);
  const hasIncrementBtn = buttons.some(b => /increment|\+|plus/i.test(b.id || '') || /increment|\+|plus/i.test(b.text || '') || /increment|\+|plus/i.test(b.class || ''));
  const hasDecrementBtn = buttons.some(b => /decrement|\-|minus/i.test(b.id || '') || /decrement|\-|minus/i.test(b.text || '') || /decrement|\-|minus/i.test(b.class || ''));
  const isCounter = hasCounterKeywords || (hasIncrementBtn && hasDecrementBtn);

  const hasCalculatorKeywords = /calc|calculator/i.test(html);
  const operatorButtons = buttons.filter(b => /[\+\-\*\/=]/.test(b.text || '') || /add|sub|mul|div|equal/i.test(b.id || ''));
  const digitButtons = buttons.filter(b => /^[0-9]$/.test(b.text?.trim() || ''));
  const isCalculator = hasCalculatorKeywords || (operatorButtons.length >= 3 && digitButtons.length >= 5);

  const isLoginForm = forms.some(f => {
    const hasPassword = f.inputs.some(i => i.type === 'password' || /pass/i.test(i.id || '') || /pass/i.test(i.name || ''));
    const hasEmailOrUser = f.inputs.some(i => i.type === 'email' || /user|email/i.test(i.id || '') || /user|email/i.test(i.name || ''));
    return hasPassword && hasEmailOrUser;
  }) || inputs.some(i => i.type === 'password');

  return {
    forms,
    inputs,
    buttons,
    features: {
      isLoginForm,
      isCounter,
      isCalculator,
    },
  };
}

export function analyzeJsValidation(jsCode = '') {
  const analysis = {
    hasFormSubmitHandler: false,
    hasEventPreventDefault: false,
    validatesEmptyInputs: false,
    emptyInputCheckDetails: [],
    validatesEmailFormat: false,
    validatesPasswordLength: false,
    handlesCounterStringConcatenation: false,
    counterHasConcatBug: false,
    counterInitialParsedAsNumber: false,
    handlesCalculatorDivisionByZero: false,
    calculatorHandlesDecimals: false,
    calculatorHandlesConsecutiveOperators: false,
    calculatorHandlesNegativeNumbers: false,
  };

  if (!jsCode || typeof jsCode !== 'string') return analysis;

  if (/addEventListener\s*\(\s*["']submit["']/i.test(jsCode) || /onsubmit\s*=/i.test(jsCode)) {
    analysis.hasFormSubmitHandler = true;
  }
  if (/\.preventDefault\s*\(\s*\)/i.test(jsCode)) {
    analysis.hasEventPreventDefault = true;
  }

  const emptyCheckRegex = /(?:!\s*\w+(?:\.value)?(?:\.trim\(\))?|\w+(?:\.value)?(?:\.trim\(\))?\s*===?\s*["']["']|\w+(?:\.value)?\.length\s*===?\s*0)/g;
  if (emptyCheckRegex.test(jsCode)) {
    if (/alert|error|return\b|display\s*=|classList\.add/i.test(jsCode)) {
      analysis.validatesEmptyInputs = true;
    }
  }

  const checksOnlyWithoutTrim = /value\s*===?\s*["']["']/i.test(jsCode) && !/\.trim\(\)/i.test(jsCode);
  if (checksOnlyWithoutTrim) {
    analysis.emptyInputCheckDetails.push('Checks for empty string but does not call .trim(), allowing whitespace-only inputs to bypass validation.');
  }

  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(jsCode) || /\.includes\s*\(\s*["']@["']\s*\)/i.test(jsCode) || /type\s*===?\s*["']email["']/i.test(jsCode)) {
    analysis.validatesEmailFormat = true;
  }

  if (/(?:password|pass|pwd)\w*(?:\.value)?\.length\s*[<>]=?\s*\d+/i.test(jsCode)) {
    analysis.validatesPasswordLength = true;
  }

  const hasCounterOperations = /count\s*\+\+|count\s*\-\-|\+\+\s*count|\-\-\s*count|count\s*\+=\s*1|count\s*\-=\s*1/i.test(jsCode);
  const readsFromDomWithoutParse = /(?:innerText|textContent|innerHTML|value)\s*\+\s*1/i.test(jsCode) ||
    /let\s+count\s*=\s*(?:document\.)?[a-zA-Z0-9_$.]+\.(?:innerText|textContent|innerHTML|value)\s*;/i.test(jsCode) ||
    /(?:count|display)\.textContent\s*=\s*(?:count|display)\.textContent\s*\+\s*1/i.test(jsCode);

  const usesNumericParse = /parseInt\s*\(|parseFloat\s*\(|Number\s*\(|\+\s*\w+\.(?:innerText|textContent|value)/i.test(jsCode);

  if (readsFromDomWithoutParse && !usesNumericParse) {
    analysis.counterHasConcatBug = true;
  }

  if (hasCounterOperations || usesNumericParse) {
    analysis.counterInitialParsedAsNumber = true;
  }

  const handlesDivZero = /(?:\/\s*0|===?\s*0|===?\s*['"]0['"])\s*(?:&&|\|\||\?|return|alert|error)/i.test(jsCode) ||
    /if\s*\([^)]*(?:===?\s*0|===?\s*['"]0['"])[^)]*\/(?:\s*\w+)?\)/i.test(jsCode) ||
    /divisor\s*===?\s*0/i.test(jsCode) ||
    /operator\s*===?\s*['"]\/['"]\s*&&\s*(?:\w+\s*===?\s*0|\w+\s*===?\s*['"]0['"])/i.test(jsCode);

  if (handlesDivZero) {
    analysis.handlesCalculatorDivisionByZero = true;
  }

  const handlesMultipleDecimals = /\.includes\s*\(\s*['"]\.['"]\s*\)/i.test(jsCode) ||
    /indexOf\s*\(\s*['"]\.['"]\s*\)\s*!=\s*-1/i.test(jsCode) ||
    /alreadyHasDecimal|hasDot|decimalAdded/i.test(jsCode);
  if (handlesMultipleDecimals) {
    analysis.calculatorHandlesDecimals = true;
  }

  const handlesConsecutiveOps = /isOperator|lastChar|replace\s*\(\s*\/[+\-*/]\$\/|replace\s*\(\s*\/[+\-*/]+\$\//i.test(jsCode);
  if (handlesConsecutiveOps) {
    analysis.calculatorHandlesConsecutiveOperators = true;
  }

  const handlesNegatives = /negative|toggleSign|startsWith\s*\(\s*['"]-['"]\s*\)|-\s*value/i.test(jsCode);
  if (handlesNegatives) {
    analysis.calculatorHandlesNegativeNumbers = true;
  }

  return analysis;
}

export function generateTestPlan(fileTree = {}, options = {}) {
  const htmlFiles = Object.entries(fileTree).filter(([k, v]) => k.endsWith('.html') && v.type === 'file');
  const jsFiles = Object.entries(fileTree).filter(([k, v]) => (k.endsWith('.js') || k.endsWith('.jsx')) && v.type === 'file');

  const combinedHtml = htmlFiles.map(([, v]) => v.value || '').join('\n');
  const combinedJs = jsFiles.map(([, v]) => v.value || '').join('\n');

  const dom = extractDomFeatures(combinedHtml);
  const jsAnalysis = analyzeJsValidation(combinedJs);

  const testCases = [];
  const checklist = [];
  const missingScenarios = [];
  const featuresDetected = [];

  if (dom.features.isLoginForm || dom.forms.length > 0) {
    featuresDetected.push('Login / Form Submission');

    checklist.push({
      item: 'Form Input Validation & Submission Prevention',
      description: 'Ensure form validates required fields and does not submit or reload page when inputs are blank or invalid.',
    });
    checklist.push({
      item: 'Email Format & Credential Constraints',
      description: 'Ensure invalid email addresses and passwords violating constraints display clear error feedback.',
    });

    testCases.push({
      id: 'TC-LOGIN-001',
      feature: 'Login Form',
      type: 'normal',
      name: 'Valid credentials submission',
      description: 'Submit the form with properly formatted email/username and valid password.',
      inputData: { email: 'user@example.com', password: 'ValidPassword123!' },
      expectedResult: 'Form submission succeeds; success message displayed or user redirected; no validation errors shown.',
      status: 'not_tested',
      manualSteps: [
        '1. Open Preview.',
        '2. Enter "user@example.com" into the email/username field.',
        '3. Enter "ValidPassword123!" into the password field.',
        '4. Click the Submit / Login button.',
        '5. Verify the form submits successfully without error messages.',
      ],
    });

    testCases.push({
      id: 'TC-LOGIN-002',
      feature: 'Login Form',
      type: 'invalid_input',
      name: 'Malformed email address validation',
      description: 'Submit the form with an invalid email format missing @ or domain.',
      inputData: { email: 'not-an-email', password: 'ValidPassword123!' },
      expectedResult: 'Form prevents submission; displays validation error indicating email is invalid.',
      status: 'not_tested',
      manualSteps: [
        '1. Open Preview.',
        '2. Enter "not-an-email" into the email field.',
        '3. Enter a valid password.',
        '4. Click Submit / Login.',
        '5. Verify submission is blocked and an email error is visible.',
      ],
    });

    const emptyCheckFailed = !jsAnalysis.validatesEmptyInputs && !dom.forms.some(f => f.hasRequiredInputs);
    testCases.push({
      id: 'TC-LOGIN-003',
      feature: 'Login Form',
      type: 'edge_case',
      name: 'Empty inputs & whitespace-only validation',
      description: 'Submit the form with empty or whitespace-only inputs ("   ").',
      inputData: { email: '   ', password: '' },
      expectedResult: 'Form blocks submission, highlights empty fields, and displays "Please fill in all required fields".',
      status: emptyCheckFailed ? 'failed' : 'not_tested',
      actualResult: emptyCheckFailed ? 'Form handler allows empty submission or lacks explicit empty/whitespace validation.' : null,
      errorDetails: emptyCheckFailed ? 'Missing validation for empty inputs: no check for empty string or !input.value.trim() in submit handler.' : null,
      manualSteps: [
        '1. Open Preview.',
        '2. Leave username and password empty, or enter only spaces.',
        '3. Click Submit.',
        '4. Observe whether form submits or displays an error.',
      ],
    });

    if (emptyCheckFailed) {
      missingScenarios.push({
        feature: 'Login Form',
        issue: 'Missing validation for empty inputs',
        recommendation: 'Add checks for !email.trim() and !password.trim() inside the submit event listener, call e.preventDefault(), and render an error message.',
      });
    }
  }

  if (dom.features.isCounter) {
    featuresDetected.push('JavaScript Counter');

    checklist.push({
      item: 'Numeric Arithmetic & Concatenation Guard',
      description: 'Ensure increment and decrement perform numeric addition/subtraction rather than string concatenation ("0" + 1 = "01").',
    });
    checklist.push({
      item: 'Boundary Conditions (Zero & Negatives)',
      description: 'Verify behavior when decrementing below zero and resetting back to initial value.',
    });

    testCases.push({
      id: 'TC-COUNT-001',
      feature: 'Counter',
      type: 'normal',
      name: 'Increment counter by 1',
      description: 'Click the increment button once from the initial state (0).',
      inputData: { initial: 0, action: 'increment' },
      expectedResult: 'Counter display updates from 0 to 1.',
      status: jsAnalysis.counterHasConcatBug ? 'failed' : 'not_tested',
      actualResult: jsAnalysis.counterHasConcatBug ? '"01" (String concatenation occurred instead of numeric addition)' : null,
      errorDetails: jsAnalysis.counterHasConcatBug ? 'Counter value read as string without parseInt() or Number() before adding 1.' : null,
      manualSteps: [
        '1. Open Preview.',
        '2. Check initial count is 0.',
        '3. Click "+1" / "Increment".',
        '4. Verify count becomes 1 (not "01").',
      ],
    });

    testCases.push({
      id: 'TC-COUNT-002',
      feature: 'Counter',
      type: 'normal',
      name: 'Decrement counter by 1',
      description: 'Click decrement button when counter is at 1.',
      inputData: { initial: 1, action: 'decrement' },
      expectedResult: 'Counter display updates from 1 to 0.',
      status: 'not_tested',
      manualSteps: [
        '1. Click "+1" so count is 1.',
        '2. Click "-1" / "Decrement".',
        '3. Verify count returns to 0.',
      ],
    });

    testCases.push({
      id: 'TC-COUNT-003',
      feature: 'Counter',
      type: 'edge_case',
      name: 'Multiple increments and type consistency',
      description: 'Click increment 5 times sequentially to verify numeric accumulation.',
      inputData: { initial: 0, action: 'increment x 5' },
      expectedResult: 'Counter display displays 5 (numeric sum), not "011111".',
      status: jsAnalysis.counterHasConcatBug ? 'failed' : 'not_tested',
      actualResult: jsAnalysis.counterHasConcatBug ? '"011111"' : null,
      errorDetails: jsAnalysis.counterHasConcatBug ? 'Type bug: string concatenation repeatedly appends "1".' : null,
      manualSteps: [
        '1. Click increment button 5 times.',
        '2. Verify display reads 5.',
      ],
    });

    testCases.push({
      id: 'TC-COUNT-004',
      feature: 'Counter',
      type: 'edge_case',
      name: 'Decrement below zero',
      description: 'Click decrement when counter is at 0 to test negative number handling or lower bound.',
      inputData: { initial: 0, action: 'decrement' },
      expectedResult: 'Counter gracefully transitions to -1 (or remains at 0 if min bound enforced).',
      status: 'not_tested',
      manualSteps: [
        '1. Ensure counter is 0.',
        '2. Click decrement.',
        '3. Verify counter shows -1 (or cleanly stops at 0 if bounded).',
      ],
    });

    if (jsAnalysis.counterHasConcatBug) {
      missingScenarios.push({
        feature: 'Counter',
        issue: 'Counter uses string concatenation instead of numeric addition',
        recommendation: 'Wrap DOM reading in parseInt(element.textContent, 10) or maintain a numeric variable `let count = 0;` in JavaScript.',
      });
    }
  }

  if (dom.features.isCalculator) {
    featuresDetected.push('Calculator');

    checklist.push({
      item: 'Division by Zero Guard',
      description: 'Ensure dividing any number by zero displays "Error" or "Cannot divide by zero" rather than Infinity or crashing.',
    });
    checklist.push({
      item: 'Decimal Precision & Multiple Dot Prevention',
      description: 'Ensure entering multiple decimal points in a single number (e.g. "3.14.15") is disallowed.',
    });
    checklist.push({
      item: 'Consecutive Operator Chaining',
      description: 'Ensure pressing operators sequentially (e.g. "5 + * 2") replaces the previous operator rather than creating syntax errors.',
    });
    checklist.push({
      item: 'Negative Numbers & Sign Inversion',
      description: 'Ensure operations with negative numbers calculate correctly.',
    });

    testCases.push({
      id: 'TC-CALC-001',
      feature: 'Calculator',
      type: 'normal',
      name: 'Basic addition (7 + 3)',
      description: 'Perform standard addition of two single digit numbers.',
      inputData: { expression: '7 + 3 =' },
      expectedResult: 'Display shows "10".',
      status: 'not_tested',
      manualSteps: [
        '1. Click 7.',
        '2. Click +.',
        '3. Click 3.',
        '4. Click =.',
        '5. Verify display is 10.',
      ],
    });

    const divZeroFailed = !jsAnalysis.handlesCalculatorDivisionByZero;
    testCases.push({
      id: 'TC-CALC-002',
      feature: 'Calculator',
      type: 'edge_case',
      name: 'Division by zero (10 / 0)',
      description: 'Attempt to divide a positive number by zero.',
      inputData: { expression: '10 / 0 =' },
      expectedResult: 'Display shows "Error" or "Cannot divide by zero"; does not display "Infinity" or unhandled NaN.',
      status: divZeroFailed ? 'failed' : 'not_tested',
      actualResult: divZeroFailed ? '"Infinity"' : null,
      errorDetails: divZeroFailed ? 'Calculator does not check if divisor is zero before performing division.' : null,
      manualSteps: [
        '1. Click 1, 0.',
        '2. Click /.',
        '3. Click 0.',
        '4. Click =.',
        '5. Verify display shows "Error" or user-friendly message rather than "Infinity".',
      ],
    });

    const decimalFailed = !jsAnalysis.calculatorHandlesDecimals;
    testCases.push({
      id: 'TC-CALC-003',
      feature: 'Calculator',
      type: 'invalid_input',
      name: 'Multiple decimal points in single operand ("3.14.15")',
      description: 'Attempt to enter multiple decimal points in a single number.',
      inputData: { input: '3 . 1 4 . 1 5' },
      expectedResult: 'Second decimal point is ignored; display shows "3.1415".',
      status: decimalFailed ? 'failed' : 'not_tested',
      actualResult: decimalFailed ? 'Allows multiple decimal points creating invalid numbers.' : null,
      errorDetails: decimalFailed ? 'No check to prevent multiple "." in current operand.' : null,
      manualSteps: [
        '1. Click 3, then "."',
        '2. Click 1, 4.',
        '3. Click "." again.',
        '4. Verify second "." is blocked and not appended.',
      ],
    });

    testCases.push({
      id: 'TC-CALC-004',
      feature: 'Calculator',
      type: 'edge_case',
      name: 'Consecutive operator input ("5 + * 2")',
      description: 'Press multiple operators consecutively without intervening digits.',
      inputData: { sequence: '5 + * 2 =' },
      expectedResult: 'Last pressed operator replaces the previous one (computes 5 * 2 = 10) without crashing or NaN.',
      status: 'not_tested',
      manualSteps: [
        '1. Click 5.',
        '2. Click +.',
        '3. Click * immediately.',
        '4. Click 2, then =.',
        '5. Verify result is 10.',
      ],
    });

    testCases.push({
      id: 'TC-CALC-005',
      feature: 'Calculator',
      type: 'edge_case',
      name: 'Negative number computation (-5 + 12)',
      description: 'Calculate expression involving negative numbers.',
      inputData: { expression: '-5 + 12 =' },
      expectedResult: 'Display shows "7".',
      status: 'not_tested',
      manualSteps: [
        '1. Input -5 (via +/- button or minus prefix).',
        '2. Click +.',
        '3. Click 1, 2.',
        '4. Click =.',
        '5. Verify result is 7.',
      ],
    });

    if (divZeroFailed) {
      missingScenarios.push({
        feature: 'Calculator',
        issue: 'Division by zero is not handled',
        recommendation: 'Check if divisor === 0 (or "0") when dividing and return "Error" or alert user.',
      });
    }
  }

  if (testCases.length === 0) {
    featuresDetected.push('General HTML/JS UI');

    checklist.push({
      item: 'DOM Element Rendering & Event Binding',
      description: 'Verify all interactive elements and buttons trigger their associated handlers without console errors.',
    });

    testCases.push({
      id: 'TC-GEN-001',
      feature: 'UI Interaction',
      type: 'normal',
      name: 'Primary UI interactive elements',
      description: 'Interact with available buttons and inputs in the project.',
      inputData: {},
      expectedResult: 'Elements respond without unhandled runtime exceptions.',
      status: 'not_tested',
      manualSteps: [
        '1. Open Live Preview.',
        '2. Click through interactive buttons and links.',
        '3. Check browser console for errors.',
      ],
    });
  }

  return {
    success: true,
    featuresDetected,
    checklist,
    testCases,
    missingScenarios,
    summary: {
      total: testCases.length,
      normalCount: testCases.filter(t => t.type === 'normal').length,
      edgeCaseCount: testCases.filter(t => t.type === 'edge_case').length,
      invalidInputCount: testCases.filter(t => t.type === 'invalid_input').length,
      failedContractCount: testCases.filter(t => t.status === 'failed').length,
    },
  };
}

export function runProjectTests(fileTree = {}, options = {}) {
  const plan = generateTestPlan(fileTree, options);
  const testResults = [];

  for (const tc of plan.testCases) {
    if (tc.status === 'failed') {
      testResults.push({
        id: tc.id,
        name: tc.name,
        feature: tc.feature,
        type: tc.type,
        status: 'failed',
        expected: tc.expectedResult,
        actual: tc.actualResult || 'Contract validation failed.',
        errorDetails: tc.errorDetails || 'Validation failed during contract inspection.',
        manualSteps: tc.manualSteps,
      });
    } else {
      testResults.push({
        id: tc.id,
        name: tc.name,
        feature: tc.feature,
        type: tc.type,
        status: 'not_tested',
        expected: tc.expectedResult,
        actual: 'Not yet executed in browser preview environment.',
        errorDetails: null,
        manualSteps: tc.manualSteps,
      });
    }
  }

  const passed = testResults.filter(r => r.status === 'passed').length;
  const failed = testResults.filter(r => r.status === 'failed').length;
  const notTested = testResults.filter(r => r.status === 'not_tested').length;

  return {
    success: true,
    summary: {
      total: testResults.length,
      passed,
      failed,
      notTested,
    },
    results: testResults,
    featuresDetected: plan.featuresDetected,
    missingScenarios: plan.missingScenarios,
    checklist: plan.checklist,
    recommendation: failed > 0
      ? `Found ${failed} failing test scenario(s). Inspect the failed tests and use propose_file_edit to apply fixes with user approval.`
      : 'All contract checks passed. Execute remaining manual tests in Live Preview to confirm visual behavior.',
  };
}
