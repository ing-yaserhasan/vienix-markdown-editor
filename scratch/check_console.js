const http = require('http');

http.get('http://127.0.0.1:9222/json', (res) => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', async () => {
    const tabs = JSON.parse(d);
    const tab = tabs.find(t => t.url.includes('vienix-markdown-editor'));
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    ws.onopen = async () => {
      ws.send(JSON.stringify({ id: 1, method: 'Log.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({
        id: 3,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            return {
              title: document.title,
              previewHTMLPreviewSnippet: document.getElementById('preview-content') ? document.getElementById('preview-content').innerHTML.substring(document.getElementById('preview-content').innerHTML.indexOf('Servus') - 50, document.getElementById('preview-content').innerHTML.indexOf('Servus') + 150) : null
            };
          })()`,
          returnByValue: true
        }
      }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('Browser Exception:', msg.params.exceptionDetails);
      }
      if (msg.method === 'Log.entryAdded') {
        console.log('Console Log:', msg.params.entry);
      }
      if (msg.id === 3) {
        console.log('HTML around Servus:', msg.result.result.value);
        setTimeout(() => process.exit(0), 1000);
      }
    };
  });
});
