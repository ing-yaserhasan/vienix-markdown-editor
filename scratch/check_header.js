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

    const expr = `(() => {
      const header = document.querySelector('.app-header');
      const brand = document.querySelector('.brand-section');
      const titles = document.querySelector('.brand-titles');
      const title = document.querySelector('.brand-title');
      const actions = document.querySelector('.header-actions');
      const classicBtn = document.getElementById('btn-toggle-classic');
      return JSON.stringify({
        headerWidth: header ? header.offsetWidth : 0,
        brandRect: brand ? brand.getBoundingClientRect() : null,
        titlesRect: titles ? titles.getBoundingClientRect() : null,
        titleRect: title ? title.getBoundingClientRect() : null,
        actionsRect: actions ? actions.getBoundingClientRect() : null,
        classicRect: classicBtn ? classicBtn.getBoundingClientRect() : null,
      }, null, 2);
    })()`;

    const res = await send('Runtime.evaluate', { expression: expr });
    console.log(res.result.value);
    ws.close();
  };
}
main().catch(console.error);
