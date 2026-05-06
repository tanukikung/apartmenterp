const http = require('http');
const https = require('https');
const fs = require('fs');

const endpoints = [
  '/api/settings',
  '/api/admin/users',
  '/api/tenants?pageSize=3',
  '/api/billing/cycles?pageSize=3',
];

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const cookieFile = fs.readFileSync('cookies.txt', 'utf8');
    const cookieMatch = cookieFile.match(/^#HttpOnly_localhost.*?\tauth_session\t(.+)$/m);
    const cookieValue = cookieMatch ? cookieMatch[1] : '';
    const req = lib.get(url, { headers: { cookie: 'auth_session=' + cookieValue } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse error: ' + data.substring(0, 100))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  for (const ep of endpoints) {
    try {
      const url = 'http://localhost:3001' + ep;
      const j = await fetchJson(url);
      let keys = 'other';
      if (j.data === null || j.data === undefined) keys = 'null_or_undef';
      else if (Array.isArray(j.data)) keys = 'array[' + j.data.length + ']';
      else if (typeof j.data === 'object') keys = '{' + Object.keys(j.data).join(',') + '}';
      console.log(ep + ' => success=' + j.success + ', keys=' + keys);
    } catch(e) {
      console.log(ep + ' => ERROR: ' + e.message);
    }
  }
}

main().catch(console.error);
