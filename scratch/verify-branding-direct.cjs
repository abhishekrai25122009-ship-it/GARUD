const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ARTIFACT_DIR = path.resolve('C:\\Users\\Om Narain\\.gemini\\antigravity\\brain\\0ba25868-0910-4918-8319-82941a8012c9');

async function main() {
  console.log('--- STARTING DIRECT GARUD BRANDING VERIFICATION ---');

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

  const port = 9228;
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=' + path.join(__dirname, 'chrome-profile-direct'),
    'http://127.0.0.1:5175'
  ]);

  let pages = null;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      pages = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, res => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => resolve(JSON.parse(raw)));
        }).on('error', reject);
      });
      if (pages && pages.length > 0 && pages[0].webSocketDebuggerUrl) break;
    } catch {}
  }

  if (!pages || !pages[0] || !pages[0].webSocketDebuggerUrl) {
    console.error('Failed to get page from Chrome');
    chrome.kill();
    process.exit(1);
  }

  const page = pages.find(p => p.type === 'page') || pages[0];
  console.log('Connecting to Page WS:', page.webSocketDebuggerUrl);

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

  await new Promise(resolve => {
    if (ws.readyState === 1) resolve();
    else ws.addEventListener('open', resolve);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 2000));

  // 1. Check document title
  const titleRes = await send('Runtime.evaluate', { expression: 'document.title' });
  console.log('PAGE TITLE:', titleRes.result?.result?.value);

  // 2. Check favicon link
  const faviconRes = await send('Runtime.evaluate', {
    expression: 'document.querySelector("link[rel=\'icon\']")?.getAttribute("href")'
  });
  console.log('FAVICON HREF:', faviconRes.result?.result?.value);

  // 3. Check startup modal text
  const startupTitle = await send('Runtime.evaluate', {
    expression: 'document.querySelector(".startup-title")?.textContent'
  });
  console.log('STARTUP TITLE:', startupTitle.result?.result?.value);

  const startupSub = await send('Runtime.evaluate', {
    expression: 'document.querySelector(".startup-sub")?.textContent'
  });
  console.log('STARTUP SUBTITLE:', startupSub.result?.result?.value);

  // Capture Screenshot 1: Startup Modal with Garud Eagle
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const shot1Path = path.join(ARTIFACT_DIR, 'garud-startup-branding.png');
  fs.writeFileSync(shot1Path, Buffer.from(shot1.result.data, 'base64'));
  console.log('Captured Screenshot 1 (Startup Modal):', shot1Path);

  // 4. Click enter / skip startup
  await send('Runtime.evaluate', {
    expression: 'document.querySelector(".startup-btn")?.click()'
  });
  await new Promise(r => setTimeout(r, 2000));

  // 5. Check header brand
  const headerMain = await send('Runtime.evaluate', {
    expression: 'document.querySelector(".main-wordmark")?.textContent?.trim()'
  });
  console.log('HEADER WORDMARK:', headerMain.result?.result?.value);

  const headerSub = await send('Runtime.evaluate', {
    expression: 'document.querySelector(".sub-wordmark")?.textContent?.trim()'
  });
  console.log('HEADER SUBTITLE:', headerSub.result?.result?.value);

  // Check Eagle SVG presence
  const eaglePresent = await send('Runtime.evaluate', {
    expression: 'Boolean(document.querySelector(".garud-eagle-emblem"))'
  });
  console.log('GARUD EAGLE SVG IN DOM:', eaglePresent.result?.result?.value);

  // Capture Screenshot 2: Full Airspace Console with Header Brand & Eagle Emblem
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const shot2Path = path.join(ARTIFACT_DIR, 'garud-header-console.png');
  fs.writeFileSync(shot2Path, Buffer.from(shot2.result.data, 'base64'));
  console.log('Captured Screenshot 2 (Full Airspace Console):', shot2Path);

  // 6. Open Keyboard Shortcuts Modal
  await send('Runtime.evaluate', {
    expression: 'window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))'
  });
  await new Promise(r => setTimeout(r, 800));

  const shortcutsTitle = await send('Runtime.evaluate', {
    expression: 'document.querySelector(".shortcuts-title")?.textContent?.trim()'
  });
  console.log('SHORTCUTS MODAL TITLE:', shortcutsTitle.result?.result?.value);

  // Capture Screenshot 3: Modal with GARUD branding
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const shot3Path = path.join(ARTIFACT_DIR, 'garud-shortcuts-modal.png');
  fs.writeFileSync(shot3Path, Buffer.from(shot3.result.data, 'base64'));
  console.log('Captured Screenshot 3 (Shortcuts Modal):', shot3Path);

  console.log('--- VERIFICATION COMPLETE SUCCESSFULLY ---');
  chrome.kill();
  process.exit(0);
}

main().catch(e => {
  console.error('ERROR in main:', e);
  process.exit(1);
});
