const http = require('http');

function login() {
  return new Promise(function(resolve) {
    const body = JSON.stringify({ username: 'owner', password: 'Owner@12345' });
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        const cookies = (res.headers['set-cookie'] || []).map(function(c) { return c.split(';')[0]; }).join('; ');
        resolve({ cookies: cookies, body: JSON.parse(d) });
      });
    });
    req.write(body); req.end();
  });
}

async function run() {
  const { cookies } = await login();
  console.log('Session established, cookie len:', cookies.length);

  // Try templates API with same cookies
  const r = await new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/templates?pageSize=100', method: 'GET', headers: { 'Cookie': cookies } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        try { resolve({ s: res.statusCode, d: JSON.parse(d) }); }
        catch(e) { resolve({ s: res.statusCode, d: d }); }
      });
    });
    req.end();
  });

  console.log('Status:', r.s);
  if (r.d && typeof r.d === 'object' && r.d.success) {
    console.log('Success! Found', r.d.data?.data?.length, 'templates');
    r.d.data?.data?.forEach(function(t) {
      console.log(' -', t.type, '-', t.name, '-', t.status);
    });
  } else {
    console.log('API response:', JSON.stringify(r.d).slice(0, 300));
  }

  // Also try rooms API to confirm cookies work for other APIs
  const r2 = await new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/rooms?pageSize=2', method: 'GET', headers: { 'Cookie': cookies } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        try { resolve({ s: res.statusCode, d: JSON.parse(d) }); }
        catch(e) { resolve({ s: res.statusCode, d: d.slice(0, 100) }); }
      });
    });
    req.end();
  });
  console.log('\nRooms API:', r2.s, r2.d?.data?.data?.length ? 'OK' : 'FAIL');
}

run().catch(function(e) { console.error(e.message); });