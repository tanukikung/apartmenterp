/**
 * Precise debug script - get the actual error stack trace
 */
const BASE_URL = 'http://localhost:3001';

async function testWithFullError(apiPath, method = 'GET') {
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'Owner@12345' }),
  });
  const loginData = await loginRes.json();
  const cookie = loginRes.headers.get('set-cookie');

  console.log(`\n=== ${method} ${apiPath} ===`);

  const res = await fetch(`${BASE_URL}${apiPath}`, {
    method,
    headers: { 'Cookie': cookie?.split(',')[0].trim() || '' },
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Body: ${text}`);
}

async function run() {
  // First check if the issue is with the SQL query in rooms/fix-status
  // Try a simpler query that should work
  await testWithFullError('/api/admin/system-health/alerts');
  await testWithFullError('/api/rooms/fix-status');

  // Check rooms API works fine
  await testWithFullError('/api/rooms');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
