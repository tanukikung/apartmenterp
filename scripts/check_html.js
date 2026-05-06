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

  const req = http.request({ hostname: 'localhost', port: 3001, path: '/admin/templates', method: 'GET', headers: { 'Cookie': cookies } }, function(res) {
    let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
      console.log('Status:', res.statusCode);
      console.log('HTML size:', d.length);
      console.log('Content-Type:', res.headers['content-type']);
      console.log('Has loading text:', d.includes('กำลังโหลด'));
      console.log('Has empty state:', d.includes('ยังไม่มีเทมเพลต'));

      // Look for template names
      const names = ['สัญญาเช่าที่พัก', 'ใบแจ้งหนี้', 'แจ้งชำระ', 'ใบเสร็จ'];
      names.forEach(function(n) {
        console.log('Has', n + ':', d.includes(n));
      });

      // Find script tags
      var scriptMatches = d.match(/<script[^>]*>/gi);
      console.log('Script tags found:', scriptMatches ? scriptMatches.length : 0);

      // Check for next.js data
      console.log('Has nextjs:', d.includes('_next') || d.includes('__NEXT'));
      console.log('Has data JSON:', d.includes('application/json'));

      // Look for __NEXT_DATA__
      var nextDataIdx = d.indexOf('__NEXT_DATA__');
      if (nextDataIdx >= 0) {
        console.log('NEXT_DATA at idx:', nextDataIdx, d.slice(nextDataIdx, nextDataIdx + 200));
      }

      // Check if the empty state div is in HTML (server-rendered)
      console.log('Empty state div in HTML:', d.includes('สร้างเทมเพลตแรก'));
    });
  });
  req.end();
}

run().catch(function(e) { console.error(e.message); });