const http = require('http');
const fs = require('fs');

http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const targets = JSON.parse(data);
    const target = targets.find(t => t.type === 'page' && t.url.includes('8080'));
    if (!target) {
      console.error('Target page not found');
      process.exit(1);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    let id = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    ws.onopen = async () => {
      // Reload page ignoring cache
      await send('Page.reload', { ignoreCache: true });
      await new Promise(r => setTimeout(r, 1200));

      const result = await send('Runtime.evaluate', {
        expression: `
          (function() {
            const drawer = document.getElementById('chambers-explorer-drawer');
            if (drawer && !drawer.classList.contains('active')) {
              window.toggleChambersExplorerDrawer();
            }
            if (typeof collapsedFolders !== 'undefined') {
              for (let k in collapsedFolders) collapsedFolders[k] = false;
            }
            window.switchChamber(6);
            if (typeof renderChambersExplorerTree === 'function') {
              renderChambersExplorerTree();
            }
            const items = Array.from(document.querySelectorAll('.obsidian-tree-item')).map(el => ({
              id: el.id,
              classes: el.className,
              buttonsCount: el.querySelectorAll('.obsidian-action-btn').length,
              btnTitles: Array.from(el.querySelectorAll('.obsidian-action-btn')).map(b => b.title),
              title: el.querySelector('.obsidian-item-title')?.textContent,
              num: el.querySelector('.obsidian-item-num')?.textContent
            }));
            return items;
          })()
        `,
        returnByValue: true
      });
      console.log('Tree items count:', result.result.value.length);
      console.log('Chamber 6 info:', result.result.value.find(i => i.id === 'tree-item-6'));

      await new Promise(r => setTimeout(r, 600));

      // Capture screenshot of the drawer
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('C:/Users/Yaser/.gemini/antigravity-ide/brain/df2c765e-9de3-4fa9-9b08-b3cbc53ce2ba/exact_design_verified.png', Buffer.from(shot.data, 'base64'));
      console.log('Screenshot saved to exact_design_verified.png');
      ws.close();
      process.exit(0);
    };
  });
});
