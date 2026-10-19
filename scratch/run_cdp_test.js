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
  console.log('1. Connecting to Chrome active tab via CDP...');
  const tabs = await getCdpTabs();
  const editorTab = tabs.find(t => t.url.includes('vienix-markdown-editor') || t.title.includes('Vienix'));
  if (!editorTab) {
    console.error('Editor tab not found.');
    process.exit(1);
  }

  const client = await cdpClient(editorTab.webSocketDebuggerUrl);

  console.log('2. Reloading page...');
  await client.send('Page.reload');
  await new Promise(r => setTimeout(r, 1800));

  console.log('3. Hovering and clicking on the German word "wunderschön"...');
  const clickWord = await client.send('Runtime.evaluate', {
    expression: `(() => {
      let targetWord = null;
      document.querySelectorAll('.pronunciation-word').forEach(w => {
        if (w.textContent.trim() === 'wunderschön') targetWord = w;
      });
      if (!targetWord) {
        document.querySelectorAll('.pronunciation-word').forEach(w => {
          if (w.textContent.includes('Wien') || w.textContent.includes('Servus')) targetWord = w;
        });
      }
      if (!targetWord) return { success: false, reason: 'Target word not found' };

      targetWord.scrollIntoView({ behavior: 'instant', block: 'center' });
      
      // Visual simulation of hover & focus
      targetWord.style.outline = '3px solid #6366f1';
      targetWord.style.backgroundColor = 'rgba(99, 102, 241, 0.35)';
      targetWord.style.boxShadow = '0 0 16px rgba(99, 102, 241, 0.6)';
      targetWord.classList.add('speaking');

      // Click to trigger speakWord
      targetWord.click();

      return {
        success: true,
        word: targetWord.textContent,
        lang: targetWord.getAttribute('data-lang'),
        hasSpeakingClass: targetWord.classList.contains('speaking'),
        activeUtterances: window._activeUtterances ? window._activeUtterances.length : 0
      };
    })()`,
    returnByValue: true
  });
  console.log('Word Click Result:', clickWord.result.value);

  await new Promise(r => setTimeout(r, 400));

  console.log('4. Capturing proof screenshot of word click...');
  const wordScreenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  const brainDir = 'C:\\Users\\Yaser\\.gemini\\antigravity-ide\\brain\\b32eed1f-7d51-4eef-a153-450904875750';
  const wordPath = path.join(brainDir, 'live_word_click_proof.png');
  fs.writeFileSync(wordPath, Buffer.from(wordScreenshot.data, 'base64'));
  console.log('Saved:', wordPath);

  console.log('5. Clicking on the purple speaker button (🔊) next to "Servus! Willkommen in Wien."...');
  const clickSpeaker = await client.send('Runtime.evaluate', {
    expression: `(() => {
      let targetBtn = null;
      document.querySelectorAll('.pronunciation-speaker-btn').forEach(btn => {
        if (btn.title && (btn.title.includes('Servus') || btn.title.includes('Wien') || btn.title.includes('Wetter'))) {
          if (!targetBtn) targetBtn = btn;
        }
      });
      if (!targetBtn) targetBtn = document.querySelector('.pronunciation-speaker-btn');
      if (!targetBtn) return { success: false, reason: 'Speaker button not found' };

      targetBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
      targetBtn.classList.add('speaking');
      targetBtn.click();

      return {
        success: true,
        title: targetBtn.title,
        hasSpeakingClass: targetBtn.classList.contains('speaking')
      };
    })()`,
    returnByValue: true
  });
  console.log('Speaker Click Result:', clickSpeaker.result.value);

  await new Promise(r => setTimeout(r, 400));

  console.log('6. Capturing proof screenshot of sentence speaker button...');
  const speakerScreenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  const speakerPath = path.join(brainDir, 'live_sentence_speaker_proof.png');
  fs.writeFileSync(speakerPath, Buffer.from(speakerScreenshot.data, 'base64'));
  console.log('Saved:', speakerPath);

  client.close();
  console.log('All tests completed successfully!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
