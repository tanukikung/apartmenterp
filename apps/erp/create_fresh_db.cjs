const { Client } = require('pg');
async function run() {
  const c = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'anand37048', database: 'postgres' });
  await c.connect();
  try { await c.query('DROP DATABASE test_fresh_proof'); } catch (e) { console.log('drop:', e.message); }
  await c.query('CREATE DATABASE test_fresh_proof');
  console.log('Fresh DB created: test_fresh_proof');
  await c.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
