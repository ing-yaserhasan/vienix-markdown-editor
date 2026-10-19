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

async function main() {
  const tabs = await getCdpTabs();
  const editorTab = tabs.find(t => t.url.includes('vienix-markdown-editor') || t.title.includes('Vienix'));
  const ws = new WebSocket(editorTab.webSocketDebuggerUrl);

  ws.onopen = async () => {
    const send = (method, params = {}) => new Promise(r => {
      const id = Math.floor(Math.random()*100000);
      const handler = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) { ws.removeEventListener('message', handler); r(msg.result); }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    console.log('Reloading page...');
    await send('Page.reload');
    await new Promise(r => setTimeout(r, 1200));

    // Mobile view 375x750
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 750,
      deviceScaleFactor: 2,
      mobile: true
    });

    await send('Runtime.evaluate', {
      expression: "if (typeof setViewMode === 'function') setViewMode('preview');"
    });
    await new Promise(r => setTimeout(r, 400));

    // Trigger toast test
    await send('Runtime.evaluate', {
      expression: "showSpeechWarningToast('متصفحك الحالي يقيّد النطق الصوتي، يُرجى استخدام Chrome أو تفعيل حزمة الصوت من إعدادات الهاتف ⚠️');"
    });
    await new Promise(r => setTimeout(r, 400));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'mobile_toast_preview.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved mobile_toast_preview.png');

    await send('Emulation.clearDeviceMetricsOverride');
    ws.close();
  };
}
main().catch(console.error);
