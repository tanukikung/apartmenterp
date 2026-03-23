// Simulate LINE webhook verify request
import crypto from 'crypto';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '098ca867ca9ed45bded420b1b82e9344';
const NGROK_URL = process.argv[2] || 'http://localhost:3001';
const WEBHOOK_URL = `${NGROK_URL}/api/line/webhook`;

// LINE verify sends empty events array
const body = JSON.stringify({ destination: 'Utest', events: [] });

// Sign with channel secret (same as LINE does)
const signature = crypto
  .createHmac('sha256', CHANNEL_SECRET)
  .update(body)
  .digest('base64');

console.log('Testing webhook:', WEBHOOK_URL);
console.log('Body:', body);
console.log('Signature:', signature.slice(0, 20) + '...');
console.log('');

try {
  const start = Date.now();
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-line-signature': signature,
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const elapsed = Date.now() - start;
  const json = await res.json();
  console.log(`Response (${elapsed}ms): HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (res.ok) {
    console.log('\nWebhook OK!');
  } else {
    console.log('\nWebhook returned error:', res.status);
  }
} catch (err) {
  console.error('Request failed:', err.message);
  if (err.message.includes('timeout')) {
    console.log('\nTimeout — server is too slow or not responding');
  }
}
