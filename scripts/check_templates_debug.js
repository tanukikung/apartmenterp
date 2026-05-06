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

async function run() {
  const { cookies } = await login();
  console.log('Logged in, cookie len:', cookies.length);

  // Test templates API with exact same cookie
  const r = await new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/templates?pageSize=100', method: 'GET', headers: { 'Cookie': cookies } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        try {
          const j = JSON.parse(d);
          resolve({ s: res.statusCode, d: j });
        } catch(e) {
          resolve({ s: res.statusCode, d: d.slice(0, 200) });
        }
      });
    });
    req.end();
  });
  console.log('Templates:', r.s, r.d?.success, r.d?.data?.data?.length);
  if (r.d?.data?.data) {
    r.d.data.data.forEach(function(t) { console.log(' ', t.name); });
  }

  // Now try GET to /admin/templates and see what HTML contains about templates
  const pageReq = http.request({ hostname: 'localhost', port: 3001, path: '/admin/templates', method: 'GET', headers: { 'Cookie': cookies, 'Accept': 'text/html' } }, function(res) {
    let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
      // Check if HTML contains data about templates
      var names = ['สัญญาเช่าที่พัก', 'ใบแจ้งหนี้รายเดือน', 'แจ้งชำระค่าบริการ', 'ใบเสร็จรับเงิน'];
      names.forEach(function(n) { console.log('HTML has', n + ':', d.includes(n)); });

      // Check for data in script tags that might be for hydration
      var scriptContent = d.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
      if (scriptContent) {
        console.log('Total script tags:', scriptContent.length);
        scriptContent.forEach(function(s, i) {
          if (s.length < 500) console.log('Script', i, ':', s.slice(0, 200));
        });
      }

      // Check what specific element shows the count
      console.log('Has เทมเพลต count badge:', d.includes('เทมเพลต'));
      console.log('Has ทะเบียนเทมเพลต:', d.includes('ทะเบียนเทมเพลต'));
    });
  });
  pageReq.end();
}

run().catch(function(e) { console.error(e.message); });