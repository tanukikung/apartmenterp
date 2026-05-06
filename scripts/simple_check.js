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
  console.log('Session OK, cookie len:', cookies.length);

  // Test templates API
  const r1 = await new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/templates?pageSize=100', method: 'GET', headers: { 'Cookie': cookies } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        try { resolve({ s: res.statusCode, d: JSON.parse(d) }); }
        catch(e) { resolve({ s: res.statusCode, d: d.slice(0, 200) }); }
      });
    });
    req.end();
  });
  console.log('Templates API:', r1.s, r1.d?.success, '| count:', r1.d?.data?.data?.length);
  if (r1.d?.data?.data) {
    r1.d.data.data.forEach(function(t) { console.log(' ', t.type, t.name.slice(0, 20)); });
  }

  // Test rooms API
  const r2 = await new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/rooms?pageSize=2', method: 'GET', headers: { 'Cookie': cookies } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        try { resolve({ s: res.statusCode, d: JSON.parse(d) }); }
        catch(e) { resolve({ s: res.statusCode, d: d.slice(0, 100) }); }
      });
    });
    req.end();
  });
  console.log('Rooms API:', r2.s, r2.d?.data?.data?.length);
}

run().catch(function(e) { console.error(e.message); });