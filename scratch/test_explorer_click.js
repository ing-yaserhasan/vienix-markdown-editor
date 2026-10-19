const http = require('http');

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

    // 1. Click preview explorer button
    await send('Runtime.evaluate', {
      expression: 'document.getElementById("btn-preview-header-explorer").click();'
    });
    await new Promise(r => setTimeout(r, 400));

    // Check if explorer drawer/modal is opened
    const res = await send('Runtime.evaluate', {
      expression: 'document.getElementById("explorer-drawer")?.classList.contains("active") || false;'
    });
    console.log('Explorer open state after click:', res.result.value);

    // Close explorer
    await send('Runtime.evaluate', {
      expression: 'if (typeof toggleChambersExplorer === "function") toggleChambersExplorer(false);'
    });
    console.log('Explorer closed.');

    ws.close();
  };
}
main().catch(console.error);
