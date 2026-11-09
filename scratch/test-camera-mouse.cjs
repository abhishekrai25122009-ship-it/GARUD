const http = require('http');

async function main() {
  const pages = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9228/json/list', res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });

  const page = pages.find(p => p.type === 'page') || pages[0];
  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  const send = (method, params = {}) => new Promise(resolve => {
    const id = msgId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await new Promise(r => ws.addEventListener('open', r));

  // Get canvas element bounding rect
  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('.airspace3d-viewport canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    })()`,
    returnByValue: true
  });
  console.log('Canvas rect:', evalRes.result?.result?.value);

  // Check camera initial position
  const camBefore = await send('Runtime.evaluate', {
    expression: `(() => {
      const rig = window.__debugRig || null;
      return window.__debugCamPos || null;
    })()`,
    returnByValue: true
  });
  console.log('Cam before:', camBefore.result?.result?.value);

  ws.close();
}

main().catch(console.error);
