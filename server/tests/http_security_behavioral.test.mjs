import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3001';

test('Behavioral HTTP Security: Execute API strictly enforces payload caps and type bounds', async (t) => {
  await t.test('Oversized source code (>100KB) is rejected with HTTP 400', async () => {
    const oversized = 'console.log("x");\n'.repeat(6000); // ~108 KB
    const res = await fetch(`${BASE_URL}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'javascript',
        sourceCode: oversized,
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.run.output.includes('maximum allowed size (100 KB)'));
  });

  await t.test('Missing or non-string language is rejected with HTTP 400', async () => {
    const res = await fetch(`${BASE_URL}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceCode: 'console.log(1);',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.run.output.includes('Missing or invalid language'));
  });

  await t.test('Unsupported language is rejected with HTTP 400', async () => {
    const res = await fetch(`${BASE_URL}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'brainfuck',
        sourceCode: '++++',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.run.output.includes('not supported'));
  });
});

test('Behavioral HTTP Security: Auth API strictly enforces string sanitization and NoSQL protection', async (t) => {
  await t.test('NoSQL injection object in email field is rejected with HTTP 400', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-client-ip': '10.99.1.1',
      },
      body: JSON.stringify({
        username: 'validUser',
        email: { $ne: null },
        password: 'validPassword123',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('must be valid strings'));
  });

  await t.test('Password shorter than 6 characters is rejected with HTTP 400', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-client-ip': '10.99.1.2',
      },
      body: JSON.stringify({
        username: 'validUser2',
        email: 'test@example.com',
        password: '123',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('between 6 and 72 characters'));
  });

  await t.test('Rate Limiter triggers HTTP 429 when threshold exceeded', async () => {
    const rateLimitIp = '10.99.1.99';
    const attempts = [];
    for (let i = 0; i < 20; i++) {
      attempts.push(
        fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-client-ip': rateLimitIp,
          },
          body: JSON.stringify({
            email: `test_rate_limit_${i}@example.com`,
            password: 'testpassword123',
          }),
        })
      );
    }

    const responses = await Promise.all(attempts);
    const rateLimitedResponses = responses.filter(r => r.status === 429);

    assert.ok(rateLimitedResponses.length > 0, 'Rate limiter must return HTTP 429 after 15 requests');
    const data = await rateLimitedResponses[0].json();
    assert.ok(data.message.includes('Too many authentication attempts'));
    assert.ok(data.retryAfterSeconds > 0);
  });
});
