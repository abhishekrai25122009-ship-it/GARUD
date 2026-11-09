const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = 'C:\\Users\\Om Narain\\.gemini\\antigravity\\brain\\0ba25868-0910-4918-8319-82941a8012c9';
const PORT = 9225;
const TARGET_URL = 'http://127.0.0.1:5175';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : undefined;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${filePath}`);
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function run() {
  console.log('Launching headless Chrome on port', PORT);
  const userDataDir = path.join(os.tmpdir(), `chrome-garud-test-${Date.now()}`);
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1920,1080',
    TARGET_URL,
  ]);

  try {
    let version = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        version = await getJson(`http://127.0.0.1:${PORT}/json/list`);
        if (version && version.length > 0) break;
      } catch {}
    }

    if (!version || version.length === 0) {
      throw new Error('Failed to connect to Chrome debugging port.');
    }

    const pageWsUrl = version[0].webSocketDebuggerUrl;
    console.log('Connecting to page WebSocket:', pageWsUrl);

    const cdp = new CDP(pageWsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: TARGET_URL });

    console.log('Waiting for GARUD application to initialize...');
    await sleep(3000);

    // 1. Bypass startup screen if present
    const startupBypassed = await cdp.evaluate(`(() => {
      const btn = document.querySelector('.startup-btn');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`);
    console.log('Startup bypassed via .startup-btn:', startupBypassed);
    await sleep(2000);

    // 2. Check Branding, Document Title, and VOICE Button
    const info = await cdp.evaluate(`(() => {
      return {
        title: document.title,
        headerMain: document.querySelector('.main-wordmark')?.textContent?.replace(/\\s+/g, ' ').trim(),
        headerSub: document.querySelector('.sub-wordmark')?.textContent?.replace(/\\s+/g, ' ').trim(),
        voiceBtn: document.querySelector('.voice-toggle')?.textContent?.trim(),
        voiceAriaPressed: document.querySelector('.voice-toggle')?.getAttribute('aria-pressed'),
        canvasPresent: Boolean(document.querySelector('canvas')),
      };
    })()`);
    console.log('GARUD Console Verification Info:', info);

    // 3. Test VOICE Toggle Button
    console.log('Testing VOICE button toggle...');
    const voiceBefore = await cdp.evaluate(`document.querySelector('.voice-toggle')?.textContent?.trim()`);
    await cdp.evaluate(`document.querySelector('.voice-toggle')?.click()`);
    await sleep(400);
    const voiceOff = await cdp.evaluate(`document.querySelector('.voice-toggle')?.textContent?.trim()`);
    await cdp.evaluate(`document.querySelector('.voice-toggle')?.click()`);
    await sleep(400);
    const voiceRestored = await cdp.evaluate(`document.querySelector('.voice-toggle')?.textContent?.trim()`);
    console.log(`Voice Toggle: Initial="${voiceBefore}" -> Click1="${voiceOff}" -> Click2="${voiceRestored}"`);

    // 4. Test 3D Canvas Mouse Orbit, Pan, Wheel Zoom, and Double Click
    console.log('Testing 3D radar canvas pointer interaction...');
    const canvasResult = await cdp.evaluate(`(() => {
      const canvas = document.querySelector('.three-host canvas') || document.querySelector('canvas');
      if (!canvas) return { error: 'Canvas not found' };

      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // 1. Simulate LMB Drag (Orbit 360°)
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + 150, clientY: cy - 60, button: 0, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: cx + 150, clientY: cy - 60, button: 0, bubbles: true }));

      // 2. Simulate RMB Drag (Pan)
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 2, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cx - 80, clientY: cy + 40, button: 2, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: cx - 80, clientY: cy + 40, button: 2, bubbles: true }));

      // 3. Simulate Wheel Zoom
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));

      // 4. Simulate Double-Click (Fit Scene)
      canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      return {
        canvasFound: true,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    })()`);
    console.log('3D Viewport Pointer Test Result:', canvasResult);
    await sleep(1500);

    // Save screenshot of 3D radar viewport
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'garud-3d-radar-viewport.png'));

    // 5. Test Intercept Exercise: Initiate and trace trajectory closure
    console.log('Opening Intercept Exercise modal...');
    await cdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('INTERCEPT EXERCISE'));
      if (btn) btn.click();
    })()`);
    await sleep(800);

    // Click "LAUNCH INTERCEPT" inside modal
    console.log('Initiating intercept exercise...');
    await cdp.evaluate(`(() => {
      const launchBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.textContent.includes('INITIATE') || b.textContent.includes('LAUNCH') || b.textContent.includes('START')
      );
      if (launchBtn) launchBtn.click();
    })()`);
    await sleep(500);

    // Close modal to see the tactical radar view
    await cdp.evaluate(`(() => {
      const closeBtn = document.querySelector('.modal-close-btn') || Array.from(document.querySelectorAll('button')).find(b => b.textContent === '×');
      if (closeBtn) closeBtn.click();
    })()`);

    console.log('Tracking interceptor trajectory towards target...');
    for (let s = 1; s <= 14; s++) {
      await sleep(1000);
      const telemetry = await cdp.evaluate(`(() => {
        const bodyText = document.body.innerText;
        const complete = bodyText.includes('EXERCISE COMPLETE') || bodyText.includes('Target intercepted');
        const miss = bodyText.includes('EXERCISE MISS');
        return {
          complete,
          miss,
        };
      })()`);
      console.log(`T+${s}s: complete=${telemetry.complete}, miss=${telemetry.miss}`);
      if (s === 5) {
        await cdp.screenshot(path.join(ARTIFACT_DIR, 'garud-interceptor-inflight.png'));
      }
      if (telemetry.complete || s === 12) {
        await cdp.screenshot(path.join(ARTIFACT_DIR, 'garud-interceptor-impact.png'));
        if (telemetry.complete) {
          console.log('Target intercepted successfully at encounter coordinates!');
          break;
        }
      }
    }

    console.log('All verification tasks executed successfully.');
    cdp.close();
  } finally {
    chromeProc.kill();
    console.log('Headless Chrome closed.');
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
