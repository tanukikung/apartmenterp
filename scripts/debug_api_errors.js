/**
 * Test script to reproduce API errors
 */

const BASE_URL = 'http://localhost:3001';

async function testApiError(apiPath, method = 'GET', body = null) {
  try {
    // Login first
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'Owner@12345' }),
    });
    const loginData = await loginRes.json();
    const sessionToken = loginData.data?.sessionToken || loginData.data?.token;
    const cookieHeader = loginRes.headers.get('set-cookie');

    console.log(`\n=== Testing ${method} ${apiPath} ===`);
    console.log('Login result:', loginRes.status, JSON.stringify(loginData).substring(0, 200));

    // Now call the API with auth
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (cookieHeader) {
      // Parse cookies from set-cookie header
      options.headers['Cookie'] = cookieHeader.split(',')[0].trim();
    }

    if (sessionToken) {
      options.headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE_URL}${apiPath}`, options);
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${text.substring(0, 500)}`);

    // Check for P2010 or database errors in response
    if (text.includes('P2010')) {
      console.log('*** FOUND P2010 ERROR ***');
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
  }
}

async function run() {
  await testApiError('/api/admin/system-health/alerts');
  await testApiError('/api/rooms/fix-status');
  await testApiError('/api/rooms/fix-status', 'POST');
  await testApiError('/api/financial-audit?entityType=ROOM');
  await testApiError('/api/search?q=room');
  await testApiError('/api/reports/profit-loss?year=2026&month=4');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
