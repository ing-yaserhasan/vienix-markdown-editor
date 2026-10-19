const fs = require('fs');
const path = require('path');

// 1. Update style.css
const cssPath = path.join(__dirname, '..', 'app', 'css', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

const speechToastCss = `
/* تنبيه ذكي عند قيود النطق في متصفحات الموبايل (مثل متصفح شاومي) */
.speech-alert-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100000;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(30, 41, 59, 0.96);
  color: #fef3c7;
  border: 1px solid rgba(245, 158, 11, 0.5);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.2);
  padding: 10px 18px;
  border-radius: 30px;
  font-size: 0.82rem;
  font-weight: 600;
  direction: rtl;
  backdrop-filter: blur(12px);
  max-width: 92vw;
  width: max-content;
  text-align: center;
  animation: speechToastSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: auto;
  line-height: 1.4;
}

[data-theme="dark"] .speech-alert-toast {
  background: rgba(15, 23, 42, 0.96);
  border-color: rgba(245, 158, 11, 0.55);
  color: #fef08a;
}

.speech-alert-toast svg {
  width: 18px;
  height: 18px;
  color: #f59e0b;
  flex-shrink: 0;
}

.speech-alert-close {
  background: transparent;
  border: none;
  color: inherit;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 4px;
  margin-right: 4px;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.speech-alert-close:hover {
  opacity: 1;
}

@keyframes speechToastSlide {
  from { opacity: 0; transform: translate(-50%, 15px) scale(0.94); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
`;

if (!css.includes('.speech-alert-toast')) {
  css += '\n' + speechToastCss;
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('Added .speech-alert-toast CSS to style.css');
}

// 2. Update rtlmd.js
const jsPath = path.join(__dirname, '..', 'app', 'js', 'rtlmd.js');
let js = fs.readFileSync(jsPath, 'utf8');

const targetSpeakText = `  function speakText(text, explicitLang, callbacks = {}) {
    if (!text || typeof speechSynthesis === 'undefined') {
      if (callbacks.onError) callbacks.onError(new Error('SpeechSynthesis not available'));
      return null;
    }

    let lang = explicitLang;
    if (!lang) {
      if (vienixSettings.targetLanguage && vienixSettings.targetLanguage !== 'auto') {
        lang = vienixSettings.targetLanguage;
      } else {
        lang = detectLanguage(text) || 'de-AT';
      }
    }

    const cleanSpeech = text.replace(/[*_#\`~[\\]()]/g, ' ').replace(/\\s+/g, ' ').trim();
    if (!cleanSpeech) return null;

    window._isPronunciationSpeaking = true;

    // Chromium safe cancel
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
    }

    // Delay 35ms to bypass Chromium cancel-speak race condition
    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(cleanSpeech);
        utterance.lang = lang;
        utterance.rate = Math.max(0.5, Math.min(2.0, parseFloat(vienixSettings.speechRate) || 0.8));
        utterance.pitch = Math.max(0.5, Math.min(1.5, parseFloat(vienixSettings.speechPitch) || 1.0));
        utterance.volume = Math.max(0, Math.min(1.0, parseFloat(vienixSettings.speechVolume) || 1.0));

        const matchedVoice = pickBestVoice(lang);
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }

        // Anchor in window array to prevent Chrome GC bug
        window._activeUtterances.push(utterance);

        utterance.onstart = () => {
          window._isPronunciationSpeaking = true;
          if (callbacks.onStart) callbacks.onStart();
        };

        utterance.onboundary = (event) => {
          if (event.name === 'word' && callbacks.onWordBoundary) {
            callbacks.onWordBoundary(event.charIndex, event.charLength);
          }
        };
        const cleanup = () => {
          window._isPronunciationSpeaking = false;
          const idx = window._activeUtterances.indexOf(utterance);
          if (idx > -1) window._activeUtterances.splice(idx, 1);
        };

        utterance.onend = () => {
          cleanup();
          if (callbacks.onEnd) callbacks.onEnd();
        };

        utterance.onerror = (err) => {
          cleanup();
          console.warn('Speech error:', err);
          if (callbacks.onError) callbacks.onError(err);
        };

        speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('Speech synthesis execution failed:', err);
        if (callbacks.onError) callbacks.onError(err);
      }
    }, 35);
  }`;

const replacementSpeakText = `  function showSpeechWarningToast(msg) {
    let existing = document.getElementById('vienix-speech-alert');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'vienix-speech-alert';
    toast.className = 'speech-alert-toast';
    toast.innerHTML = \`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <span>\${msg}</span>
      <button type="button" class="speech-alert-close" onclick="this.parentElement.remove()" title="إغلاق">✕</button>
    \`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -15px)';
      setTimeout(() => toast.remove(), 400);
    }, 5500);
  }
  window.showSpeechWarningToast = showSpeechWarningToast;

  function speakText(text, explicitLang, callbacks = {}) {
    if (!text || typeof speechSynthesis === 'undefined' || !window.speechSynthesis) {
      showSpeechWarningToast('متصفحك الحالي يقيّد النطق الصوتي، يُرجى استخدام Chrome أو تفعيل حزمة الصوت من إعدادات الهاتف ⚠️');
      if (callbacks.onError) callbacks.onError(new Error('SpeechSynthesis not available'));
      return null;
    }

    let lang = explicitLang;
    if (!lang) {
      if (vienixSettings.targetLanguage && vienixSettings.targetLanguage !== 'auto') {
        lang = vienixSettings.targetLanguage;
      } else {
        lang = detectLanguage(text) || 'de-AT';
      }
    }

    const cleanSpeech = text.replace(/[*_#\`~[\\]()]/g, ' ').replace(/\\s+/g, ' ').trim();
    if (!cleanSpeech) return null;

    window._isPronunciationSpeaking = true;

    try {
      // Direct cancel of previous speech
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(cleanSpeech);
      utterance.lang = lang;
      utterance.rate = Math.max(0.5, Math.min(2.0, parseFloat(vienixSettings.speechRate) || 0.8));
      utterance.pitch = Math.max(0.5, Math.min(1.5, parseFloat(vienixSettings.speechPitch) || 1.0));
      utterance.volume = Math.max(0, Math.min(1.0, parseFloat(vienixSettings.speechVolume) || 1.0));

      const matchedVoice = pickBestVoice(lang);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      // Anchor in window array to prevent Chrome GC bug
      window._activeUtterances.push(utterance);

      utterance.onstart = () => {
        window._isPronunciationSpeaking = true;
        if (callbacks.onStart) callbacks.onStart();
      };

      utterance.onboundary = (event) => {
        if (event.name === 'word' && callbacks.onWordBoundary) {
          callbacks.onWordBoundary(event.charIndex, event.charLength);
        }
      };

      const cleanup = () => {
        window._isPronunciationSpeaking = false;
        const idx = window._activeUtterances.indexOf(utterance);
        if (idx > -1) window._activeUtterances.splice(idx, 1);
      };

      utterance.onend = () => {
        cleanup();
        if (callbacks.onEnd) callbacks.onEnd();
      };

      utterance.onerror = (err) => {
        cleanup();
        console.warn('Speech error:', err);
        if (err && err.error && err.error !== 'canceled' && err.error !== 'interrupted') {
          showSpeechWarningToast('متصفحك الحالي يقيّد النطق الصوتي، يُرجى استخدام Chrome أو تفعيل حزمة الصوت من إعدادات الهاتف ⚠️');
        }
        if (callbacks.onError) callbacks.onError(err);
      };

      // Call speechSynthesis.speak immediately in the synchronous user interaction frame
      speechSynthesis.speak(utterance);

      // On Android / MIUI: resume if engine started in paused state
      if (speechSynthesis.paused) {
        speechSynthesis.resume();
      }
    } catch (err) {
      window._isPronunciationSpeaking = false;
      console.error('Speech synthesis execution failed:', err);
      showSpeechWarningToast('متصفحك الحالي يقيّد النطق الصوتي، يُرجى استخدام Chrome أو تفعيل حزمة الصوت من إعدادات الهاتف ⚠️');
      if (callbacks.onError) callbacks.onError(err);
    }
  }`;

const normTarget = targetSpeakText.replace(/\r\n/g, '\n');
const normJs = js.replace(/\r\n/g, '\n');

if (normJs.includes(normTarget)) {
  const updatedJs = normJs.replace(normTarget, replacementSpeakText.replace(/\r\n/g, '\n'));
  fs.writeFileSync(jsPath, updatedJs, 'utf8');
  console.log('Successfully updated speakText with zero-delay and warning toast');
} else {
  console.error('Target speakText not found in rtlmd.js');
}
