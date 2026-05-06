const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
  const { cookies } = await import('http');
  // Just do a direct API test
  const http = require('http');

  // First login
  const loginData = JSON.stringify({ username: 'owner', password: 'Owner@12345' });
  const loginReq = http.request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) }
  }, (res) => {
    console.log('Login status:', res.statusCode);
    const cookies = res.headers['set-cookie'];
    console.log('Cookies:', cookies ? cookies.map(c => c.split(';')[0]).join('; ') : 'none');

    // Then fetch templates
    const req2 = http.request({
      hostname: 'localhost', port: 3001, path: '/api/templates?pageSize=100',
      method: 'GET', headers: { 'Cookie': cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '' }
    }, (res2) => {
      let data = '';
      res2.on('data', d => data += d);
      res2.on('end', () => {
        const j = JSON.parse(data);
        console.log('Templates API success:', j.success);
        console.log('Total:', j.data?.total, 'Count:', j.data?.data?.length);
        if (j.data?.data) {
          j.data.data.forEach(t => console.log(' -', t.type, '-', t.name, '-', t.status));
        }
        p.$disconnect();
      });
    });
    req2.end();
  });

  loginReq.write(loginData);
  loginReq.end();
}

check().catch(e => { console.error(e); p.$disconnect(); });