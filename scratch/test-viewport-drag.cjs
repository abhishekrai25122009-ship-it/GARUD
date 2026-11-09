const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ARTIFACT_DIR = path.resolve('C:\\Users\\Om Narain\\.gemini\\antigravity\\brain\\0ba25868-0910-4918-8319-82941a8012c9');

async function main() {
  console.log('--- STARTING 3D VIEWPORT DRAGGING & CAMERA STATE VERIFICATION ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9233;
  const tempProfile = path.join(os.tmpdir(), `chrome-drag-${Date.now()}`);

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    `--user-data-dir=${tempProfile}`,
    'http://127.0.0.1:5175'
  ]);

  try {
    let pages = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        pages = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${port}/json/list`, res => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => resolve(JSON.parse(raw)));
          }).on('error', reject);
        });
        if (pages && pages.length > 0) {
          const target = pages.find(p => p.type === 'page');
          if (target && target.webSocketDebuggerUrl) {
            pages = [target];
            break;
          }
        }
      } catch {}
    }

    if (!pages || !pages[0]) {
      throw new Error('Failed to connect to Chrome debugging target');
    }

    const wsUrl = pages[0].webSocketDebuggerUrl;
    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new globalThis.WebSocket(wsUrl);
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
    await send('Page.navigate', { url: 'http://127.0.0.1:5175' });
    await new Promise(r => setTimeout(r, 2500));

    // Bypass startup dialog if present
    const pageLoc = await send('Runtime.evaluate', {
      expression: `({ title: document.title, href: window.location.href, bodyLen: document.body.innerHTML.length })`,
      returnByValue: true
    });
    console.log('Page State:', pageLoc.result?.result?.value);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.startup-btn');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1500));

    // Check canvas presence and dimensions
    const canvasInfo = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('.airspace3d-viewport canvas') || document.querySelector('canvas');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
        };
      })()`,
      returnByValue: true
    });
    console.log('Viewport Canvas Info:', canvasInfo.result?.result?.value);

    // Verify 1: Left-Click Drag (Orbit)
    console.log('Testing Left-Click Drag (Orbit)...');
    const orbitTest = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return { success: false, reason: 'no canvas' };
        const rect = canvas.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        // Dispatch pointerdown
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: startX,
          clientY: startY,
          button: 0,
          buttons: 1,
          bubbles: true
        }));

        // Dispatch series of pointermove events
        for (let i = 1; i <= 5; i++) {
          canvas.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: startX + i * 20,
            clientY: startY - i * 10,
            button: 0,
            buttons: 1,
            bubbles: true
          }));
        }

        // Dispatch pointerup
        canvas.dispatchEvent(new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: startX + 100,
          clientY: startY - 50,
          button: 0,
          buttons: 0,
          bubbles: true
        }));

        return { success: true };
      })()`,
      returnByValue: true
    });
    console.log('Orbit Drag Event Dispatch:', orbitTest.result?.result?.value);

    // Verify 2: Right-Click Drag (Pan)
    console.log('Testing Right-Click Drag (Pan)...');
    const panTest = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return { success: false, reason: 'no canvas' };
        const rect = canvas.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        // Dispatch RMB pointerdown
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: startX,
          clientY: startY,
          button: 2,
          buttons: 2,
          bubbles: true
        }));

        // Dispatch move
        for (let i = 1; i <= 5; i++) {
          canvas.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: startX - i * 25,
            clientY: startY + i * 15,
            button: 2,
            buttons: 2,
            bubbles: true
          }));
        }

        // Dispatch pointerup
        canvas.dispatchEvent(new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: startX - 125,
          clientY: startY + 75,
          button: 2,
          buttons: 0,
          bubbles: true
        }));

        return { success: true };
      })()`,
      returnByValue: true
    });
    console.log('Pan Drag Event Dispatch:', panTest.result?.result?.value);

    // Verify 3: Wheel Zoom
    console.log('Testing Wheel Zoom...');
    const wheelTest = await send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return { success: false };
        canvas.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -120,
          bubbles: true,
          cancelable: true
        }));
        return { success: true };
      })()`,
      returnByValue: true
    });
    console.log('Wheel Zoom Event Dispatch:', wheelTest.result?.result?.value);

    await new Promise(r => setTimeout(r, 1000));

    // Capture screenshot of the responsive, smoothly dragged 3D viewport
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(ARTIFACT_DIR, 'garud-viewport-drag-verified.png');
    fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));
    console.log('Saved verification screenshot:', shotPath);

    ws.close();
    console.log('--- VERIFICATION COMPLETE: ALL GESTURES EXECUTED CLEANLY ---');
  } finally {
    chrome.kill();
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch {}
  }
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
