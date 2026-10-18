const http = require('http');
const fs = require('fs');

http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const targets = JSON.parse(data);
    const target = targets.find(t => t.type === 'page' && t.url.includes('8080'));
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
      await send('Runtime.evaluate', {
        expression: `
          (function() {
            const firstItem = document.querySelector('.obsidian-tree-item');
            if (firstItem) firstItem.click();
          })()
        `
      });

      await new Promise(r => setTimeout(r, 600));

      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: 1550,
          y: 0,
          width: 370,
          height: 600,
          scale: 1
        }
      });
      fs.writeFileSync('C:/Users/Yaser/.gemini/antigravity-ide/brain/df2c765e-9de3-4fa9-9b08-b3cbc53ce2ba/active_item_exact_verified.png', Buffer.from(shot.data, 'base64'));
      console.log('Saved active_item_exact_verified.png');
      ws.close();
      process.exit(0);
    };
  });
});
