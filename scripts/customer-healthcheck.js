const fs = require('fs');
const http = require('http');
const { createClient } = require('redis');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function checkHttpHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`/api/health returned ${res.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(body);
          if (!parsed?.success || parsed?.data?.status !== 'ok') {
            reject(new Error('/api/health did not report success'));
            return;
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Timed out waiting for /api/health')));
  });
}

function checkDirectoryWritable(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
  } catch (error) {
    throw new Error(`Directory is not writable: ${dirPath} (${error.message})`);
  }
}

async function checkRedis(redisUrl) {
  if (!redisUrl) return Promise.resolve();
  const client = createClient({ url: redisUrl, socket: { connectTimeout: 5000 } });
  const timeout = setTimeout(() => {
    client.disconnect().catch(() => undefined);
  }, 7000);

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected Redis ping response: ${pong}`);
    }
  } catch (error) {
    throw new Error(`Redis healthcheck failed for ${redisUrl}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
    if (client.isOpen) {
      await client.disconnect().catch(() => undefined);
    }
  }
}

async function main() {
  await checkHttpHealth();
  checkDirectoryWritable(process.env.BACKUP_DIR || '/app/data/backups');
  checkDirectoryWritable(process.env.UPLOAD_DIR || '/app/data/uploads');
  await checkRedis(process.env.REDIS_URL || '');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
