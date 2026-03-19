import pkg from 'pg';
const { Client } = pkg;
const c = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'anand37048', database: 'postgres' });
await c.connect();
try { await c.query('DROP DATABASE test_fresh_proof'); } catch {}
await c.query('CREATE DATABASE test_fresh_proof');
console.log('Fresh DB created: test_fresh_proof');
await c.end();
