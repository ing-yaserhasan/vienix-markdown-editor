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
          expression: `(() => {
            const preview = document.getElementById('preview-content');
            if (!preview) return { error: 'no preview' };
            
            // Check all text nodes in preview
            const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
            const foundTexts = [];
            while (walker.nextNode()) {
              const txt = walker.currentNode.textContent;
              if (txt.includes('Servus') || txt.includes('wunderschön') || txt.includes('Wien')) {
                foundTexts.push({
                  text: txt,
                  parentTag: walker.currentNode.parentElement ? walker.currentNode.parentElement.tagName : null,
                  parentClasses: walker.currentNode.parentElement ? walker.currentNode.parentElement.className : null
                });
              }
            }

            return {
              foundTexts,
              totalPronWords: document.querySelectorAll('.pronunciation-word').length,
              totalPronPhrases: document.querySelectorAll('.pronunciation-phrase').length,
              totalPronSpeakers: document.querySelectorAll('.pronunciation-speaker-btn').length
            };
          })()`,
          returnByValue: true
        }
      }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      console.log('Walker inspection:', JSON.stringify(msg.result.result.value, null, 2));
      process.exit(0);
    };
  });
});
