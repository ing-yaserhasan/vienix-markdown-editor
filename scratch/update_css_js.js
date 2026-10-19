const fs = require('fs');
const path = require('path');

// 1. Update app/css/style.css
const cssPath = path.join(__dirname, '..', 'app', 'css', 'style.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

// Update .brand-titles and .brand-title
const oldBrandCss = `.brand-titles {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}`;

const newBrandCss = `.brand-titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.brand-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}`;

if (cssContent.includes('.brand-titles {')) {
  cssContent = cssContent.replace(
    /\.brand-titles\s*\{[\s\S]*?\.brand-title\s*\{[\s\S]*?gap:\s*6px;\s*\}/,
    newBrandCss
  );
  console.log('Updated brand-titles in style.css');
}

// Add Preview Header Buttons and Dock CSS
const previewHeaderCss = `
/* ترويسة نافذة المعاينة مع أزرار التحكم للموبايل */
.preview-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-header-btn {
  display: none; /* مخفي على الكمبيوتر افتراضياً */
  align-items: center;
  gap: 5px;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 4px 9px;
  border-radius: 7px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.16s ease;
  line-height: 1.25;
  user-select: none;
}

.preview-header-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.preview-header-btn.active {
  background: #6366f1;
  color: #ffffff !important;
  border-color: #6366f1;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

.preview-header-btn.active svg {
  color: #ffffff !important;
}

[data-theme="dark"] .preview-header-btn {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.14);
}

[data-theme="dark"] .preview-header-btn.active {
  background: #6366f1;
  color: #ffffff !important;
}

/* كونتينر الأدوات العائم في شاشة العرض المعاينة عند تفعيل Edit */
.preview-floating-dock {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 45;
  animation: previewDockSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.24);
  border-radius: 10px;
}

@keyframes previewDockSlideIn {
  from { opacity: 0; transform: translate(-50%, 14px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
`;

if (!cssContent.includes('.preview-header-btn')) {
  cssContent = cssContent.replace(
    /\.panel-header\s*\.badge\s*\{[\s\S]*?\}/,
    match => match + '\n' + previewHeaderCss
  );
  console.log('Added preview-header-btn CSS');
}

// Update .pronunciation-phrase from inline-block to inline
if (cssContent.includes('display: inline-block;') && cssContent.includes('.pronunciation-phrase')) {
  cssContent = cssContent.replace(
    /\.pronunciation-phrase\s*\{\s*display:\s*inline-block;/g,
    '.pronunciation-phrase {\n  display: inline;'
  );
  console.log('Updated pronunciation-phrase display to inline');
}

// Update @media (max-width: 768px) to show preview buttons and hide preview-mode-badge
const mobileMedia768 = `
  /* ترويسة المعاينة على الموبايل: إظهار زري المستكشف و Edit وإخفاء شارة ميرميد */
  .panel-header #preview-mode-badge {
    display: none !important;
  }
  .preview-header-btn {
    display: inline-flex !important;
  }
`;

if (!cssContent.includes('.panel-header #preview-mode-badge')) {
  cssContent = cssContent.replace(
    /@media\s*\(max-width:\s*768px\)\s*\{/,
    match => match + '\n' + mobileMedia768
  );
  console.log('Added 768px media rules for preview header buttons');
}

// Update @media (max-width: 480px) and @media (max-width: 600px)
const mobileBrandRules = `
  .brand-suffix {
    display: none !important;
  }
  .header-actions .btn-outline-classic {
    display: none !important;
  }
`;

if (!cssContent.includes('.brand-suffix {')) {
  cssContent = cssContent.replace(
    /@media\s*\(max-width:\s*480px\)\s*\{/,
    match => match + '\n' + mobileBrandRules
  );
  console.log('Added 480px media rules for brand-suffix and classic button');
}

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log('style.css saved successfully.');

// 2. Update app/js/rtlmd.js
const jsPath = path.join(__dirname, '..', 'app', 'js', 'rtlmd.js');
let jsContent = fs.readFileSync(jsPath, 'utf8');

// Update toggleWysiwygPreviewMode to control previewHeaderBtn and previewDock
const oldToggleWysiwygRegex = /window\.toggleWysiwygPreviewMode\s*=\s*function\s*\(\)\s*\{[\s\S]*?isWysiwygActive\s*=\s*!isWysiwygActive;[\s\S]*?const btn = document\.getElementById\('btn-toggle-wysiwyg'\);[\s\S]*?if \(isWysiwygActive\) \{[\s\S]*?if \(btn\) \{[\s\S]*?btn\.classList\.add\('active'\);[\s\S]*?\}[\s\S]*?previewContent\.setAttribute\('contenteditable',\s*'true'\);/;

const newToggleWysiwygStart = `window.toggleWysiwygPreviewMode = function () {
    isWysiwygActive = !isWysiwygActive;
    const btn = document.getElementById('btn-toggle-wysiwyg');
    const previewHeaderBtn = document.getElementById('btn-preview-header-edit');
    const previewDock = document.getElementById('preview-floating-dock-wrapper');

    if (isWysiwygActive) {
      // تفعيل وضع التحرير المباشر
      if (btn) {
        btn.classList.add('active');
        btn.title = 'إلغاء وضع التحرير المباشر وحفظ التغييرات (Edit Preview: ON)';
      }
      if (previewHeaderBtn) {
        previewHeaderBtn.classList.add('active');
        previewHeaderBtn.title = 'إلغاء وضع التحرير المباشر (Edit Preview: ON)';
      }
      if (previewDock) {
        previewDock.style.display = 'flex';
      }
      previewContent.setAttribute('contenteditable', 'true');`;

if (oldToggleWysiwygRegex.test(jsContent)) {
  jsContent = jsContent.replace(oldToggleWysiwygRegex, newToggleWysiwygStart);
  console.log('Updated toggleWysiwygPreviewMode (active branch) in rtlmd.js');
} else {
  console.log('Pattern for toggleWysiwygPreviewMode active branch not matched');
}

// Update toggleWysiwygPreviewMode inactive branch
const oldInactiveBranchRegex = /\} else \{[\s\S]*?\/\/ إيقاف وضع التحرير المباشر[\s\S]*?if \(btn\) \{[\s\S]*?btn\.classList\.remove\('active'\);[\s\S]*?\}[\s\S]*?previewContent\.removeAttribute\('contenteditable'\);/;

const newInactiveBranch = `} else {
      // إيقاف وضع التحرير المباشر
      if (btn) {
        btn.classList.remove('active');
        btn.title = 'تبديل وضع تحرير المعاينة المباشر (Edit Preview: OFF)';
      }
      if (previewHeaderBtn) {
        previewHeaderBtn.classList.remove('active');
        previewHeaderBtn.title = 'تعديل من واجهة العرض (Edit Preview)';
      }
      if (previewDock) {
        previewDock.style.display = 'none';
      }
      previewContent.removeAttribute('contenteditable');`;

if (oldInactiveBranchRegex.test(jsContent)) {
  jsContent = jsContent.replace(oldInactiveBranchRegex, newInactiveBranch);
  console.log('Updated toggleWysiwygPreviewMode (inactive branch) in rtlmd.js');
} else {
  console.log('Pattern for toggleWysiwygPreviewMode inactive branch not matched');
}

// Make preview-floating-dock-wrapper draggable
if (!jsContent.includes("'preview-floating-dock-wrapper'")) {
  jsContent = jsContent.replace(
    /makeDraggable\('floating-dock-wrapper',\s*'vienix_dock_pos'\);/,
    "makeDraggable('floating-dock-wrapper',         'vienix_dock_pos');\n    makeDraggable('preview-floating-dock-wrapper', 'vienix_preview_dock_pos');"
  );
  console.log('Added makeDraggable for preview-floating-dock-wrapper');
}

fs.writeFileSync(jsPath, jsContent, 'utf8');
console.log('rtlmd.js saved successfully.');
