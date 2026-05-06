const http = require('http');

function login() {
  return new Promise(function(resolve) {
    const body = JSON.stringify({ username: 'owner', password: 'Owner@12345' });
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        const cookies = (res.headers['set-cookie'] || []).map(function(c) { return c.split(';')[0]; }).join('; ');
        resolve({ cookies: cookies });
      });
    });
    req.write(body); req.end();
  });
}

function fetchPage(path, cookie) {
  return new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path, method: 'GET', headers: { 'Cookie': cookie, 'Accept': 'text/html' } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        resolve({ s: res.statusCode, html: d });
      });
    });
    req.end();
  });
}

async function main() {
  const { cookies } = await login();
  console.log('Cookie set, length:', cookies.length);

  // 1. Check if there's an issue with session cookie handling
  const r1 = await new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/auth/me', method: 'GET', headers: { 'Cookie': cookies } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        try { resolve({ s: res.statusCode, d: JSON.parse(d) }); }
        catch(e) { resolve({ s: res.statusCode, d: d.slice(0,100) }); }
      });
    });
    req.end();
  });
  console.log('/api/auth/me:', r1.s, JSON.stringify(r1.d).slice(0, 100));

  // 2. Get the actual HTML page
  const page = await fetchPage('/admin/templates', cookies);
  console.log('Page status:', page.s);
  // Check if page contains error or if it has the template list
  console.log('HTML length:', page.html.length);
  // Look for "ยังไม่มีเทมเพลต" in HTML
  console.log('Has empty state text:', page.html.includes('ยังไม่มีเทมเพลต'));
  console.log('Has template name:', page.html.includes('เทมเพลต'));

  // 3. Check what cookies are actually being set
  console.log('\nCookie details:');
  cookies.split(';').forEach(function(c) { console.log(' -', c.trim().slice(0, 60)); });
}

main().catch(function(e) { console.error(e.message); });