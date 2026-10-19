const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, '..', 'app', 'js', 'rtlmd.js');
let content = fs.readFileSync(jsPath, 'utf8');

const targetFunction = `  // التبديل بين وضع القراءة ووضع التحرير المباشر
  window.toggleWysiwygPreviewMode = function () {
    isWysiwygActive = !isWysiwygActive;
    const btn = document.getElementById('btn-toggle-wysiwyg');

    if (isWysiwygActive) {
      // تفعيل وضع التحرير المباشر
      if (btn) {
        btn.classList.add('active');
        btn.title = 'إلغاء وضع التحرير المباشر وحفظ التغييرات (Edit Preview: ON)';
      }
      previewContent.setAttribute('contenteditable', 'true');
      previewContent.classList.add('preview-editable');

      // حماية المخططات والأزرار الداخلية من التعديل
      protectNonEditableElements();

      // تمييز ترويسة المعاينة
      updatePreviewHeaderIndicator(true);

      if (saveStatus) {
        saveStatus.textContent = 'وضع التحرير المباشر مفعّل — انقر للتعديل';
        saveStatus.className = 'save-badge';
      }
    } else {
      // إيقاف وضع التحرير المباشر
      if (btn) {
        btn.classList.remove('active');
        btn.title = 'تبديل وضع تحرير المعاينة المباشر (Edit Preview: OFF)';
      }
      previewContent.removeAttribute('contenteditable');
      previewContent.classList.remove('preview-editable');

      hideFloatingFormatToolbar();
      updatePreviewHeaderIndicator(false);

      // مزامنة أخيرة للمحتوى المعدل
      syncPreviewToMarkdown(true);

      // إعادة تصيير المعاينة لضمان سلامة الهايلايت والأكواد والمخططات
      renderMarkdown();

      if (saveStatus) {
        saveStatus.textContent = 'تم الحفظ تلقائياً ✓';
        saveStatus.className = 'save-badge';
      }
    }
  };`;

const replacementFunction = `  // التبديل بين وضع القراءة ووضع التحرير المباشر
  window.toggleWysiwygPreviewMode = function () {
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
      previewContent.setAttribute('contenteditable', 'true');
      previewContent.classList.add('preview-editable');

      // حماية المخططات والأزرار الداخلية من التعديل
      protectNonEditableElements();

      // تمييز ترويسة المعاينة
      updatePreviewHeaderIndicator(true);

      if (saveStatus) {
        saveStatus.textContent = 'وضع التحرير المباشر مفعّل — انقر للتعديل';
        saveStatus.className = 'save-badge';
      }
    } else {
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
      previewContent.removeAttribute('contenteditable');
      previewContent.classList.remove('preview-editable');

      hideFloatingFormatToolbar();
      updatePreviewHeaderIndicator(false);

      // مزامنة أخيرة للمحتوى المعدل
      syncPreviewToMarkdown(true);

      // إعادة تصيير المعاينة لضمان سلامة الهايلايت والأكواد والمخططات
      renderMarkdown();

      if (saveStatus) {
        saveStatus.textContent = 'تم الحفظ تلقائياً ✓';
        saveStatus.className = 'save-badge';
      }
    }
  };`;

// Normalize CRLF to LF for comparison if needed
const normalizedTarget = targetFunction.replace(/\r\n/g, '\n');
const normalizedContent = content.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTarget)) {
  const updatedNormalized = normalizedContent.replace(normalizedTarget, replacementFunction.replace(/\r\n/g, '\n'));
  
  // Also add makeDraggable
  const targetDrag = `    makeDraggable('floating-dock-wrapper',         'vienix_dock_pos');
    makeDraggable('classic-floating-dock-wrapper', 'vienix_classic_dock_pos');`;
  const replacementDrag = `    makeDraggable('floating-dock-wrapper',         'vienix_dock_pos');
    makeDraggable('preview-floating-dock-wrapper', 'vienix_preview_dock_pos');
    makeDraggable('classic-floating-dock-wrapper', 'vienix_classic_dock_pos');`;

  const finalContent = updatedNormalized.replace(targetDrag, replacementDrag);
  fs.writeFileSync(jsPath, finalContent, 'utf8');
  console.log('Successfully updated toggleWysiwygPreviewMode and initDrag in rtlmd.js');
} else {
  console.error('Target function not found in rtlmd.js');
}
