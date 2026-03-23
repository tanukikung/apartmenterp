// Get ngrok tunnel URL from local API
try {
  const r = await fetch('http://localhost:4040/api/tunnels');
  const json = await r.json();
  const https = json.tunnels?.find(t => t.proto === 'https');
  if (https) {
    console.log('NGROK URL  :', https.public_url);
    console.log('Webhook URL:', https.public_url + '/api/line/webhook');
  } else {
    console.log('No HTTPS tunnel found');
    console.log(JSON.stringify(json.tunnels?.map(t => ({ proto: t.proto, url: t.public_url })), null, 2));
  }
} catch {
  console.log('ngrok API not ready — make sure ngrok is running');
  console.log('Run: C:\\Users\\bccbo\\Downloads\\ngrok-v3-stable-windows-amd64\\ngrok.exe http 3001');
}
