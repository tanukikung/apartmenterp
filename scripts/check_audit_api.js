const http = require('http');

function postReq(path, data, cookie) {
  return new Promise(function(resolve) {
    const body = JSON.stringify(data);
    const req = http.request({ hostname: 'localhost', port: 3001, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Cookie': cookie || '' } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        resolve({ s: res.statusCode, d: JSON.parse(d), cookies: res.headers['set-cookie'] });
      });
    });
    req.write(body); req.end();
  });
}

function getReq(path, cookie) {
  return new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path, method: 'GET', headers: { 'Cookie': cookie || '' } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        resolve({ s: res.statusCode, d: JSON.parse(d) });
      });
    });
    req.on('error', function(e) { resolve({ s: 0, d: e.message }); });
    req.end();
  });
}

async function test() {
  // Login
  const login = await postReq('/api/auth/login', { username: 'owner', password: 'Owner@12345' });
  console.log('Login:', login.s, login.d.success);
  const cookie = login.cookies ? login.cookies.map(function(c) { return c.split(';')[0]; }).join('; ') : '';

  // Now try other endpoints to see which ones fail
  const tests = [
    '/api/audit-logs',
    '/api/audit-logs?limit=10',
    '/api/templates?pageSize=1',
    '/api/rooms?pageSize=1',
    '/api/invoices?pageSize=1',
    '/api/payments?pageSize=1',
  ];

  for (const path of tests) {
    const r = await getReq(path, cookie);
    console.log(path, '->', r.s, r.d.success ? 'OK' : 'FAIL: ' + (r.d.error?.message || r.d));
  }
}

test().catch(function(e) { console.error(e.message); });