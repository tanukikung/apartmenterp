const http = require('http');

function login() {
  return new Promise(function(resolve) {
    const body = JSON.stringify({ username: 'owner', password: 'Owner@12345' });
    const req = http.request({ hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        const cookies = (res.headers['set-cookie'] || []).map(function(c) { return c.split(';')[0]; }).join('; ');
        resolve({ s: res.statusCode, d: JSON.parse(d), cookies: cookies });
      });
    });
    req.write(body); req.end();
  });
}

function get(path, cookie) {
  return new Promise(function(resolve) {
    const req = http.request({ hostname: 'localhost', port: 3001, path, method: 'GET', headers: { 'Cookie': cookie } }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() {
        try { resolve({ s: res.statusCode, d: JSON.parse(d) }); }
        catch(e) { resolve({ s: res.statusCode, d: d.slice(0, 300) }); }
      });
    });
    req.on('error', function(e) { resolve({ s: 0, d: e.message }); });
    req.end();
  });
}

async function run() {
  const loginResult = await login();
  console.log('Login:', loginResult.s, loginResult.d.success);
  const cookie = loginResult.cookies;

  const id = 'afd047e6-ccb9-481b-9602-c2f89e949074';

  // Test template detail API
  const r1 = await get('/api/templates/' + id, cookie);
  console.log('\n=== /api/templates/' + id + ' ===');
  console.log('Status:', r1.s);
  if (r1.d.success) {
    const t = r1.d.data;
    console.log('Name:', t.name, '| type:', t.type, '| status:', t.status);
    console.log('Active version:', t.activeVersionId);
    console.log('Versions:', t.versions?.length, '| fields:', t.fields?.length);
    if (t.activeVersion) console.log('Active ver:', JSON.stringify(t.activeVersion).slice(0, 200));
  } else {
    console.log('Error:', JSON.stringify(r1.d.error));
  }

  // Test templates list
  const r2 = await get('/api/templates?pageSize=10', cookie);
  console.log('\n=== /api/templates ===');
  console.log('Status:', r2.s, '| count:', r2.d.data?.data?.length);
  if (r2.d.data?.data) {
    r2.d.data.data.forEach(function(t) {
      console.log(' -', t.id.slice(0,8), t.name, '| ver:', t.activeVersionId ? 'has active' : 'none');
    });
  }
}

run().catch(function(e) { console.error(e.message); });