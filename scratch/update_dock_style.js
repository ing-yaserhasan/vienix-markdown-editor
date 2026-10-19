const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'app', 'css', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

const oldDockCssRegex = /\/\* كونتينر الأدوات العائم في شاشة العرض المعاينة عند تفعيل Edit \*\/[\s\S]*?@keyframes previewDockSlideIn\s*\{[\s\S]*?\}/;

const newDockCss = `/* كونتينر الأدوات العائم في شاشة العرض المعاينة عند تفعيل Edit */
.preview-floating-dock {
  position: absolute !important;
  bottom: 24px !important;
  left: 50% !important;
  right: auto !important;
  transform: translateX(-50%) !important;
  z-index: 50 !important;
  margin: 0 !important;
  animation: previewDockSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.preview-floating-dock .editor-floating-actions {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 6px 12px !important;
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 30px !important;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  backdrop-filter: blur(12px);
}

[data-theme="dark"] .preview-floating-dock .editor-floating-actions {
  background: rgba(30, 41, 59, 0.95) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
}

@keyframes previewDockSlideIn {
  from { opacity: 0; transform: translate(-50%, 14px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}`;

if (oldDockCssRegex.test(css)) {
  css = css.replace(oldDockCssRegex, newDockCss);
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('Successfully updated preview-floating-dock styles in style.css');
} else {
  console.error('oldDockCssRegex not matched');
}
