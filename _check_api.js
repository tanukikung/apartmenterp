const https = require('http');
const fs = require('fs');

const url = process.argv[2] || 'http://localhost:3001/api/admin/users';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request(url, { headers: { cookie: 'auth_session=' + fs.readFileSync('cookies.txt', 'utf8').match(/auth_session=([^;]+)/)?.[1] || '' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const url = args[0];
  const d = await fetchJson(url);
  const shape = {
    success: d.success,
    dataType: typeof d.data,
    isArray: Array.isArray(d.data),
    keys: typeof d.data === 'object' && !Array.isArray(d.data) ? Object.keys(d.data) : 'array_or_other'
  };
  console.log(JSON.stringify(shape));
}

main().catch(e => console.error(e.message));
