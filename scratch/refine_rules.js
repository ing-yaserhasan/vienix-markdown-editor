const fs = require('fs');
const path = require('path');

// 1. index.html - Add dir="ltr" to .brand-title
const indexPath = path.join(__dirname, '..', 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

indexHtml = indexHtml.replace(
  '<div class="brand-title">',
  '<div class="brand-title" dir="ltr">'
);

fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('Updated index.html with dir="ltr" on brand-title');

// 2. style.css - Add direction: ltr on .brand-title and desktop hide for .preview-floating-dock
const cssPath = path.join(__dirname, '..', 'app', 'css', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

css = css.replace(
  /\.brand-title\s*\{[\s\S]*?font-size:\s*1\.15rem;/,
  `.brand-title {
  direction: ltr;
  font-size: 1.15rem;`
);

const desktopDockHide = `
/* إخفاء كونتينر أدوات المعاينة على الكمبيوتر (مخصص لوضع الموبايل فقط) */
@media (min-width: 769px) {
  .preview-floating-dock {
    display: none !important;
  }
  .preview-header-btn {
    display: none !important;
  }
  .panel-header #preview-mode-badge {
    display: inline-block !important;
  }
}
`;

if (!css.includes('/* إخفاء كونتينر أدوات المعاينة على الكمبيوتر')) {
  css += '\n' + desktopDockHide;
}

fs.writeFileSync(cssPath, css, 'utf8');
console.log('Updated style.css with desktop rules and brand direction');
