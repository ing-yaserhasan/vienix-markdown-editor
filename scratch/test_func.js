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
            // Test the regex used in processPronunciationInPreview on "Servus! Willkommen in Wien."
            const PHRASE_REGEX = /([\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}\\p{Script=Hangul}]+(?:[\\s',’\\-]+[\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}\\p{Script=Hangul}]+)*)/gu;
            const sample = "Servus! Willkommen in Wien.";
            const matches = [];
            let m;
            while ((m = PHRASE_REGEX.exec(sample)) !== null) {
              matches.push({ match: m[0], index: m.index });
            }
            return {
              regexMatches: matches,
              renderMarkdownExists: typeof renderMarkdown !== 'undefined',
              windowProcessExists: typeof window.processPronunciationInPreview !== 'undefined'
            };
          })()`,
          returnByValue: true
        }
      }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      console.log('Regex & Func test:', JSON.stringify(msg.result.result.value, null, 2));
      process.exit(0);
    };
  });
});
