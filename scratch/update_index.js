const fs = require('fs');
const path = require('path');

// 1. Update index.html
const indexPath = path.join(__dirname, '..', 'index.html');
let indexContent = fs.readFileSync(indexPath, 'utf8');

// Brand title update
const oldBrandTitle = `<div class="brand-title">
            <span>Vienix Markdown Editor</span>
            <span class="badge-tag">RTL Pro</span>
          </div>`;

const newBrandTitle = `<div class="brand-title">
            <span class="brand-name">Vienix</span>
            <span class="brand-suffix">Markdown Editor</span>
            <span class="badge-tag">RTL Pro</span>
          </div>`;

if (indexContent.includes('<span>Vienix Markdown Editor</span>')) {
  indexContent = indexContent.replace(
    /<span>Vienix Markdown Editor<\/span>/,
    '<span class="brand-name">Vienix</span>\n            <span class="brand-suffix">Markdown Editor</span>'
  );
  console.log('Updated brand-title in index.html');
} else {
  console.log('brand-title already updated or pattern not found');
}

// Panel preview header & dock update
const oldPanelPreviewRegex = /<section class="panel panel-preview" id="panel-preview">[\s\S]*?<div class="panel-header">[\s\S]*?<span>المعاينة المباشرة \(Live Preview\)<\/span>[\s\S]*?<span class="badge" id="preview-mode-badge">Mermaid & HTML<\/span>[\s\S]*?<\/div>[\s\S]*?<div class="preview-container" id="preview-output">[\s\S]*?<article class="markdown-body" id="preview-content">[\s\S]*?<!-- Rendered Output -->[\s\S]*?<\/article>[\s\S]*?<\/div>[\s\S]*?<\/section>/;

const newPanelPreview = `<section class="panel panel-preview" id="panel-preview">
        <div class="panel-header">
          <span class="panel-preview-title">المعاينة المباشرة (Live Preview)</span>
          <div class="preview-header-actions">
            <!-- زر Edit لتحرير المعاينة المباشر (يظهر في وضع الموبايل) -->
            <button type="button" class="preview-header-btn preview-edit-btn" id="btn-preview-header-edit" onclick="toggleWysiwygPreviewMode()" title="تعديل من واجهة العرض (Edit Preview)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>Edit</span>
            </button>
            <!-- زر المستكشف في شاشة العرض (يحل محل شارة ميرميد في وضع الموبايل) -->
            <button type="button" class="preview-header-btn preview-explorer-btn" id="btn-preview-header-explorer" onclick="toggleChambersExplorer()" title="فتح المستكشف (تفرعات المجلدات والحجرات)">
              <svg class="win-folder-svg" viewBox="0 0 24 24" width="15" height="15" fill="none">
                <path d="M2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H9.2C9.7 3.5 10.2 3.7 10.6 4.1L12.4 5.9C12.8 6.3 13.3 6.5 13.8 6.5H19.5C20.6 6.5 21.5 7.4 21.5 8.5V10H2.5V5.5Z" fill="#D97706"/>
                <path d="M3 8.5H21V18C21 19.1 20.1 20 19 20H5C3.9 20 3 19.1 3 18V8.5Z" fill="#FDE68A"/>
                <path d="M2 9.5C2 8.67 2.67 8 3.5 8H20.5C21.33 8 22 8.67 22 9.5V18C22 19.38 20.88 20.5 19.5 20.5H4.5C3.12 20.5 2 19.38 2 18V9.5Z" fill="url(#winFolderGrad)"/>
              </svg>
              <span>المستكشف</span>
            </button>
            <!-- شارة وضع ميرميد على الكمبيوتر -->
            <span class="badge" id="preview-mode-badge">Mermaid & HTML</span>
          </div>
        </div>
        <div class="preview-container" id="preview-output">
          <article class="markdown-body" id="preview-content">
            <!-- Rendered Output -->
          </article>
        </div>

        <!-- كونتينر أدوات اللصق والحذف والتراجع والتالي في شاشة العرض عند تفعيل Edit -->
        <div class="floating-dock-wrapper preview-floating-dock" id="preview-floating-dock-wrapper" style="display: none;">
          <div class="editor-floating-actions" id="preview-floating-actions">
            <!-- 1. التالي (Redo) -->
            <button class="floating-tool-btn" id="btn-preview-redo" onclick="redoAction()" title="التالي (إعادة الخطوة - Ctrl+Y)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 14 20 9 15 4"></polyline>
                <path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>
              </svg>
            </button>
            <!-- 2. السابق (Undo) -->
            <button class="floating-tool-btn" id="btn-preview-undo" onclick="undoAction()" title="السابق (تراجع - Ctrl+Z)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4"></polyline>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
              </svg>
            </button>
            <!-- 3. تصفير (مسح المحتوى الحالي) -->
            <button class="floating-tool-btn danger" id="btn-preview-clear" onclick="clearWorkspaceContent()" title="تصفير (مسح المحتوى الحالي)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
            <!-- 4. لصق (لصق من الحافظة) -->
            <button class="floating-tool-btn" id="btn-preview-paste" onclick="pasteWorkspaceContent()" title="لصق من الحافظة (Ctrl+V)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
            </button>
          </div>
        </div><!-- /.preview-floating-dock -->
      </section>`;

if (oldPanelPreviewRegex.test(indexContent)) {
  indexContent = indexContent.replace(oldPanelPreviewRegex, newPanelPreview);
  console.log('Updated panel-preview in index.html');
} else {
  console.error('oldPanelPreviewRegex did not match');
}

fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log('index.html saved successfully.');
