const http = require('http');
const fs = require('fs');
const path = require('path');

function getCdpTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();

  return new Promise((resolveOpen) => {
    ws.onopen = () => {
      resolveOpen({
        send(method, params = {}) {
          return new Promise((resolveCmd, rejectCmd) => {
            const msgId = id++;
            callbacks.set(msgId, { resolve: resolveCmd, reject: rejectCmd });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          });
        },
        close() {
          ws.close();
        }
      });
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        const { resolve, reject } = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  });
}

async function run() {
  const tabs = await getCdpTabs();
  const editorTab = tabs.find(t => t.url.includes('vienix-markdown-editor') || t.title.includes('Vienix'));
  if (!editorTab) {
    console.error('Editor tab not found');
    return;
  }
  const client = await cdpClient(editorTab.webSocketDebuggerUrl);
  console.log('Connected to CDP');

  // Reload page to get fresh HTML/CSS/JS
  console.log('Reloading page...');
  await client.send('Page.reload');
  await new Promise(r => setTimeout(r, 1200));

  // 1. Mobile view 375x750 with Edit OFF
  console.log('Setting mobile metrics 375x750...');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 750,
    deviceScaleFactor: 2,
    mobile: true
  });

  await client.send('Runtime.evaluate', {
    expression: "if (typeof closeSettingsModal === 'function') closeSettingsModal(); if (typeof setViewMode === 'function') setViewMode('preview');"
  });
  await new Promise(r => setTimeout(r, 600));

  let shot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'mobile_edit_off.png'), Buffer.from(shot.data, 'base64'));
  console.log('Saved mobile_edit_off.png');

  // 2. Click Edit button
  console.log('Toggling Edit mode ON...');
  await client.send('Runtime.evaluate', {
    expression: "toggleWysiwygPreviewMode();"
  });
  await new Promise(r => setTimeout(r, 500));

  shot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'mobile_edit_on.png'), Buffer.from(shot.data, 'base64'));
  console.log('Saved mobile_edit_on.png');

  // 3. Desktop view 1200x800 verification
  console.log('Setting desktop metrics 1200x800...');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await client.send('Runtime.evaluate', {
    expression: "if (typeof isWysiwygActive !== 'undefined' && isWysiwygActive) toggleWysiwygPreviewMode(); if (typeof setViewMode === 'function') setViewMode('split');"
  });
  await new Promise(r => setTimeout(r, 600));

  shot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, 'desktop_verified.png'), Buffer.from(shot.data, 'base64'));
  console.log('Saved desktop_verified.png');

  // Reset to default window metrics so user's browser isn't left emulated
  await client.send('Emulation.clearDeviceMetricsOverride');
  console.log('Cleared device metrics override');

  client.close();
}

run().catch(console.error);
