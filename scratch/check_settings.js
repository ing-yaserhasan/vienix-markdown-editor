const http = require('http');

http.get('http://127.0.0.1:9222/json', (res) => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', async () => {
    const tabs = JSON.parse(d);
    const tab = tabs.find(t => t.url.includes('vienix-markdown-editor'));
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `JSON.stringify({
            settings: localStorage.getItem('vienix_settings'),
            vienixSettingsVar: typeof vienixSettings !== 'undefined' ? vienixSettings : 'undefined',
            previewHasGerman: document.getElementById('preview-content') ? document.getElementById('preview-content').innerText.includes('Servus') : false,
            editorHasGerman: document.getElementById('markdown-input') ? document.getElementById('markdown-input').value.includes('Servus') : false
          })`,
          returnByValue: true
        }
      }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      console.log('Page Debug Info:', JSON.parse(msg.result.result.value));
      process.exit(0);
    };
  });
});
