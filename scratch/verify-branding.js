const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ARTIFACT_DIR = path.resolve('C:\\Users\\Om Narain\\.gemini\\antigravity\\brain\\0ba25868-0910-4918-8319-82941a8012c9');

async function main() {
  console.log('--- STARTING GARUD BRANDING VERIFICATION ---');

  // Find Chrome executable
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\Om Narain\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
  ];
  let chromePath = chromePaths.find(p => fs.existsSync(p));
  if (!chromePath) {
    console.error('Chrome not found');
    process.exit(1);
  }

  const port = 9225;
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=' + path.join(__dirname, 'chrome-profile-branding')
  ]);

  // Wait for Chrome CDP endpoint
  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      versionData = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/version`, res => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => resolve(JSON.parse(raw)));
        }).on('error', reject);
      });
      if (versionData && versionData.webSocketDebuggerUrl) break;
    } catch {}
  }

  if (!versionData || !versionData.webSocketDebuggerUrl) {
    console.error('Failed to connect to Chrome CDP');
    chrome.kill();
    process.exit(1);
  }

  const WebSocket = (await import('vite')).WebSocket || require('ws');
  // Or use simple WebSocket client
  const wsUrl = versionData.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const pending = new Map();
  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
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

  await new Promise(r => ws.on('open', r));

  // Create new target
  const newTarget = await send('Target.createTarget', { url: 'http://127.0.0.1:5175' });
  const targetId = newTarget.result.targetId;
  const attached = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.result.sessionId;

  const sendSession = (method, params = {}) => send('Target.sendMessageToTarget', {
    sessionId,
    message: JSON.stringify({ id: msgId++, method, params })
  });

  // Enable Page, Runtime, DOM
  let innerMsgId = 100;
  const sessionPending = new Map();
  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Target.receivedMessageFromTarget' && msg.params.sessionId === sessionId) {
      const inner = JSON.parse(msg.params.message);
      if (inner.id && sessionPending.has(inner.id)) {
        sessionPending.get(inner.id)(inner);
        sessionPending.delete(inner.id);
      }
    }
  });

  const call = (method, params = {}) => new Promise(resolve => {
    const id = innerMsgId++;
    sessionPending.set(id, resolve);
    send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id, method, params })
    });
  });

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: 'http://127.0.0.1:5175' });
  await new Promise(r => setTimeout(r, 1200));

  // Check title
  const titleRes = await call('Runtime.evaluate', { expression: 'document.title' });
  console.log('Document title:', titleRes.result.result.value);

  // Check favicon link
  const faviconRes = await call('Runtime.evaluate', {
    expression: 'document.querySelector("link[rel=\'icon\']")?.getAttribute("href")'
  });
  console.log('Favicon href:', faviconRes.result.result.value);

  // Capture Screenshot 1: Startup Modal with Garud Eagle
  const shot1 = await call('Page.captureScreenshot', { format: 'png' });
  const shot1Path = path.join(ARTIFACT_DIR, 'garud-startup-branding.png');
  fs.writeFileSync(shot1Path, Buffer.from(shot1.result.data, 'base64'));
  console.log('Wrote', shot1Path);

  // Click on "LAUNCH CONSOLE (SKIP)" or "ENTER GARUD DEFENSE CONSOLE"
  await call('Runtime.evaluate', {
    expression: 'document.querySelector(".startup-btn")?.click()'
  });
  await new Promise(r => setTimeout(r, 1000));

  // Capture Screenshot 2: Full Airspace Console with Header Brand & Eagle Emblem
  const shot2 = await call('Page.captureScreenshot', { format: 'png' });
  const shot2Path = path.join(ARTIFACT_DIR, 'garud-header-console.png');
  fs.writeFileSync(shot2Path, Buffer.from(shot2.result.data, 'base64'));
  console.log('Wrote', shot2Path);

  // Open Keyboard Shortcuts Modal
  await call('Runtime.evaluate', {
    expression: 'window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))'
  });
  await new Promise(r => setTimeout(r, 600));

  // Capture Screenshot 3: Modal with GARUD branding
  const shot3 = await call('Page.captureScreenshot', { format: 'png' });
  const shot3Path = path.join(ARTIFACT_DIR, 'garud-shortcuts-modal.png');
  fs.writeFileSync(shot3Path, Buffer.from(shot3.result.data, 'base64'));
  console.log('Wrote', shot3Path);

  console.log('--- ALL BRANDING SCREENSHOTS CAPTURED SUCCESSFULLY ---');
  chrome.kill();
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
