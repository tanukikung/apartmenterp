const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
  const http = require('http');

  function makeRequest(method, path, data, cookie) {
    return new Promise((resolve, reject) => {
      const body = data ? JSON.stringify(data) : null;
      const req = http.request({
        hostname: 'localhost', port: 3001, path,
        method, headers: {
          'Content-Type': 'application/json',
          'Content-Length': body ? Buffer.byteLength(body) : 0,
          'Cookie': cookie || ''
        }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
          catch(e) { resolve({ status: res.statusCode, data: d }); }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // 1. Login
  const login = await makeRequest('POST', '/api/auth/login', { username: 'owner', password: 'Owner@12345' }, null);
  console.log('Login:', login.status, login.data.success);
  const cookie = login.data.data?.user ? 'auth_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1ZGQ1Nzg1NS01ZmEzLTRmNTAtYmNkMS0yMzM2OWQzZDg3MDUiLCJ1c2VybmFtZSI6Im93bmVyIiwiZGlzcGxheU5hbWUiOiJPd25lciIsInJvbGUiOiJBRE1JTiIsImZvcmNlUGFzc3dvcmRDaGFuZ2UiOmZhbHNlLCJidWlsZGluZ0lkIjpudWxsLCJpYXQiOjE3NzgwNDc5MTMsImV4cCI6MTc3ODY1MjcxM30.SIHOlV4-CdpUMM4zlrKVwTl6GcAfLdl_NdttMrARvZ8; role=ADMIN' : '';

  // 2. Test with same cookie
  const templates = await makeRequest('GET', '/api/templates?pageSize=100', null, cookie);
  console.log('Templates:', templates.status, templates.data.success, '| count:', templates.data.data?.data?.length);

  // 3. Test with wrong cookie
  const badCookies = await makeRequest('GET', '/api/templates?pageSize=100', null, 'bad_cookie=abc');
  console.log('Bad cookie:', badCookies.status);

  p.$disconnect();
}

check().catch(e => { console.error(e.message); p.$disconnect(); });