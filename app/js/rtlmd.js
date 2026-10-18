/**
 * Vienix Markdown Editor - Core Application Logic
 * Supports: Arabic RTL, Mermaid Diagrams, Syntax Highlighting, Offline Mode,
 * Copying, and Exporting to PDF, DOCX, HTML, MD.
 */

(function () {
  'use strict';

  // DOM Elements
  const editor = document.getElementById('markdown-input');
  const preview = document.getElementById('preview-output');
  const previewContent = document.getElementById('preview-content');
  const workspace = document.getElementById('workspace');

  // Stats Elements
  const statWords = document.getElementById('stat-words');
  const statChars = document.getElementById('stat-chars');
  const statReadingTime = document.getElementById('stat-reading-time');
  const saveStatus = document.getElementById('save-status');

  // Storage key helper with fallback for seamless compatibility
  function getStored(key, legacyKey) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
      if (legacyKey) return localStorage.getItem(legacyKey);
    } catch (e) {}
    return null;
  }

  // Theme & Settings
  let isDarkMode = (getStored('vienix_theme', 'yaser_theme')) === 'dark';
  let isSyncScroll = (getStored('vienix_sync_scroll', 'yaser_sync_scroll')) !== 'false';
  let renderDebounceTimer = null;
  let isUpdatingScroll = false;

  // History Stack for Undo / Redo & Editor Actions (السابق والتالي)
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 80;
  let historyDebounceTimer = null;
  let isPerformingHistory = false;

  // Mode state: Modern vs Classic
  let isClassicMode = (getStored('vienix_classic_mode', 'yaser_classic_mode')) === 'true';
  const classicEditor = document.getElementById('classic-markdown-input');
  const classicOutput = document.getElementById('classic-output');

  // Chambers System (نظام الحجرات التخزينية والمطابقة)
  const TOTAL_CHAMBERS = 8;
  let activeChamber = parseInt(getStored('vienix_active_chamber', 'yaser_active_chamber') || '1', 10);
  if (isNaN(activeChamber) || activeChamber < 1 || activeChamber > TOTAL_CHAMBERS) {
    activeChamber = 1;
  }

  // Initialize Application
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMermaid();
    initMarked();
    setupEventListeners();
    loadInitialContent();
    setupDraggableFloatingActions();
    setupWorkspaceResizer();
    initResponsiveMode();
    initWysiwygPreviewSystem();
  });

  // Responsive mode initialization
  let wasMobileView = window.innerWidth <= 768;
  function initResponsiveMode() {
    if (window.innerWidth <= 768) {
      setViewMode('editor');
      setClassicMobileTab('editor');
    }
    function checkLayout() {
      const isMobile = window.innerWidth <= 768;
      if (isMobile && !wasMobileView) {
        if (!workspace.classList.contains('mode-preview-only')) {
          setViewMode('editor');
        }
        setClassicMobileTab('editor');
        syncClassicTogglePosition();
      } else if (!isMobile && wasMobileView) {
        setViewMode('split');
        syncClassicTogglePosition();
      }
      wasMobileView = isMobile;
    }
    window.addEventListener('resize', checkLayout);
  }

  // Initialize Theme
  function initTheme() {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      updateThemeIcon(true);
    } else {
      document.documentElement.removeAttribute('data-theme');
      updateThemeIcon(false);
    }
  }

  function updateThemeIcon(dark) {
    const iconContainer = document.getElementById('theme-toggle-icon');
    if (!iconContainer) return;
    if (dark) {
      // Sun icon
      iconContainer.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      `;
    } else {
      // Moon icon
      iconContainer.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      `;
    }
  }

  // Toggle Theme
  window.toggleTheme = function () {
    isDarkMode = !isDarkMode;
    try {
      localStorage.setItem('vienix_theme', isDarkMode ? 'dark' : 'light');
      localStorage.setItem('yaser_theme', isDarkMode ? 'dark' : 'light');
    } catch (e) {}
    initTheme();
    initMermaid();
    renderMarkdown();
    showToast(isDarkMode ? 'تم تفعيل الوضع الليلي 🌙' : 'تم تفعيل الوضع النهاري ☀️', 'info');
  };

  // Cache for rendered Mermaid SVGs to ensure lightning-fast performance
  const mermaidSvgCache = new Map();

  // Initialize Mermaid
  function initMermaid() {
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDarkMode ? 'dark' : 'default',
        securityLevel: 'loose',
        suppressErrorRendering: true,
        // ضبط الخط على نفس خط التطبيق لضمان حساب حجم العقدة بالخط الصحيح
        fontFamily: "'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 16,
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          // زيادة الـ padding لمنع اقتصاص السطر الثاني بعد <br/>
          padding: 20,
          nodeSpacing: 50,
          rankSpacing: 60
        }
      });
      // مسح الكاش عند إعادة التهيئة (تبديل الثيم أو تحميل الخط)
      mermaidSvgCache.clear();
    }
  }

  // Initialize Marked with custom image sizing support
  function initMarked() {
    if (typeof marked !== 'undefined') {
      const renderer = new marked.Renderer();

      // دعم أبعاد ومقاسات الصور المخصصة في الماركداون: ![alt|450px](url) أو ![alt](url =450x)
      renderer.image = function (href, title, text) {
        let width = '';
        let cleanText = text || '';
        const match = cleanText.match(/^(.*?)\|(\d+%?|\d+px)$/);
        if (match) {
          cleanText = match[1];
          width = match[2];
          if (!width.endsWith('%') && !width.endsWith('px')) {
            width += 'px';
          }
        }

        const hrefMatch = href ? href.match(/^(.*?)\s+=(\d+%?|\d+px)?(?:x(\d+%?|\d+px)?)?$/) : null;
        if (hrefMatch) {
          href = hrefMatch[1];
          if (hrefMatch[2]) {
            width = hrefMatch[2];
            if (!width.endsWith('%') && !width.endsWith('px')) {
              width += 'px';
            }
          }
        }

        const styleAttr = width ? ` style="width: ${width}; max-width: 100%;"` : '';
        const widthAttr = width ? ` width="${width}"` : '';
        let out = `<img src="${href}" alt="${cleanText}"${widthAttr}${styleAttr}`;
        if (title) {
          out += ` title="${title}"`;
        }
        out += '>';
        return out;
      };

      marked.setOptions({
        gfm: true,
        breaks: true,
        renderer: renderer
      });
    }
  }

  // Safe localStorage helper to prevent quota exceeded exceptions from interrupting app execution
  function safeSaveToStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`تعذر حفظ البيانات في localStorage (${key}):`, e);
    }
  }

  // ==========================================
  // CHAMBERS CORE STORAGE & METADATA HELPERS
  // ==========================================

  // الحصول على محتوى حجرة معينة
  function getChamberContent(chNum) {
    let content = getStored('vienix_chamber_' + chNum, 'yaser_chamber_' + chNum);
    // هجرة ذكية: إذا كانت الحجرة 1 فارغة، نتحقق من وجود محتوى في المفتاح القديم
    if (chNum === 1 && content === null) {
      const legacy = getStored('vienix_md_content', 'yaser_md_content');
      if (legacy !== null && legacy.trim().length > 0) {
        content = legacy;
        safeSaveToStorage('vienix_chamber_1', legacy);
        safeSaveToStorage('yaser_chamber_1', legacy);
      }
    }
    return content !== null ? content : '';
  }

  // الحصول على الميتاداتا والتسمية المخصصة والمجلد لكل حجرة
  function getChamberMeta(chNum) {
    chNum = parseInt(chNum, 10);
    const raw = getStored('vienix_chamber_meta_' + chNum, 'yaser_chamber_meta_' + chNum);
    let meta = null;
    if (raw) {
      try {
        meta = JSON.parse(raw);
      } catch (e) {
        meta = null;
      }
    }
    if (!meta || typeof meta !== 'object') {
      meta = {
        customTitle: '',
        folder: chNum <= 7 ? 'book' : 'drafts',
        updatedAt: Date.now() - (TOTAL_CHAMBERS - chNum) * 120000,
        words: 0,
        chars: 0
      };
    }
    return meta;
  }

  // حفظ الميتاداتا
  function saveChamberMeta(chNum, meta) {
    chNum = parseInt(chNum, 10);
    const jsonStr = JSON.stringify(meta);
    safeSaveToStorage('vienix_chamber_meta_' + chNum, jsonStr);
    safeSaveToStorage('yaser_chamber_meta_' + chNum, jsonStr);
  }

  // ترحيل تلقائي: نقل الحجرتين 6 و 7 افتراضياً إلى المجلد الرئيسي
  (function migrateChambers67ToMainFolder() {
    try {
      const migrated = localStorage.getItem('vienix_chambers_6_7_to_book_v1');
      if (!migrated) {
        [6, 7].forEach(num => {
          const m = getChamberMeta(num);
          if (m && (!m.folder || m.folder === 'drafts')) {
            m.folder = 'book';
            saveChamberMeta(num, m);
          }
        });
        localStorage.setItem('vienix_chambers_6_7_to_book_v1', 'true');
      }
    } catch (e) {}
  })();

  // تحديث إحصائيات الحجرة التلقائية
  function updateChamberMetaStats(chNum, content) {
    chNum = parseInt(chNum, 10);
    const text = typeof content === 'string' ? content : (getChamberContent(chNum) || '');
    const meta = getChamberMeta(chNum);
    const textWithoutDataUrls = text.replace(/data:image\/[^"')\s]+/g, '[صورة]');
    const trimmed = textWithoutDataUrls.trim();
    const words = trimmed ? (trimmed.match(/[\w\u0600-\u06FF]+/g) || []).length : 0;
    meta.words = words;
    meta.chars = trimmed.length;
    meta.updatedAt = Date.now();
    saveChamberMeta(chNum, meta);
  }

  // تعيين اسم مخصص للحجرة
  window.setChamberCustomTitle = function (chNum, newTitle) {
    chNum = parseInt(chNum, 10);
    const meta = getChamberMeta(chNum);
    meta.customTitle = (newTitle || '').trim();
    saveChamberMeta(chNum, meta);
    updateChambersUI();
    if (typeof renderChambersExplorerTree === 'function') {
      renderChambersExplorerTree();
    }
    showToast(`تم حفظ مسمى الحجرة ${chNum} بنجاح! ✏️`, 'success', 1200);
  };

  // نقل الحجرة بين المجلدات (book, drafts, archive)
  window.moveChamberToFolder = function (chNum, targetFolder) {
    chNum = parseInt(chNum, 10);
    const meta = getChamberMeta(chNum);
    meta.folder = targetFolder;
    saveChamberMeta(chNum, meta);
    if (typeof renderChambersExplorerTree === 'function') {
      renderChambersExplorerTree();
    }
    const folderNames = { book: 'فصول الكتاب', drafts: 'المسودات', archive: 'الأرشيف' };
    showToast(`تم نقل الحجرة ${chNum} إلى ${folderNames[targetFolder] || targetFolder} 📂`, 'info', 1200);
  };

  // إدارة الملف المعروض حالياً في حجرة رقم 8 المخصصة
  let activeExplorerFile = null;
  try {
    const savedActive = localStorage.getItem('vienix_active_explorer_file');
    if (savedActive) activeExplorerFile = JSON.parse(savedActive);
  } catch (e) {}

  function syncActiveExplorerFile(content) {
    if (!activeExplorerFile || !activeExplorerFile.folderKey || !activeExplorerFile.fileId) return;
    const files = getFolderFiles(activeExplorerFile.folderKey);
    const file = files.find(f => f.id === activeExplorerFile.fileId);
    if (!file) return;
    file.content = content || '';
    const textWithoutDataUrls = (content || '').replace(/data:image\/[^"')\s]+/g, '[صورة]');
    const trimmed = textWithoutDataUrls.trim();
    file.words = trimmed ? (trimmed.match(/[\w\u0600-\u06FF]+/g) || []).length : 0;
    file.chars = trimmed.length;
    file.updatedAt = Date.now();
    saveFolderFiles(activeExplorerFile.folderKey, files);
  }

  // حفظ محتوى حجرة معينة وتحديث الإحصائيات
  function setChamberContent(chNum, content) {
    safeSaveToStorage('vienix_chamber_' + chNum, content);
    safeSaveToStorage('yaser_chamber_' + chNum, content);
    if (chNum === 1) {
      safeSaveToStorage('vienix_md_content', content);
      safeSaveToStorage('yaser_md_content', content);
    }
    updateChamberMetaStats(chNum, content);
    if (typeof syncLinkedFolderFiles === 'function') {
      syncLinkedFolderFiles(chNum, content);
    }
    // مزامنة فورية إذا كان التعديل في حجرة 8 المخصصة للملفات
    if (chNum === 8 && typeof syncActiveExplorerFile === 'function') {
      syncActiveExplorerFile(content);
    }
    if (typeof isExplorerOpen !== 'undefined' && isExplorerOpen && typeof renderChambersExplorerTree === 'function') {
      renderChambersExplorerTree();
    }
  }

  // استخراج عنوان الحجرة الذكي أو المخصص
  function getChamberTitle(chNum, fallbackToAuto = true) {
    const meta = getChamberMeta(chNum);
    if (meta && meta.customTitle && meta.customTitle.trim().length > 0) {
      return meta.customTitle.trim();
    }
    if (!fallbackToAuto) return '';

    const text = getChamberContent(chNum).trim();
    if (!text) return 'فارغة';
    const lines = text.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const clean = line.replace(/^[#\-*>]+\s*/, '').replace(/[*_~`]/g, '').trim();
      if (clean) {
        return clean.length > 25 ? clean.substring(0, 25) + '...' : clean;
      }
    }
    return `محتوى (${text.length} حرف)`;
  }

  // دالة تحويل التوقيت إلى صيغة نسبية باللغة العربية
  function formatRelativeTimeArabic(timestamp) {
    if (!timestamp) return 'الآن';
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHour / 24);

    if (diffSec < 45) return 'الآن';
    if (diffMin === 1) return 'منذ دقيقة';
    if (diffMin === 2) return 'منذ دقيقتين';
    if (diffMin < 11) return `منذ ${diffMin} دقائق`;
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    if (diffHour === 1) return 'منذ ساعة';
    if (diffHour === 2) return 'منذ ساعتين';
    if (diffHour < 24) return `منذ ${diffHour} ساعة`;
    if (diffDays === 1) return 'أمس';
    if (diffDays === 2) return 'منذ يومين';
    if (diffDays < 7) return `منذ ${diffDays} أيام`;

    const d = new Date(timestamp);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  // Load Initial Content
  function loadInitialContent() {
    const finishInit = () => {
      if (classicEditor) classicEditor.value = editor.value;
      initHistoryWithContent(editor.value);
      if (isClassicMode) {
        applyUIMode();
      }
      initChambersSystem();
    };

    const saved = getChamberContent(activeChamber);
    if (saved && saved.trim().length > 0) {
      editor.value = saved;
      renderMarkdown();
      finishInit();
    } else if (activeChamber === 1) {
      // Fetch local initcontent.md for chamber 1
      fetch('initcontent.md')
        .then((res) => {
          if (!res.ok) throw new Error('Network error');
          return res.text();
        })
        .then((data) => {
          editor.value = data;
          setChamberContent(1, data);
          renderMarkdown();
          finishInit();
        })
        .catch(() => {
          // Fallback if fetch blocked on file protocol
          editor.value = `# مرحباً بك في Vienix Markdown Editor ✨\n\nاكتب هنا نصوص الماركداون بالعربية وسيقوم المحرر بتصييرها مباشرة مع دعم المخططات والتصدير.`;
          setChamberContent(1, editor.value);
          renderMarkdown();
          finishInit();
        });
    } else {
      editor.value = '';
      renderMarkdown();
      finishInit();
    }
  }

  // Render Markdown with Mermaid & Syntax Highlighting
  function renderMarkdown() {
    const rawText = editor.value;

    // Update Stats
    updateStats(rawText);

    // Auto save status
    if (saveStatus) {
      saveStatus.textContent = 'تم الحفظ تلقائياً ✓';
      saveStatus.className = 'save-badge';
    }
    setChamberContent(activeChamber, rawText);
    updateChambersUI();

    if (typeof marked === 'undefined') {
      previewContent.textContent = rawText;
      return;
    }

    // Process Mermaid blocks before marked or parse with marked custom renderer
    const { processedText, mermaidBlocks } = extractMermaidBlocks(rawText);

    let html = marked.parse(processedText);

    // Restore Mermaid blocks placeholders with rendering wrappers
    mermaidBlocks.forEach((code, index) => {
      const placeholder = `%%MERMAID_PLACEHOLDER_${index}%%`;
      const escapedCode = escapeHtml(code.trim());
      const replacement = `
        <div class="mermaid-wrapper" data-zoom="1.0">
          <div class="diagram-zoom-controls">
            <button class="diagram-zoom-btn" onclick="zoomSingleDiagram(this, 1)" title="تكبير المخطط (توسيع النافذة)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
            <button class="diagram-zoom-btn" onclick="zoomSingleDiagram(this, -1)" title="تصغير المخطط (تضييق النافذة)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
          </div>
          <div class="mermaid" id="mermaid-node-${index}" data-diagram="${encodeURIComponent(code.trim())}">
            ${escapedCode}
          </div>
        </div>
      `;
      html = html.replace(new RegExp(`<p>\\s*${placeholder}\\s*<\\/p>|${placeholder}`, 'g'), replacement);
    });

    previewContent.innerHTML = html;

    // Render Mermaid diagrams safely
    renderMermaidNodes();

    // Syntax Highlighting on code blocks
    if (typeof Prism !== 'undefined') {
      previewContent.querySelectorAll('pre code').forEach((el) => {
        // Don't highlight mermaid
        if (!el.parentElement.classList.contains('mermaid')) {
          Prism.highlightElement(el);
        }
      });
    }

    // تفعيل أزرار نسخ الكود البرمجي في جميع خانات الأكواد
    setupCodeCopyButtons();

    // تفعيل مقابض تحجيم وتكبير/تصغير الصور التفاعلية
    setupImageResizers(previewContent);

    // إذا كان وضع التحرير المباشر مفعلاً، نحافظ على خصائص التحرير وحماية العناصر
    if (typeof isWysiwygActive !== 'undefined' && isWysiwygActive) {
      previewContent.setAttribute('contenteditable', 'true');
      previewContent.classList.add('preview-editable');
      protectNonEditableElements();
    }
  }

  // Extract Mermaid Blocks to prevent Marked from mangling syntax
  function extractMermaidBlocks(text) {
    const mermaidBlocks = [];
    const regex = /```mermaid\s*([\s\S]*?)```/gi;
    let match;
    let processedText = text;
    let index = 0;

    processedText = text.replace(regex, (fullMatch, code) => {
      mermaidBlocks.push(code);
      const placeholder = `%%MERMAID_PLACEHOLDER_${index}%%`;
      index++;
      return placeholder;
    });

    return { processedText, mermaidBlocks };
  }

  // تحويل نصوص الماركداون مع كتل Mermaid إلى HTML منسق وجاهز
  function parseMarkdownWithMermaid(rawText, idPrefix = 'diff') {
    if (!rawText) return '';
    if (typeof marked === 'undefined') return escapeHtml(rawText);

    const { processedText, mermaidBlocks } = extractMermaidBlocks(rawText);
    let html = marked.parse(processedText);

    mermaidBlocks.forEach((code, index) => {
      const placeholder = `%%MERMAID_PLACEHOLDER_${index}%%`;
      const escapedCode = escapeHtml(code.trim());
      const replacement = `
        <div class="mermaid-wrapper" data-zoom="1.0">
          <div class="diagram-zoom-controls">
            <button class="diagram-zoom-btn" onclick="zoomSingleDiagram(this, 1)" title="تكبير المخطط">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
            <button class="diagram-zoom-btn" onclick="zoomSingleDiagram(this, -1)" title="تصغير المخطط">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
          </div>
          <div class="mermaid" id="${idPrefix}-mermaid-node-${index}" data-diagram="${encodeURIComponent(code.trim())}">
            ${escapedCode}
          </div>
        </div>
      `;
      html = html.replace(new RegExp(`<p>\\s*${placeholder}\\s*<\\/p>|${placeholder}`, 'g'), replacement);
    });

    return html;
  }

  // Render Mermaid diagrams asynchronously with high-performance caching
  async function renderMermaidNodes(targetContainer = previewContent) {
    if (typeof mermaid === 'undefined') return;
    if (!targetContainer) return;

    // انتظار تحميل الخطوط قبل الرسم لضمان حساب حجم العقد بالخط الصحيح
    // هذا يمنع اقتصاص السطر الثاني بعد <br/> بسبب حساب الحجم بخط بديل
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const currentThemeKey = isDarkMode ? 'dark' : 'default';
    const nodes = targetContainer.querySelectorAll('.mermaid');

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const encoded = node.getAttribute('data-diagram');
      if (!encoded) continue;

      const code = decodeURIComponent(encoded);
      const cacheKey = `${code.trim()}_${currentThemeKey}`;

      // 1. التحقق من الكاش الفوري (0ms) لمنع أي بطء أو تكرار بالرسم
      if (mermaidSvgCache.has(cacheKey)) {
        node.innerHTML = mermaidSvgCache.get(cacheKey);
        continue;
      }

      const uniqueId = `mermaid-svg-${Date.now()}-${i}`;

      try {
        const { svg } = await mermaid.render(uniqueId, code);
        // تأخير قصير بعد الرسم للسماح للمتصفح بتطبيق الخط والـ layout
        mermaidSvgCache.set(cacheKey, svg);
        node.innerHTML = svg;
      } catch (err) {
        // تنظيف أي عنصر خطأ قام Mermaid بحقنه في body
        const injectedErr = document.getElementById(`d${uniqueId}`);
        if (injectedErr) injectedErr.remove();

        console.warn('Mermaid syntax issue in block:', err);
        node.innerHTML = `
          <div class="mermaid-error" style="background:#fff1f2; border:1px solid #fecdd3; border-radius:8px; padding:12px 16px; color:#be123c; text-align:right; font-family:'Tajawal',sans-serif;">
            <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px;">⚠️ تنبيه في صياغة كود المخطط (جارٍ التعديل...)</div>
            <div style="font-size:0.8rem; color:#64748b; margin-bottom:8px;">تأكد من كتابة الأسهم والاتجاهات بشكل سليم (مثال: A --> B). أو اضغط زر استعادة النموذج ↺ في الأعلى.</div>
            <pre style="margin:0; font-size:0.75rem; background:#ffffff; border:1px solid #fca5a5; padding:8px; border-radius:4px; direction:ltr; text-align:left;">${escapeHtml(code)}</pre>
          </div>
        `;
      }
    }
  }

  // Update Document Statistics
  function updateStats(text) {
    if (typeof text !== 'string') {
      text = isClassicMode ? (classicEditor?.value || editor?.value || '') : (editor?.value || '');
    }
    // تنظيف روابط الصور المضمنة base64 من النص قبل حساب الكلمات لمنع أي تجميد أو استهلاك غير مبرر للذاكرة
    const textWithoutDataUrls = (text || '').replace(/data:image\/[^"')\s]+/g, '[صورة]');
    const trimmed = textWithoutDataUrls.trim();
    const chars = trimmed.length;
    // Arabic + English words
    const words = trimmed ? (trimmed.match(/[\w\u0600-\u06FF]+/g) || []).length : 0;
    const readingTime = Math.ceil(words / 180); // ~180 wpm in Arabic

    if (statWords) statWords.textContent = `${words.toLocaleString('ar-EG')} كلمة`;
    if (statChars) statChars.textContent = `${chars.toLocaleString('ar-EG')} حرف`;
    if (statReadingTime) statReadingTime.textContent = `دقيقة قراءة: ~${readingTime}`;
  }

  // Synchronized Scrolling
  function handleEditorScroll() {
    if (!isSyncScroll || isUpdatingScroll) return;
    isUpdatingScroll = true;

    const editorScrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
    preview.scrollTop = editorScrollRatio * (preview.scrollHeight - preview.clientHeight);

    setTimeout(() => { isUpdatingScroll = false; }, 40);
  }

  function handlePreviewScroll() {
    if (!isSyncScroll || isUpdatingScroll) return;
    isUpdatingScroll = true;

    const previewScrollRatio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
    editor.scrollTop = previewScrollRatio * (editor.scrollHeight - editor.clientHeight);

    setTimeout(() => { isUpdatingScroll = false; }, 40);
  }

  // ضغط وتحسين جودة وحجم الصورة محلياً عبر HTML5 Canvas لمنع تجميد المتصفح والذاكرة
  function optimizeImageFile(fileOrBlob, maxWidth = 1280, maxHeight = 1280, quality = 0.82) {
    return new Promise((resolve) => {
      if (!fileOrBlob || !fileOrBlob.type || !fileOrBlob.type.startsWith('image/')) {
        return resolve(null);
      }

      // إذا كانت صورة SVG متجهة، لا داعي للضغط النقطي
      if (fileOrBlob.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(fileOrBlob);
        return;
      }

      let objectUrl = '';
      try {
        objectUrl = URL.createObjectURL(fileOrBlob);
      } catch (err) {
        const fallbackReader = new FileReader();
        fallbackReader.onload = (e) => resolve(e.target.result);
        fallbackReader.onerror = () => resolve(null);
        fallbackReader.readAsDataURL(fileOrBlob);
        return;
      }

      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // الحفاظ على نسبة الأبعاد مع تحديد أقصى بعد بـ 1280 بكسل
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            const fallbackReader = new FileReader();
            fallbackReader.onload = (e) => resolve(e.target.result);
            fallbackReader.onerror = () => resolve(null);
            fallbackReader.readAsDataURL(fileOrBlob);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          let dataUrl = '';
          try {
            dataUrl = canvas.toDataURL('image/webp', quality);
            if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
              dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
          } catch (e) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          canvas.width = 0;
          canvas.height = 0;

          resolve(dataUrl);
        } catch (err) {
          console.error('خطأ أثناء ضغط الصورة:', err);
          const fallbackReader = new FileReader();
          fallbackReader.onload = (e) => resolve(e.target.result);
          fallbackReader.onerror = () => resolve(null);
          fallbackReader.readAsDataURL(fileOrBlob);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        const fallbackReader = new FileReader();
        fallbackReader.onload = (e) => resolve(e.target.result);
        fallbackReader.onerror = () => resolve(null);
        fallbackReader.readAsDataURL(fileOrBlob);
      };

      img.src = objectUrl;
    });
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Input debounced render & history snapshot
    editor.addEventListener('input', () => {
      if (saveStatus) {
        saveStatus.textContent = 'جارٍ الحفظ والكتابة...';
        saveStatus.className = 'save-badge saving';
      }
      clearTimeout(renderDebounceTimer);
      renderDebounceTimer = setTimeout(renderMarkdown, 200);

      if (!isPerformingHistory) {
        recordHistorySnapshot(false);
      }
    });

    // Save immediate snapshot on blur or enter
    editor.addEventListener('blur', () => {
      if (!isPerformingHistory) {
        recordHistorySnapshot(true);
      }
    });

    // Classic Editor Listeners
    if (classicEditor) {
      classicEditor.addEventListener('input', () => {
        editor.value = classicEditor.value;
        renderClassicMarkdown();
        if (!isPerformingHistory) {
          recordHistorySnapshot(false);
        }
      });
      classicEditor.addEventListener('blur', () => {
        if (!isPerformingHistory) {
          recordHistorySnapshot(true);
        }
      });

      // Synchronized scroll between both classic boxes (سلس، دقيق، وبدون أي ارتداد أو تعليق)
      if (classicOutput) {
        let activeScroller = null;
        let syncRaf = null;

        classicEditor.addEventListener('mouseenter', () => { activeScroller = 'editor'; });
        classicEditor.addEventListener('touchstart', () => { activeScroller = 'editor'; }, { passive: true });
        classicEditor.addEventListener('wheel', () => { activeScroller = 'editor'; }, { passive: true });

        classicOutput.addEventListener('mouseenter', () => { activeScroller = 'output'; });
        classicOutput.addEventListener('touchstart', () => { activeScroller = 'output'; }, { passive: true });
        classicOutput.addEventListener('wheel', () => { activeScroller = 'output'; }, { passive: true });

        classicEditor.addEventListener('scroll', () => {
          if (!isClassicMode || activeScroller !== 'editor') return;
          if (syncRaf) cancelAnimationFrame(syncRaf);
          syncRaf = requestAnimationFrame(() => {
            const maxEditor = classicEditor.scrollHeight - classicEditor.clientHeight;
            const maxOutput = classicOutput.scrollHeight - classicOutput.clientHeight;
            if (maxEditor > 0 && maxOutput > 0) {
              classicOutput.scrollTop = (classicEditor.scrollTop / maxEditor) * maxOutput;
            }
          });
        }, { passive: true });

        classicOutput.addEventListener('scroll', () => {
          if (!isClassicMode || activeScroller !== 'output') return;
          if (syncRaf) cancelAnimationFrame(syncRaf);
          syncRaf = requestAnimationFrame(() => {
            const maxEditor = classicEditor.scrollHeight - classicEditor.clientHeight;
            const maxOutput = classicOutput.scrollHeight - classicOutput.clientHeight;
            if (maxEditor > 0 && maxOutput > 0) {
              classicEditor.scrollTop = (classicOutput.scrollTop / maxOutput) * maxEditor;
            }
          });
        }, { passive: true });
      }
    }

    // Scrolling (Modern Mode)
    editor.addEventListener('scroll', handleEditorScroll);
    preview.addEventListener('scroll', handlePreviewScroll);

    // Close dropdowns on outside click OR after clicking a dropdown item
    document.addEventListener('click', (e) => {
      // If a dropdown item was clicked, close the parent dropdown
      if (e.target.closest('.dropdown-item')) {
        const container = e.target.closest('.dropdown-container');
        if (container) container.classList.remove('open');
        return;
      }
      // Otherwise close all dropdowns if clicked outside
      if (!e.target.closest('.dropdown-container')) {
        document.querySelectorAll('.dropdown-container.open').forEach((el) => {
          el.classList.remove('open');
        });
      }
    });

    // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+S, Ctrl+B, Ctrl+I) & Tab support
    document.addEventListener('keydown', (e) => {
      // 1. Undo (السابق)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        window.undoAction();
        return;
      }
      // 2. Redo (التالي)
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        window.redoAction();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveMarkdownFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        insertFormat('**', '**', 'نص عريض');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        insertFormat('*', '*', 'نص مائل');
      }
    });

    // Tab key inserts tab character instead of moving focus
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        recordHistorySnapshot(true);
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.setRangeText('\t', start, end, 'end');
        renderMarkdown();
        recordHistorySnapshot(true);
      }
    });

    // معالجة لصق الصور من الحافظة (Ctrl+V) كصور مدمجة ومحسنة في الماركداون
    async function handleImagePaste(e) {
      if (!e.clipboardData || !e.clipboardData.items) return;
      const items = e.clipboardData.items;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const optimizedUrl = await optimizeImageFile(file);
            if (optimizedUrl) {
              insertImageIntoEditor(optimizedUrl, 'صورة ملصقة');
            }
            return;
          }
        }
      }
    }

    editor.addEventListener('paste', handleImagePaste);
    if (classicEditor) {
      classicEditor.addEventListener('paste', handleImagePaste);
    }

    // منع السكرول التلقائي عند لصق النصوص بـ Ctrl+V
    function handleTextPasteScroll(e) {
      // لا نتدخل إذا كان اللصق لصورة (handleImagePaste يتعامل معها)
      if (e.clipboardData && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          if (e.clipboardData.items[i].type && e.clipboardData.items[i].type.startsWith('image/')) {
            return; // صورة - لا نتدخل
          }
        }
      }
      const el = e.target;
      const savedScroll = el.scrollTop;
      const savedPreviewScroll = preview ? preview.scrollTop : 0;
      // بعد أن يكمل المتصفح اللصق، نستعيد السكرول
      requestAnimationFrame(() => {
        el.scrollTop = savedScroll;
        if (preview) preview.scrollTop = savedPreviewScroll;
      });
    }
    editor.addEventListener('paste', handleTextPasteScroll);
    if (classicEditor) {
      classicEditor.addEventListener('paste', handleTextPasteScroll);
    }

    // دعم سحب وإفلات الصور (Drag and Drop) مع الضغط الفوري
    async function handleImageDrop(e) {
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type && file.type.startsWith('image/')) {
          e.preventDefault();
          e.stopPropagation();
          const altName = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'صورة مسحوبة';
          const optimizedUrl = await optimizeImageFile(file);
          if (optimizedUrl) {
            insertImageIntoEditor(optimizedUrl, altName);
          }
          return;
        }
      }
    }

    function handleImageDragOver(e) {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    editor.addEventListener('dragover', handleImageDragOver);
    editor.addEventListener('drop', handleImageDrop);
    if (classicEditor) {
      classicEditor.addEventListener('dragover', handleImageDragOver);
      classicEditor.addEventListener('drop', handleImageDrop);
    }

    // استماع لاختيار صورة عند الرفع من الجهاز مع الضغط الفوري ومنع التجميد
    const uploadInput = document.getElementById('image-upload-input');
    if (uploadInput) {
      uploadInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file && file.type.startsWith('image/')) {
          const altName = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'صورة مرفوعة';
          const optimizedUrl = await optimizeImageFile(file);
          if (optimizedUrl) {
            insertImageIntoEditor(optimizedUrl, altName);
          }
        }
        uploadInput.value = '';
      });
    }
  }

  // Toggle Dropdown
  window.toggleDropdown = function (id, event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById(id);
    if (!dropdown) return;
    const wasOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.dropdown-container.open').forEach((el) => el.classList.remove('open'));
    if (!wasOpen) {
      dropdown.classList.add('open');
    }
  };

  // View Mode Switching (Tri-State Cycle: Split ➔ Editor ➔ Preview ➔ Split)
  let currentViewMode = 'split';

  window.setViewMode = function (mode) {
    currentViewMode = mode;
    workspace.classList.remove('mode-editor-only', 'mode-preview-only');
    document.querySelectorAll('.view-toggle-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.mobile-tab-btn').forEach((b) => b.classList.remove('active'));

    const cycleBtn = document.getElementById('btn-mode-cycle');

    const splitSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>';
    const editorSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="8" y1="9" x2="16" y2="9"></line><line x1="8" y1="13" x2="16" y2="13"></line></svg>';
    const previewSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

    if (mode === 'editor') {
      workspace.classList.add('mode-editor-only');
      if (cycleBtn) {
        cycleBtn.innerHTML = editorSvg;
        cycleBtn.title = 'محرر فقط (وضع التركيز بالكتابة) • انقر للتبديل إلى معاينة فقط';
        cycleBtn.classList.add('active');
      }
      document.getElementById('mobile-tab-editor')?.classList.add('active');
    } else if (mode === 'preview') {
      workspace.classList.add('mode-preview-only');
      if (cycleBtn) {
        cycleBtn.innerHTML = previewSvg;
        cycleBtn.title = 'معاينة فقط (وضع القراءة التامة) • انقر للعودة للعرض المزدوج';
        cycleBtn.classList.add('active');
      }
      document.getElementById('mobile-tab-preview')?.classList.add('active');
      // Ensure rendered markdown is updated
      renderMarkdown();
    } else {
      // Split mode (Default)
      if (cycleBtn) {
        cycleBtn.innerHTML = splitSvg;
        cycleBtn.title = 'عرض مزدوج (محرر + معاينة) • انقر للتبديل إلى محرر فقط';
        cycleBtn.classList.remove('active');
      }
      document.getElementById('mobile-tab-editor')?.classList.add('active');
    }
  };

  // زر دوري ثلاثي الأوضاع: مزدوج ➔ محرر فقط ➔ معاينة فقط ➔ مزدوج
  window.cycleViewMode = function () {
    if (currentViewMode === 'split') {
      setViewMode('editor');
    } else if (currentViewMode === 'editor') {
      setViewMode('preview');
    } else {
      setViewMode('split');
    }
  };

  // توافق رجعي مع أي استدعاء قديم
  window.toggleSingleViewMode = window.cycleViewMode;

  // Switch tabs in Classic mode on mobile (Strict single panel view)
  window.setClassicMobileTab = function (tab) {
    const classicEditor = document.getElementById('classic-editor');
    const editorTabBtn = document.getElementById('classic-tab-editor-btn');
    const previewTabBtn = document.getElementById('classic-tab-preview-btn');

    if (tab === 'preview') {
      classicEditor?.classList.add('classic-mode-preview');
      editorTabBtn?.classList.remove('active');
      previewTabBtn?.classList.add('active');
      renderClassicMarkdown();
    } else {
      classicEditor?.classList.remove('classic-mode-preview');
      editorTabBtn?.classList.add('active');
      previewTabBtn?.classList.remove('active');
    }
  };

  // Toggle Sync Scroll
  window.toggleSyncScroll = function () {
    isSyncScroll = !isSyncScroll;
    try {
      localStorage.setItem('vienix_sync_scroll', isSyncScroll);
      localStorage.setItem('yaser_sync_scroll', isSyncScroll);
    } catch (e) {}
    const btn = document.getElementById('btn-sync-scroll');
    if (btn) {
      btn.classList.toggle('active', isSyncScroll);
    }
    showToast(isSyncScroll ? 'تم تفعيل التمرير المتزامن ✓' : 'تم تعطيل التمرير المتزامن', 'info');
  };

  // ==========================================
  // COPY FUNCTIONS (نسخ)
  // ==========================================

  // Copy Markdown raw source
  window.copyMarkdown = function () {
    const text = editor.value;
    navigator.clipboard.writeText(text).then(() => {
      showToast('تم نسخ كود الماركداون (Markdown) بنجاح! 📋', 'success');
    }).catch(() => {
      fallbackCopy(text);
      showToast('تم نسخ كود الماركداون! 📋', 'success');
    });
  };

  // Copy HTML source
  window.copyHTML = function () {
    const html = previewContent.innerHTML;
    navigator.clipboard.writeText(html).then(() => {
      showToast('تم نسخ كود HTML الكامل بنجاح! 🌐', 'success');
    }).catch(() => {
      fallbackCopy(html);
      showToast('تم نسخ كود HTML! 🌐', 'success');
    });
  };

  // Copy Rich Formatted Text (can paste directly into Word, Outlook, etc.)
  window.copyRichText = function () {
    try {
      const html = previewContent.innerHTML;
      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([previewContent.innerText], { type: 'text/plain' });
      const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];

      navigator.clipboard.write(data).then(() => {
        showToast('تم نسخ النص المنسق بالكامل! جاهز للصق في الوورد 📄', 'success');
      }).catch(() => {
        window.copyMarkdown();
      });
    } catch (e) {
      window.copyMarkdown();
    }
  };

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // ==========================================
  // EXPORT FUNCTIONS (تصدير)
  // ==========================================

  // تحويل فقط مخططات Mermaid الانسيابية إلى صور ثابتة عالية الدقة (High-Res PNG)
  async function convertMermaidSvgsToPngImages(container) {
    // إزالة أزرار واجهة المستخدم (نسخ الكود والزوم) من نسخة التصدير
    container.querySelectorAll('.diagram-zoom-controls, .code-copy-btn').forEach((btn) => btn.remove());

    const svgs = Array.from(container.querySelectorAll('.mermaid > svg'));
    for (const svg of svgs) {
      try {
        const svgClone = svg.cloneNode(true);
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

        const rect = svg.getBoundingClientRect();
        const width = Math.max(Math.round(rect.width || svg.viewBox?.baseVal?.width || 700), 320);
        const height = Math.max(Math.round(rect.height || svg.viewBox?.baseVal?.height || 400), 180);

        svgClone.setAttribute('width', width);
        svgClone.setAttribute('height', height);

        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        const pngDataUrl = await new Promise((resolve) => {
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const scale = 2.5; // جودة فائقة للطباعة والمستندات
              canvas.width = width * scale;
              canvas.height = height * scale;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
              resolve(canvas.toDataURL('image/png'));
            } catch (e) {
              resolve(null);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
          };
          img.src = url;
        });

        if (pngDataUrl) {
          const imgEl = document.createElement('img');
          imgEl.src = pngDataUrl;
          imgEl.alt = 'Mermaid Diagram';
          imgEl.style.cssText = 'max-width:100%!important; width:100%!important; height:auto!important; display:block!important; margin:16px auto!important; border-radius:8px!important; border:1px solid #cbd5e1!important; background:#ffffff!important; box-sizing:border-box!important;';

          const parentWrapper = svg.closest('.mermaid-wrapper') || svg.closest('.mermaid') || svg.parentElement;
          if (parentWrapper) {
            parentWrapper.innerHTML = '';
            parentWrapper.appendChild(imgEl);
          } else {
            svg.replaceWith(imgEl);
          }
        }
      } catch (err) {
        console.warn('SVG convert error:', err);
      }
    }
  }

  // عزل الكلمات والعبارات الإنجليزية داخل النصوص العربية لمنع تداخل الحروف في PDF
  function isolateBidiInClone(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement && (node.parentElement.tagName === 'CODE' || node.parentElement.tagName === 'PRE' || node.parentElement.closest('pre'))) {
        continue;
      }
      textNodes.push(node);
    }

    for (const node of textNodes) {
      const text = node.nodeValue;
      if (/[\u0600-\u06FF]/.test(text) && /[a-zA-Z]/.test(text)) {
        const span = document.createElement('span');
        // تغليف الكلمات والمصطلحات الإنجليزية بعازل LTR مستقل
        span.innerHTML = text.replace(/([a-zA-Z0-9_\-\+\*\/\(\)\.]{2,}(\s+[a-zA-Z0-9_\-\+\*\/\(\)\.]{2,})*)/g, '<span dir="ltr" style="display:inline-block; unicode-bidi:isolate; margin:0 4px; font-family:\'Tajawal\',sans-serif;">$1</span>');
        node.parentNode.replaceChild(span, node);
      }
    }
  }

  // تنظيف المحتوى المُصدّر (HTML / DOCX / PDF) من أي أزرار أو مقابض تحجيم أو أدوات تحكم خاصة بالمحرر
  function getCleanExportHTML(containerElement) {
    const clone = (containerElement || previewContent).cloneNode(true);

    // 1. إزالة جميع أزرار النسخ
    clone.querySelectorAll('.code-copy-btn').forEach((el) => el.remove());

    // 2. إزالة جميع أزرار التحكم بالمخططات
    clone.querySelectorAll('.diagram-zoom-controls').forEach((el) => el.remove());

    // 3. معالجة وتطهير حاويات الصور ومقابض التحجيم لإنتاج كود نظيف وأبعاد دقيقة
    clone.querySelectorAll('.image-resizer-wrapper').forEach((wrapper) => {
      wrapper.querySelectorAll('.image-resizer-toolbar, .resizer-handle').forEach((el) => el.remove());

      const img = wrapper.querySelector('img');
      if (img) {
        const width = wrapper.style.width || (img.getAttribute('width') ? `${img.getAttribute('width')}px` : '100%');
        const align = wrapper.getAttribute('data-align') || 'center';

        let marginStyle = 'margin: 16px auto; display: block;';
        let textAlign = 'text-align: center;';
        if (align === 'right') {
          marginStyle = 'margin: 16px 0 16px auto; display: block;';
          textAlign = 'text-align: right;';
        } else if (align === 'left') {
          marginStyle = 'margin: 16px auto 16px 0; display: block;';
          textAlign = 'text-align: left;';
        }

        const cleanContainer = document.createElement('div');
        cleanContainer.style.cssText = `${textAlign} margin: 16px 0; width: 100%;`;

        img.style.cssText = `width: ${width}; max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.08); ${marginStyle}`;
        cleanContainer.appendChild(img);

        wrapper.parentNode.replaceChild(cleanContainer, wrapper);
      }
    });

    return clone.innerHTML;
  }

  // 1. Export to PDF (Native High-Quality Save-as-PDF)
  window.exportPDF = async function () {
    showToast('جاري تجهيز المخططات وفتح نافذة الحفظ كـ PDF... ⏳', 'info', 3500);

    try {
      // 1. تحويل كافة مخططات Mermaid إلى صور ثابتة عالية الدقة لضمان ظهورها 100%
      await convertMermaidSvgsToPngImages(previewContent);

      // 2. إشعار توجيهي للمستخدم
      showToast('اختر الوجهة "حفظ بتنسيق PDF (Save as PDF)" ثم اضغط حفظ 📄✨', 'success', 5000);

      // 3. فتح نافذة الحفظ بتنسيق PDF مباشرة
      setTimeout(() => {
        window.print();
      }, 400);
    } catch (err) {
      console.error('PDF print error:', err);
      window.print();
    }
  };

  // 1.1 Print Document
  window.printPDF = async function () {
    window.exportPDF();
  };

  // 2. Export to Word (DOCX)
  window.exportDOCX = async function () {
    showToast('جاري تجهيز مستند Word (DOCX)...', 'info');

    try {
      // Clean HTML clone
      const contentClone = previewContent.cloneNode(true);

      // تحويل المخططات إلى صور لتظهر في Word
      await convertMermaidSvgsToPngImages(contentClone);

      const cleanBody = getCleanExportHTML(contentClone);

      const htmlString = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar" xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset="utf-8">
          <title>مستند Vienix Markdown Editor</title>
          <style>
            @page { size: A4 portrait; margin: 2cm; }
            body {
              font-family: 'Tajawal', 'Arial', sans-serif;
              direction: rtl;
              text-align: right;
              line-height: 1.8;
              color: #111;
            }
            h1 { font-size: 22pt; color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 5px; }
            h2 { font-size: 18pt; color: #1e40af; border-bottom: 1px solid #cbd5e1; }
            h3 { font-size: 14pt; color: #2563eb; }
            table { border-collapse: collapse; width: 100%; margin: 15px 0; direction: rtl; }
            th, td { border: 1px solid #94a3b8; padding: 8px 12px; text-align: right; }
            th { background-color: #f1f5f9; font-weight: bold; }
            blockquote {
              border-right: 4px solid #3b82f6;
              padding: 8px 15px;
              margin: 15px 0;
              background-color: #f8fafc;
            }
            code { font-family: 'Consolas', monospace; background-color: #f1f5f9; padding: 2px 4px; color: #9333ea; }
            pre { background-color: #1e1e1e; color: #f8fafc; padding: 14px 18px; border-radius: 6px; font-family: 'Consolas', monospace; direction: ltr; }
            .token.comment { color: #94a3b8; font-style: italic; }
            .token.punctuation { color: #cbd5e1; }
            .token.keyword { color: #cc99cd; font-weight: bold; }
            .token.function { color: #6196cc; }
            .token.string { color: #7ec699; }
            .token.number { color: #f08d49; }
            .token.operator { color: #67cdcc; }
            img { max-width: 100%; height: auto; border-radius: 6px; }
          </style>
        </head>
        <body dir="rtl">
          ${cleanBody}
        </body>
        </html>
      `;

      if (typeof htmlDocx !== 'undefined') {
        const converted = htmlDocx.asBlob(htmlString, { orientation: 'portrait' });
        downloadBlob(converted, 'مستند-vienix-editor.docx');
        showToast('تم تحميل ملف Word (DOCX) بنجاح! 📝', 'success');
      } else {
        // Fallback: download formatted Word HTML doc
        const blob = new Blob(['\ufeff' + htmlString], { type: 'application/msword' });
        downloadBlob(blob, 'مستند-vienix-editor.doc');
        showToast('تم تحميل مستند Word بنجاح! 📝', 'success');
      }
    } catch (err) {
      console.error('Error generating DOCX:', err);
      showToast('حدث خطأ أثناء تصدير DOCX، جاري المحاولة بصيغة بديلة...', 'warning');
      const cleanFallback = getCleanExportHTML(previewContent);
      const blob = new Blob(['\ufeff' + cleanFallback], { type: 'application/msword' });
      downloadBlob(blob, 'مستند-vienix-editor.doc');
    }
  };

  // 3. Export to Standalone HTML
  window.exportHTML = function () {
    showToast('جاري تصدير صفحة HTML المستقلة...', 'info');

    const cleanBody = getCleanExportHTML(previewContent);

    const fullHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>مستند Vienix Markdown Editor</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&family=Fira+Code:wght@400;500;600&display=swap">
  <style>
    body {
      font-family: 'Tajawal', sans-serif;
      direction: rtl;
      text-align: right;
      line-height: 1.8;
      max-width: 850px;
      margin: 40px auto;
      padding: 20px;
      color: #0f172a;
      background: #f8fafc;
    }
    .document-card {
      background: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
    }
    h1, h2, h3 { color: #1e293b; margin-top: 1.5em; }
    h1 { border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 10px; }
    th { background: #f1f5f9; }
    blockquote { border-right: 4px solid #3b82f6; padding: 10px 20px; margin: 20px 0; background: #f8fafc; }
    code:not(pre code) {
      font-family: 'Fira Code', 'Fira Mono', Consolas, monospace;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      color: #9333ea;
      font-size: 0.9em;
    }
    pre {
      background: #1e1e1e !important;
      color: #f8fafc;
      padding: 18px 20px;
      border-radius: 8px;
      overflow-x: auto;
      direction: ltr;
      text-align: left;
      border: 1px solid #334155;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      margin: 20px 0;
      font-family: 'Fira Code', 'Fira Mono', Consolas, Monaco, monospace;
      position: relative;
    }
    pre code {
      background: transparent !important;
      border: none !important;
      padding: 0;
      color: #f8fafc;
      display: block;
      font-family: inherit;
      font-size: 0.92rem;
      line-height: 1.65;
      white-space: pre;
    }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    .mermaid-wrapper { text-align: center; margin: 20px 0; background: #ffffff; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .mermaid-wrapper svg { max-width: 100%; height: auto; }

    /* Prism Syntax Highlighting (ألوان تلوين الأكواد البرمجية كما في المحرر تماماً) */
    .token.comment, .token.prolog, .token.doctype, .token.cdata, .token.block-comment {
      color: #94a3b8 !important;
      font-style: italic;
    }
    .token.punctuation {
      color: #cbd5e1 !important;
    }
    .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted {
      color: #f08d49 !important;
    }
    .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted {
      color: #7ec699 !important;
    }
    .token.operator, .token.entity, .token.url, .language-css .token.string, .style .token.string {
      color: #67cdcc !important;
    }
    .token.atrule, .token.attr-value, .token.keyword {
      color: #cc99cd !important;
    }
    .token.function, .token.class-name {
      color: #6196cc !important;
    }
    .token.regex, .token.important, .token.variable {
      color: #f8c555 !important;
    }
    .token.bold, .token.important {
      font-weight: bold;
    }
    .token.italic {
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="document-card">
    ${cleanBody}
  </div>
</body>
</html>`;

    const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, 'مستند-vienix-editor.html');
    showToast('تم تحميل صفحة HTML بنجاح! 🌐', 'success');
  };

  // 4. Save/Download Markdown (.md)
  window.saveMarkdownFile = function () {
    const text = editor.value;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, 'مستند-vienix-editor.md');
    showToast('تم تنزيل ملف Markdown (.md) بنجاح! 💾', 'success');
  };

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================
  // CHAMBERS UI & SWITCHING LOGIC (شريط الحجرات)
  // ==========================================

  // بناء عناصر شريط الحجرات
  function initChambersSystem() {
    const listEl = document.getElementById('chambers-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
      const btn = document.createElement('button');
      btn.className = 'chamber-btn';
      btn.id = 'chamber-btn-' + i;
      btn.setAttribute('data-chamber', i);
      btn.setAttribute('type', 'button');

      if (i === 8) {
        // الحجرة رقم 8 مخصصة لعرض ملفات المستكشف (بدون رقم 8، مع نقطة خضراء)
        btn.classList.add('chamber-file-dedicated');
        btn.innerHTML = `<span class="chamber-green-dot"></span>`;
        btn.setAttribute('title', 'حجرة مخصصة لعرض وتحرير ملفات المستكشف 🟢');
      } else {
        btn.innerHTML = `<span class="chamber-num">${i}</span><span class="chamber-dot"></span>`;
      }

      btn.addEventListener('click', () => {
        window.switchChamber(i);
      });

      // النقر بالزر الأيمن لإظهار القائمة السياقية للحجرة
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openChamberContextMenu(e, i);
      });

      listEl.appendChild(btn);
    }

    updateChambersUI();
    setupChamberContextMenu();
  }

  // تحديث حالة كل حجرة في الشريط (فارغة / ممتلئة / نشطة)
  function updateChambersUI() {
    for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
      const btn = document.getElementById('chamber-btn-' + i);
      if (!btn) continue;

      const content = getChamberContent(i).trim();
      const isFilled = content.length > 0;
      const isActive = i === activeChamber;
      const title = getChamberTitle(i);

      btn.classList.toggle('active', isActive);
      btn.classList.toggle('filled', isFilled);
      btn.classList.toggle('empty', !isFilled);

      if (i === 8) {
        btn.classList.add('chamber-file-dedicated');
        if (!btn.querySelector('.chamber-green-dot')) {
          btn.innerHTML = `<span class="chamber-green-dot"></span>`;
        }
        let activeFileTitle = '';
        if (activeExplorerFile && activeExplorerFile.title) {
          activeFileTitle = activeExplorerFile.title;
        } else if (isFilled) {
          activeFileTitle = title;
        }
        if (isActive) {
          btn.setAttribute('title', `حجرة عرض الملفات (النشطة حالياً 🟢) • ${activeFileTitle || 'جاهزة لفتح أي ملف من المستكشف'}`);
        } else {
          btn.setAttribute('title', `حجرة عرض الملفات 🟢 • ${activeFileTitle ? `معروض فيها: "${activeFileTitle}"` : 'جاهزة لعرض أي ملف عند النقر عليه'}`);
        }
      } else {
        if (isActive) {
          btn.setAttribute('title', `حجرة ${i} (النشطة حالياً) • ${isFilled ? title : 'جاهزة للكتابة'}`);
        } else if (isFilled) {
          btn.setAttribute('title', `حجرة ${i} (ممتلئة) • ${title} (اضغط للتبديل إليها)`);
        } else {
          btn.setAttribute('title', `حجرة ${i} (فارغة) • اضغط للكتابة هنا دون مسح حجرة ${activeChamber}`);
        }
      }
    }

    updateBookChambersList();
    if (typeof isExplorerOpen !== 'undefined' && isExplorerOpen && typeof renderChambersExplorerTree === 'function') {
      renderChambersExplorerTree();
    }
  }

  // التبديل بين الحجرات بسلاسة وحفظ فوري
  window.switchChamber = function (targetChamber) {
    targetChamber = parseInt(targetChamber, 10);
    if (isNaN(targetChamber) || targetChamber < 1 || targetChamber > TOTAL_CHAMBERS) return;
    if (targetChamber === activeChamber) return;

    // 1. حفظ المحتوى الحالي في الحجرة المغادرة
    const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
    setChamberContent(activeChamber, currentVal);

    // 2. تحديث الحجرة النشطة
    activeChamber = targetChamber;
    safeSaveToStorage('vienix_active_chamber', activeChamber);
    safeSaveToStorage('yaser_active_chamber', activeChamber);

    // 3. جلب محتوى الحجرة الهدف وتحميله في المحرر
    const targetVal = getChamberContent(targetChamber);
    editor.value = targetVal;
    if (classicEditor) classicEditor.value = targetVal;

    // 4. إعادة ضبط لقطات التراجع للحجرة الجديدة
    initHistoryWithContent(targetVal);

    // 5. التصيير
    if (isClassicMode) {
      renderClassicMarkdown();
    } else {
      renderMarkdown();
    }

    // 6. تحديث مظهر الأزرار
    updateChambersUI();

    const isTargetFilled = targetVal.trim().length > 0;
    const title = getChamberTitle(targetChamber);
    showToast(`انتقلت إلى الحجرة ${targetChamber} ${isTargetFilled ? `(${title})` : '✨ (فارغة)'}`, 'info', 1200);
  };

  // ==========================================
  // CHAMBERS CONTEXT MENU (القائمة السياقية)
  // ==========================================
  let contextTargetChamber = null;

  let contextTargetFolderKey = null;

  function setupChamberContextMenu() {
    const cMenu = document.getElementById('chamber-context-menu');
    const fMenu = document.getElementById('folder-context-menu');
    document.addEventListener('click', (e) => {
      if (cMenu && !e.target.closest('#chamber-context-menu')) {
        cMenu.style.display = 'none';
      }
      if (fMenu && !e.target.closest('#folder-context-menu')) {
        fMenu.style.display = 'none';
      }
    });
  }

  function openChamberContextMenu(e, chNum) {
    if (e && e.preventDefault) e.preventDefault();
    contextTargetChamber = chNum;
    const menu = document.getElementById('chamber-context-menu');
    const fMenu = document.getElementById('folder-context-menu');
    if (fMenu) fMenu.style.display = 'none';
    if (!menu) return;
    menu.style.display = 'block';

    const menuW = 200;
    const menuH = 260;
    let x = e ? e.clientX : window.innerWidth / 2;
    let y = e ? e.clientY : window.innerHeight / 2;

    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 10;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 10;
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  window.handleFolderContextMenu = function (e, folderKey) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    contextTargetFolderKey = folderKey;
    const cMenu = document.getElementById('chamber-context-menu');
    if (cMenu) cMenu.style.display = 'none';
    const menu = document.getElementById('folder-context-menu');
    if (!menu) return;

    let isCustom = false;
    let hasParent = false;
    try {
      const customFolders = JSON.parse(localStorage.getItem('vienix_custom_folders') || '[]');
      const target = customFolders.find(f => f.key === folderKey);
      isCustom = !!target;
      hasParent = !!(target && target.parent);
    } catch (err) {}

    const deleteBtn = document.getElementById('folder-context-delete-btn');
    const deleteDivider = document.getElementById('folder-context-delete-divider');
    const clearContentBtn = document.getElementById('folder-context-clear-content-btn');
    const makeRootBtn = document.getElementById('folder-context-make-root-btn');
    const migrateToFolderBtn = document.getElementById('folder-context-migrate-to-folder-btn');
    const migrateToRootBtn = document.getElementById('folder-context-migrate-to-root-btn');

    if (deleteBtn) deleteBtn.style.display = 'flex';
    if (deleteDivider) deleteDivider.style.display = 'block';
    if (clearContentBtn) clearContentBtn.style.display = 'flex';
    if (makeRootBtn) makeRootBtn.style.display = (isCustom && hasParent) ? 'flex' : 'none';

    // خيار ترحيل الملفات الحالية لمجلد آخر (خاص بالمجلد الرئيسي فقط)
    if (migrateToFolderBtn) {
      migrateToFolderBtn.style.display = (folderKey === 'book') ? 'flex' : 'none';
    }
    // خيار ترحيل الملفات الحالية للمجلد الرئيسي (يسري على كافة المجلدات ما عدا المجلد الرئيسي)
    if (migrateToRootBtn) {
      migrateToRootBtn.style.display = (folderKey !== 'book') ? 'flex' : 'none';
    }

    menu.style.display = 'block';
    const menuW = 205;
    const menuH = 340;
    let x = e ? e.clientX : window.innerWidth / 2;
    let y = e ? e.clientY : window.innerHeight / 2;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 10;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 10;
    if (x < 10) x = 10;
    if (y < 10) y = 10;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  };

  // إنشاء ملف جديد داخل المجلد عبر نافذة احترافية منبثقة
  let pendingNewFileFolderKey = null;

  window.openNewFileModal = function (folderKey) {
    const curMeta = getChamberMeta(activeChamber);
    const fallbackFolder = curMeta.folder || (activeChamber <= 7 ? 'book' : 'drafts');
    pendingNewFileFolderKey = folderKey || contextTargetFolderKey || fallbackFolder;

    const modal = document.getElementById('new-file-modal');
    const folderInput = document.getElementById('new-file-target-folder');
    const nameInput = document.getElementById('new-file-name-input');
    const heading = document.getElementById('new-file-modal-heading');

    const allFolders = getAppFolders();
    const folder = allFolders.find(f => f.key === pendingNewFileFolderKey);
    const folderName = folder ? folder.name : pendingNewFileFolderKey;

    if (!modal) {
      // بديل تلقائي في حال عدم وجود النافذة
      const title = prompt(`أدخل اسم الملف الجديد داخل مجلد "${folderName}":`, 'ملف جديد');
      if (!title || !title.trim()) return;
      return createNewFileInFolderDirect(pendingNewFileFolderKey, title.trim());
    }

    if (heading) heading.textContent = `إنشاء ملف جديد داخل مجلد "${folderName}"`;
    if (folderInput) folderInput.value = `📁 ${folderName}`;
    if (nameInput) {
      nameInput.value = '';
      nameInput.placeholder = 'مثال: مقدمة، أفكار أولية، ملخص...';
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      if (nameInput) nameInput.focus();
    }, 80);
  };

  window.closeNewFileModal = function (e) {
    if (e && e.target && e.target.id !== 'new-file-modal' && !e.target.classList.contains('diff-modal-close') && e.target.tagName !== 'BUTTON') {
      return;
    }
    const modal = document.getElementById('new-file-modal');
    if (modal) modal.style.display = 'none';
  };

  function createNewFileInFolderDirect(targetKey, title) {
    const allFolders = getAppFolders();
    const folder = allFolders.find(f => f.key === targetKey);
    const folderName = folder ? folder.name : targetKey;

    const files = getFolderFiles(targetKey);
    const nextNum = getNextFolderFileNum(targetKey);
    const newFile = {
      id: 'file_' + targetKey + '_' + Date.now().toString(36),
      num: nextNum,
      title: title || 'ملف جديد',
      content: '',
      words: 0,
      chars: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      linkedChamber: null
    };
    files.push(newFile);
    saveFolderFiles(targetKey, files);

    // نضمن فتح المجلد كي يظهر الملف الجديد فوراً
    collapsedFolders[targetKey] = false;
    renderChambersExplorerTree();

    // نفتح الملف فوراً في الحجرة النشطة للكتابة فيه مباشرة
    window.handleFolderFileClick(targetKey, newFile.id);
    showToast(`تم إنشاء ملف "${newFile.title}" داخل مجلد "${folderName}" والبدء بالكتابة! 📄✨`, 'success', 2000);
  }

  window.confirmCreateNewFile = function () {
    const modal = document.getElementById('new-file-modal');
    const nameInput = document.getElementById('new-file-name-input');
    const rawTitle = nameInput ? nameInput.value.trim() : '';
    const title = rawTitle || 'ملف جديد';

    const targetKey = pendingNewFileFolderKey || 'book';
    if (modal) modal.style.display = 'none';
    createNewFileInFolderDirect(targetKey, title);
  };

  window.contextCreateFileInFolder = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetFolderKey) return;
    window.openNewFileModal(contextTargetFolderKey);
  };

  window.contextMoveFolderToRoot = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetFolderKey) return;
    let customFolders = [];
    try {
      customFolders = JSON.parse(localStorage.getItem('vienix_custom_folders') || '[]');
    } catch (e) {}
    const target = customFolders.find(f => f.key === contextTargetFolderKey);
    if (!target) return;
    target.parent = null;
    try {
      localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
    } catch (e) {}
    renderChambersExplorerTree();
    showToast(`تم تحويل مجلد "${target.name}" إلى مجلد رئيسي مستقل! 📁`, 'success', 1600);
  };

  window.contextRenameFolder = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetFolderKey) return;
    const allFolders = getAppFolders();
    const target = allFolders.find(f => f.key === contextTargetFolderKey);
    const currentName = target ? target.name : '';
    const newName = prompt('أدخل الاسم الجديد للمجلد:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      const overrides = getFolderOverrides();
      overrides[contextTargetFolderKey] = newName.trim();
      saveFolderOverrides(overrides);
      renderChambersExplorerTree();
      showToast(`تمت إعادة تسمية المجلد إلى "${newName.trim()}" 📁`, 'success', 1500);
    }
  };

  window.contextCreateSubFolder = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetFolderKey) return;
    window.openNewFolderModal(contextTargetFolderKey);
  };

  window.contextToggleTargetFolder = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetFolderKey) return;
    window.toggleTreeFolder(contextTargetFolderKey);
  };

  // مسح جميع محتويات المجلد المحدد
  window.contextClearFolderContent = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetFolderKey) return;

    const allFolders = getAppFolders();
    const target = allFolders.find(f => f.key === contextTargetFolderKey);
    const folderName = target ? target.name : contextTargetFolderKey;

    window.openActionConfirmModal(
      '⚠️ تأكيد تفريغ ومسح محتوى المجلد',
      `هل أنت متأكد من مسح وإفراغ جميع محتويات مجلد <strong>"${escapeHtml(folderName)}"</strong> بالكامل؟<br><span style="color:#ef4444; font-size:0.82rem; margin-top:6px; display:inline-block;">سيتم حذف جميع ملفاته وتفريغ الحجرات المنتمية إليه بالكامل!</span>`,
      'نعم، امسح كل المحتويات',
      () => {
        // 1. مسح جميع ملفات المجلد المحفوظة
        saveFolderFiles(contextTargetFolderKey, []);

        // 2. تفريغ الحجرات التابعة لهذا المجلد
        for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
          const meta = getChamberMeta(i);
          const assigned = meta.folder || (i <= 7 ? 'book' : 'drafts');
          if (assigned === contextTargetFolderKey) {
            detachChamberFromLinkedFiles(i);
            setChamberContent(i, '');
            meta.customTitle = '';
            meta.words = 0;
            meta.chars = 0;
            saveChamberMeta(i, meta);
          }
        }

        // إذا كانت الحجرة النشطة الحالية تنتمي لهذا المجلد، نفرغ المحرر
        const curMeta = getChamberMeta(activeChamber);
        const curAssigned = curMeta.folder || (activeChamber <= 7 ? 'book' : 'drafts');
        if (curAssigned === contextTargetFolderKey) {
          editor.value = '';
          if (classicEditor) classicEditor.value = '';
          initHistoryWithContent('');
          if (isClassicMode) renderClassicMarkdown(); else renderMarkdown();
          updateStats();
        }

        renderChambersExplorerTree();
        updateChambersUI();
        showToast(`تم مسح وتفريغ جميع محتويات مجلد "${folderName}" بنجاح! 🧹`, 'success', 2000);
      }
    );
  };

  // حذف المجلد بالكامل مع التحذير والتأكيد
  window.contextDeleteFolder = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetFolderKey) return;
    window.deleteCustomFolder(contextTargetFolderKey);
  };

  // ==========================================
  // ميزة ترحيل الملفات الشاملة (Chamber & Folder Files Migration)
  // ==========================================
  let pendingMigrateSrcFolderKey = null;

  // 1. ترحيل ملفات المجلد الرئيسي لمجلد آخر (خاص بالمجلد الرئيسي فقط)
  window.contextMigrateMainFilesToFolder = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';

    // حفظ المحرر الحالي لضمان حداثة النصوص
    const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
    setChamberContent(activeChamber, currentVal);

    // جمع الحجرات الممتلئة (1 إلى 7)
    const filledChambers = [];
    for (let i = 1; i <= 7; i++) {
      const content = getChamberContent(i) || '';
      if (content.trim().length > 0) {
        filledChambers.push({
          num: i,
          title: getChamberTitle(i),
          content: content,
          meta: getChamberMeta(i)
        });
      }
    }
    const bookFiles = getFolderFiles('book');
    const totalCount = filledChambers.length + bookFiles.length;

    if (totalCount === 0) {
      showToast('لا توجد أي حجرات أو ملفات تحتوي على نصوص في المجلد الرئيسي ليتم ترحيلها!', 'info', 2200);
      return;
    }

    const modal = document.getElementById('migrate-files-modal');
    const titleEl = document.getElementById('migrate-files-modal-title');
    const descEl = document.getElementById('migrate-files-modal-desc');
    const warningEl = document.getElementById('migrate-files-warning');
    const newFolderSection = document.getElementById('migrate-new-folder-section');
    const toRootActionSection = document.getElementById('migrate-to-root-action-section');
    const optionsContainer = document.getElementById('migrate-files-options-container');
    const newFolderInput = document.getElementById('migrate-new-folder-name-input');

    if (!modal) return;

    if (titleEl) titleEl.textContent = 'ترحيل ملفات المجلد الرئيسي لمجلد آخر';
    if (descEl) {
      descEl.innerHTML = `سيتم ترحيل <strong>(${totalCount}) ملفات وحجرات ممتلئة</strong> من المجلد الرئيسي إلى المجلد المختار أدناه، <strong>وستُفرغ كافة الحجرات (1-7)</strong> لتصبح جاهزة لبدء فصول جديدة:`;
    }
    if (warningEl) warningEl.style.display = 'none';
    if (newFolderSection) newFolderSection.style.display = 'block';
    if (toRootActionSection) toRootActionSection.style.display = 'none';
    if (newFolderInput) newFolderInput.value = '';

    // رندرة قائمة المجلدات المتاحة للترحيل (باستثناء book)
    const allFolders = getAppFolders().filter(f => f.key !== 'book');
    if (optionsContainer) {
      optionsContainer.style.display = 'block';
      optionsContainer.innerHTML = allFolders.map(f => {
        return `
          <button type="button" class="folder-pick-btn" onclick="executeMigrateMainToFolder('${f.key}')" title="ترحيل إلى ${escapeHtml(f.name)}">
            <span class="folder-pick-icon">${f.key === 'archive' ? '🗄️' : '📁'}</span>
            <div class="folder-pick-info" style="flex:1;">
              <strong>${escapeHtml(f.name)}</strong>
              <small>${escapeHtml(f.desc || '')}</small>
            </div>
            <span style="font-size:0.75rem; color:#2563eb; font-weight:600;">ترحيل هنا ↵</span>
          </button>
        `;
      }).join('');
    }

    modal.style.display = 'flex';
  };

  // تأكيد إنشاء مجلد جديد وترحيل ملفات المجلد الرئيسي إليه فوراً
  window.confirmCreateFolderAndMigrate = function () {
    const input = document.getElementById('migrate-new-folder-name-input');
    const name = (input?.value || '').trim();
    if (!name) {
      showToast('يرجى إدخال اسم المجلد الجديد!', 'warning', 1600);
      input?.focus();
      return;
    }

    const key = 'custom_' + Date.now().toString(36);
    let customFolders = [];
    try {
      const saved = localStorage.getItem('vienix_custom_folders');
      if (saved) customFolders = JSON.parse(saved);
    } catch (e) {}

    customFolders.push({ key, name, desc: 'مجلد مخصص', isCustom: true, parent: null });
    try {
      localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
    } catch (e) {}

    collapsedFolders[key] = false;
    executeMigrateMainToFolder(key);
  };

  // تنفيذ ترحيل ملفات وحجرات المجلد الرئيسي إلى مجلد محدد مع تفريغ الحجرات
  window.executeMigrateMainToFolder = function (targetFolderKey) {
    const modal = document.getElementById('migrate-files-modal');
    if (modal) modal.style.display = 'none';

    // جمع الحجرات الممتلئة من 1 إلى 7
    const filledChambers = [];
    for (let i = 1; i <= 7; i++) {
      const content = getChamberContent(i) || '';
      if (content.trim().length > 0) {
        filledChambers.push({
          num: i,
          title: getChamberTitle(i),
          content: content,
          meta: getChamberMeta(i)
        });
      }
    }
    const bookFiles = getFolderFiles('book');

    const destFiles = getFolderFiles(targetFolderKey);
    let nextNum = destFiles.length > 0 ? (Math.max(...destFiles.map(f => parseInt(f.num, 10) || 0)) + 1) : 1;

    // 1. تحويل الحجرات الممتلئة لملفات داخل المجلد المستهدف
    filledChambers.forEach(ch => {
      destFiles.push({
        id: 'file_' + targetFolderKey + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
        num: nextNum++,
        title: ch.title,
        content: ch.content,
        words: ch.meta.words || 0,
        chars: ch.meta.chars || 0,
        updatedAt: ch.meta.updatedAt || Date.now(),
        linkedChamber: null
      });
    });

    // 2. ترحيل أي ملفات إضافية كانت في المجلد الرئيسي
    bookFiles.forEach(bf => {
      destFiles.push({
        ...bf,
        id: 'file_' + targetFolderKey + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
        num: nextNum++
      });
    });

    saveFolderFiles(targetFolderKey, destFiles);
    saveFolderFiles('book', []);

    // 3. تفريغ الحجرات كلها من 1 إلى 7
    for (let i = 1; i <= 7; i++) {
      detachChamberFromLinkedFiles(i);
      setChamberContent(i, '');
      const meta = getChamberMeta(i);
      meta.customTitle = '';
      meta.words = 0;
      meta.chars = 0;
      saveChamberMeta(i, meta);
    }

    // تفريغ المحرر النشط فوراً إذا كانت الحجرة الحالية 1..7
    if (activeChamber <= 7) {
      editor.value = '';
      if (classicEditor) classicEditor.value = '';
      initHistoryWithContent('');
      if (isClassicMode) renderClassicMarkdown(); else renderMarkdown();
      updateStats();
    }

    collapsedFolders[targetFolderKey] = false;
    renderChambersExplorerTree();
    updateChambersUI();

    const allFolders = getAppFolders();
    const dest = allFolders.find(f => f.key === targetFolderKey);
    const destName = dest ? dest.name : targetFolderKey;
    showToast(`تم ترحيل كافة الملفات إلى مجلد "${destName}" وتفريغ الحجرات بنجاح! 🚀`, 'success', 2500);
  };

  // 2. ترحيل الملفات الحالية من أي مجلد إلى المجلد الرئيسي وتعبئة الحجرات (1-7)
  window.contextMigrateFolderFilesToRoot = function () {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.style.display = 'none';

    if (!contextTargetFolderKey || contextTargetFolderKey === 'book') return;
    pendingMigrateSrcFolderKey = contextTargetFolderKey;

    const srcFiles = getFolderFiles(pendingMigrateSrcFolderKey);
    if (srcFiles.length === 0) {
      showToast('لا توجد ملفات داخل هذا المجلد لترحيلها للمجلد الرئيسي!', 'info', 2200);
      return;
    }

    const allFolders = getAppFolders();
    const srcFolder = allFolders.find(f => f.key === pendingMigrateSrcFolderKey);
    const srcFolderName = srcFolder ? srcFolder.name : pendingMigrateSrcFolderKey;

    const modal = document.getElementById('migrate-files-modal');
    const titleEl = document.getElementById('migrate-files-modal-title');
    const descEl = document.getElementById('migrate-files-modal-desc');
    const warningEl = document.getElementById('migrate-files-warning');
    const newFolderSection = document.getElementById('migrate-new-folder-section');
    const toRootActionSection = document.getElementById('migrate-to-root-action-section');
    const optionsContainer = document.getElementById('migrate-files-options-container');

    if (!modal) return;

    if (titleEl) titleEl.textContent = `ترحيل ملفات "${srcFolderName}" إلى المجلد الرئيسي`;
    if (descEl) {
      descEl.innerHTML = `سيتم نقل <strong>(${srcFiles.length}) ملفات</strong> من هذا المجلد إلى المجلد الرئيسي، وتعبئة الحجرات (1-7) بمحتواها لتتمكن من تحريرها والعمل عليها فوراً.`;
    }

    // التحقق من الحجرات غير الفارغة في المجلد الرئيسي
    const filledMainCount = [1, 2, 3, 4, 5, 6, 7].filter(i => (getChamberContent(i) || '').trim().length > 0).length;
    if (warningEl) {
      if (filledMainCount > 0) {
        warningEl.innerHTML = `⚠️ <strong>تنبيه:</strong> توجد حالياً (${filledMainCount}) حجرات غير فارغة في المجلد الرئيسي. متابعة الترحيل ستستبدل محتويات تلك الحجرات بمحتويات الملفات المنقولة. (إذا كنت تريد حفظ المحتوى الحالي أولاً، يمكنك إلغاء الأمر وترحيل المجلد الرئيسي).`;
        warningEl.style.display = 'block';
      } else {
        warningEl.style.display = 'none';
      }
    }

    if (newFolderSection) newFolderSection.style.display = 'none';
    if (toRootActionSection) toRootActionSection.style.display = 'block';

    // معاينة الملفات وتوزيعها على الحجرات
    if (optionsContainer) {
      optionsContainer.style.display = 'block';
      optionsContainer.innerHTML = `
        <div style="background:var(--bg-secondary, #f8fafc); border:1px solid var(--border-color, #e2e8f0); border-radius:6px; padding:10px; font-size:0.8rem;">
          <div style="font-weight:600; margin-bottom:6px; color:var(--text-color);">معاينة الملفات وتوزيعها على الحجرات:</div>
          ${srcFiles.map((f, idx) => {
            const chText = idx < 7 ? `حجرة ${idx + 1}` : `ملف إضافي في المجلد الرئيسي`;
            return `
              <div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dotted var(--border-color, #e2e8f0);">
                <span style="font-weight:500;">📄 ${escapeHtml(f.title || 'ملف ' + (idx + 1))}</span>
                <span style="color:#2563eb; font-size:0.75rem;">← ${chText}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    modal.style.display = 'flex';
  };

  // تنفيذ ترحيل الملفات للمجلد الرئيسي وتعبئة الحجرات 1..7
  window.executeMigrateToRoot = function () {
    const modal = document.getElementById('migrate-files-modal');
    if (modal) modal.style.display = 'none';

    if (!pendingMigrateSrcFolderKey) return;
    const srcFiles = getFolderFiles(pendingMigrateSrcFolderKey);
    if (srcFiles.length === 0) return;

    // 1. تعبئة الحجرات 1 إلى 7 بأول 7 ملفات
    const filesToChambers = srcFiles.slice(0, 7);
    filesToChambers.forEach((file, idx) => {
      const chNum = idx + 1;
      setChamberContent(chNum, file.content || '');
      const meta = getChamberMeta(chNum);
      meta.customTitle = file.title || ('ملف ' + chNum);
      meta.folder = 'book';
      saveChamberMeta(chNum, meta);
    });

    // 2. تفريغ الحجرات المتبقية إذا كان عدد الملفات أقل من 7
    for (let chNum = filesToChambers.length + 1; chNum <= 7; chNum++) {
      detachChamberFromLinkedFiles(chNum);
      setChamberContent(chNum, '');
      const meta = getChamberMeta(chNum);
      meta.customTitle = '';
      meta.words = 0;
      meta.chars = 0;
      meta.folder = 'book';
      saveChamberMeta(chNum, meta);
    }

    // 3. إذا كان هناك أكثر من 7 ملفات، يتم حفظ الملفات الزائدة كملفات في المجلد الرئيسي
    if (srcFiles.length > 7) {
      const extraFiles = srcFiles.slice(7);
      const bookFiles = getFolderFiles('book');
      let nextBookNum = getNextFolderFileNum('book');
      extraFiles.forEach(ef => {
        bookFiles.push({
          ...ef,
          id: 'file_book_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
          num: nextBookNum++
        });
      });
      saveFolderFiles('book', bookFiles);
    }

    // 4. تفريغ المجلد المصدر
    saveFolderFiles(pendingMigrateSrcFolderKey, []);

    // 5. الانتقال للحجرة 1 وتحديث المحرر
    switchChamber(1);

    // 6. فتح المجلد الرئيسي وتحديث الواجهة
    collapsedFolders['book'] = false;
    renderChambersExplorerTree();
    updateChambersUI();

    const allFolders = getAppFolders();
    const srcFolder = allFolders.find(f => f.key === pendingMigrateSrcFolderKey);
    const srcFolderName = srcFolder ? srcFolder.name : pendingMigrateSrcFolderKey;
    showToast(`تم ترحيل ملفات "${srcFolderName}" إلى المجلد الرئيسي وتعبئة الحجرات بنجاح! 📖✨`, 'success', 2500);
    pendingMigrateSrcFolderKey = null;
  };

  window.closeMigrateFilesModal = function (e) {
    if (e && e.target && e.target.id !== 'migrate-files-modal' && !e.target.classList.contains('diff-modal-close') && e.target.tagName !== 'BUTTON') {
      return;
    }
    const modal = document.getElementById('migrate-files-modal');
    if (modal) modal.style.display = 'none';
  };

  window.handleTreeItemContextMenu = function (e, chNum) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    openChamberContextMenu(e, chNum);
  };

  window.contextSwitchChamber = function () {
    const menu = document.getElementById('chamber-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetChamber) return;
    window.switchChamber(contextTargetChamber);
    renderChambersExplorerTree();
  };

  window.contextRenameChamber = function () {
    const menu = document.getElementById('chamber-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetChamber) return;
    window.startTreeInlineRename(null, contextTargetChamber);
  };

  window.contextPasteChamber = function () {
    const menu = document.getElementById('chamber-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetChamber) return;
    window.pasteToChamberFromTree(null, contextTargetChamber);
  };

  window.contextMoveFolderChamber = function () {
    const menu = document.getElementById('chamber-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetChamber) return;
    window.openMoveFolderModal(contextTargetChamber);
  };

  window.contextOpenInExplorer = function () {
    const menu = document.getElementById('chamber-context-menu');
    if (menu) menu.style.display = 'none';
    window.toggleChambersExplorer(true);
  };

  window.contextClearChamber = function () {
    const menu = document.getElementById('chamber-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetChamber) return;
    window.clearChamberFromTree(null, contextTargetChamber);
  };

  window.contextCopyChamber = function () {
    const menu = document.getElementById('chamber-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetChamber) return;
    const val = getChamberContent(contextTargetChamber);
    if (!val || val.trim() === '') {
      showToast('الحجرة فارغة!', 'info', 1200);
      return;
    }
    navigator.clipboard.writeText(val).then(() => {
      showToast(`تم نسخ محتوى الحجرة ${contextTargetChamber} بنجاح! 📋`, 'success', 1200);
    });
  };

  window.contextCompareChamber = function () {
    const menu = document.getElementById('chamber-context-menu');
    if (menu) menu.style.display = 'none';
    if (!contextTargetChamber) return;
    window.openChambersDiffModal(activeChamber, contextTargetChamber);
  };

  // ==========================================
  // CHAMBERS EXPLORER DRAWER CONTROLLER (مستكشف الفصول والمجلدات)
  // ==========================================

  let isExplorerOpen = false;
  let explorerSearchFilter = '';
  const collapsedFolders = {};
  let moveFolderTargetChamber = null;
  let moveFolderTarget = null;

  window.updateDrawerOverlayBounds = function () {
    const overlay = document.getElementById('explorer-drawer-overlay');
    const panelEditor = document.getElementById('panel-editor');
    if (!overlay || !panelEditor) return;
    const rect = panelEditor.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.right = 'auto';
    overlay.style.bottom = 'auto';
  };

  window.toggleChambersExplorer = function (forceState) {
    const drawer = document.getElementById('explorer-drawer');
    const overlay = document.getElementById('explorer-drawer-overlay');
    if (!drawer || !overlay) return;

    const prevState = isExplorerOpen;
    if (typeof forceState === 'boolean') {
      isExplorerOpen = forceState;
    } else {
      isExplorerOpen = !isExplorerOpen;
    }

    if (isExplorerOpen) {
      window.updateDrawerOverlayBounds();
    }

    drawer.classList.toggle('active', isExplorerOpen);
    overlay.classList.toggle('active', isExplorerOpen);

    if (isExplorerOpen) {
      renderChambersExplorerTree();
      setTimeout(() => {
        document.getElementById('explorer-search-input')?.focus();
      }, 100);
    }
  };

  window.closeChambersExplorer = function (e) {
    if (e && e.target && e.target.id !== 'explorer-drawer-overlay') return;
    window.toggleChambersExplorer(false);
  };

  window.addEventListener('resize', () => {
    if (isExplorerOpen) window.updateDrawerOverlayBounds();
  });

  document.addEventListener('mousedown', (e) => {
    if (!isExplorerOpen) return;
    if (e.target.closest('#explorer-drawer') || 
        e.target.closest('#btn-open-explorer-header') || 
        e.target.closest('#btn-chambers-manager') ||
        e.target.closest('#chamber-context-menu') ||
        e.target.closest('#folder-context-menu') ||
        e.target.closest('.chamber-modal-dialog') ||
        e.target.closest('.chamber-modal-overlay')) {
      return;
    }
    window.toggleChambersExplorer(false);
  });

  window.refreshExplorerData = function () {
    const refreshBtn = document.getElementById('btn-refresh-explorer-header');
    if (refreshBtn) {
      refreshBtn.classList.add('spinning');
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
      }, 600);
    }

    // إعادة مسح وحساب إحصائيات كافة الحجرات
    for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
      updateChamberMetaStats(i);
    }

    renderChambersExplorerTree();
    updateChambersUI();
    showToast('تم تحديث وإعادة حساب إحصائيات المستكشف! 🔄', 'info', 1200);
  };

  window.toggleTreeFolder = function (folderKey) {
    const isCurrentlyCollapsed = collapsedFolders[folderKey] !== false;
    collapsedFolders[folderKey] = !isCurrentlyCollapsed;
    renderChambersExplorerTree();
  };

  window.toggleCollapseAllFolders = function () {
    const allFolders = getAppFolders();
    const allCollapsed = allFolders.every(f => collapsedFolders[f.key] !== false);
    allFolders.forEach(f => {
      collapsedFolders[f.key] = !allCollapsed;
    });
    renderChambersExplorerTree();
  };

  window.filterExplorerItems = function (keyword) {
    explorerSearchFilter = (keyword || '').trim().toLowerCase();
    const clearBtn = document.getElementById('explorer-search-clear');
    if (clearBtn) {
      clearBtn.style.display = explorerSearchFilter.length > 0 ? 'block' : 'none';
    }
    renderChambersExplorerTree();
  };

  window.clearExplorerSearch = function () {
    const input = document.getElementById('explorer-search-input');
    if (input) input.value = '';
    window.filterExplorerItems('');
  };

  // ==========================================
  // نافذة إنشاء فصل / مسودة جديدة (New Chamber Modal)
  // ==========================================
  window.openNewChamberModal = function () {
    const modal = document.getElementById('new-chamber-modal');
    const select = document.getElementById('new-chamber-target-select');
    const titleInput = document.getElementById('new-chamber-title-input');
    const folderSelect = document.getElementById('new-chamber-folder-select');
    if (!modal || !select) return;

    select.innerHTML = '';
    let firstEmptyChamber = null;

    for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
      const isFilled = getChamberContent(i).trim().length > 0;
      const title = getChamberTitle(i);
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `حجرة ${i}: ${isFilled ? `(ممتلئة - ${title})` : '✨ (فارغة ومتاحة)'}`;
      if (!isFilled && firstEmptyChamber === null) {
        firstEmptyChamber = i;
        opt.selected = true;
      }
      select.appendChild(opt);
    }

    if (firstEmptyChamber === null) {
      select.value = activeChamber;
    }

    if (folderSelect) {
      const allFolders = getAppFolders();
      folderSelect.innerHTML = allFolders.map(f => {
        const indent = f.parent ? '&nbsp;&nbsp;└── ' : '';
        return `<option value="${f.key}">${indent}📁 ${escapeHtml(f.name)}</option>`;
      }).join('');
    }

    if (titleInput) {
      titleInput.value = '';
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      titleInput?.focus();
    }, 100);
  };

  window.closeNewChamberModal = function (e) {
    if (e && e.target && e.target.id !== 'new-chamber-modal' && !e.target.classList.contains('diff-modal-close') && e.target.tagName !== 'BUTTON') {
      return;
    }
    const modal = document.getElementById('new-chamber-modal');
    if (modal) modal.style.display = 'none';
  };

  window.confirmCreateNewChamber = function () {
    const modal = document.getElementById('new-chamber-modal');
    const titleInput = document.getElementById('new-chamber-title-input');
    const folderSelect = document.getElementById('new-chamber-folder-select');
    const targetSelect = document.getElementById('new-chamber-target-select');

    const targetChamber = parseInt(targetSelect?.value || '1', 10);
    const chosenFolder = folderSelect?.value || 'drafts';
    const customTitle = (titleInput?.value || '').trim() || `مسودة حجرة ${targetChamber}`;

    // تحديث الميتاداتا
    const meta = getChamberMeta(targetChamber);
    meta.customTitle = customTitle;
    meta.folder = chosenFolder;
    meta.updatedAt = Date.now();
    saveChamberMeta(targetChamber, meta);

    // إذا كانت الحجرة فارغة ولم يكتب فيها بعد، نضع عنواناً مبدئياً
    if (getChamberContent(targetChamber).trim().length === 0) {
      const initialText = `# ${customTitle}\n\nاكتب هنا محتوى ${customTitle}...`;
      setChamberContent(targetChamber, initialText);
    }

    // التبديل إلى الحجرة فوراً
    window.switchChamber(targetChamber);

    if (modal) modal.style.display = 'none';
    renderChambersExplorerTree();
    showToast(`تم إنشاء "${customTitle}" في الحجرة ${targetChamber} بنجاح! ✨`, 'success', 1800);
  };

  // ==========================================
  // إدارة المجلدات الديناميكية (Dynamic Folders System)
  // ==========================================
  function getFolderOverrides() {
    try {
      const saved = localStorage.getItem('vienix_folder_name_overrides');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  }

  function saveFolderOverrides(overrides) {
    try {
      localStorage.setItem('vienix_folder_name_overrides', JSON.stringify(overrides));
    } catch (e) {}
  }

  // ==========================================
  // نظام ملفات المجلدات وتكرار/نقل الحجرات (Chambers Copy & Move System)
  // ==========================================

  function getFolderFiles(folderKey) {
    try {
      const saved = localStorage.getItem('vienix_folder_files_' + folderKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  function saveFolderFiles(folderKey, files) {
    try {
      localStorage.setItem('vienix_folder_files_' + folderKey, JSON.stringify(files));
    } catch (e) {}
  }

  // الحصول على الرقم التسلسلي التصاعدي التالي لملفات المجلد (ليأتي بعد الحجرات وأعلى ملف)
  function getNextFolderFileNum(folderKey) {
    const files = getFolderFiles(folderKey);
    let maxNum = 0;
    for (let ch = 1; ch <= 7; ch++) {
      const meta = getChamberMeta(ch);
      const chFolder = meta.folder || (ch <= 7 ? 'book' : 'drafts');
      if (chFolder === folderKey && ch > maxNum) {
        maxNum = ch;
      }
    }
    files.forEach(f => {
      if (typeof f.num === 'number' && f.num > maxNum) {
        maxNum = f.num;
      }
    });
    return maxNum + 1;
  }

  // إعادة ترقيم ملفات المجلد بتسلسل تصاعدي دقيق يبدأ بعد أعلى حجرة في هذا المجلد
  function resequenceFolderFiles(folderKey, files) {
    if (!files || !Array.isArray(files) || files.length === 0) return files;
    let maxChamberNum = 0;
    for (let ch = 1; ch <= 7; ch++) {
      const meta = getChamberMeta(ch);
      const chFolder = meta.folder || (ch <= 7 ? 'book' : 'drafts');
      if (chFolder === folderKey && ch > maxChamberNum) {
        maxChamberNum = ch;
      }
    }
    const startNum = maxChamberNum > 0 ? (maxChamberNum + 1) : 1;
    files.forEach((f, idx) => {
      f.num = startNum + idx;
    });
    return files;
  }

  // الحصول على الرقم التلقائي المتصاعد للمجلدات الجديدة (1، 2، 3...)
  function getNextAutoFolderName() {
    const allFolders = getAppFolders();
    let maxNum = 0;
    allFolders.forEach(f => {
      const trimmed = (f.name || '').trim();
      const n = parseInt(trimmed, 10);
      if (!isNaN(n) && n.toString() === trimmed) {
        if (n > maxNum) maxNum = n;
      }
    });
    return (maxNum + 1).toString();
  }

  // مزامنة التعديلات الحية على الحجرات مع الملفات المنسوخة المرتبطة بها
  function syncLinkedFolderFiles(chNum, content) {
    chNum = parseInt(chNum, 10);
    const allFolders = getAppFolders();
    allFolders.forEach(f => {
      let files = getFolderFiles(f.key);
      let changed = false;
      files.forEach(file => {
        if (file.linkedChamber === chNum) {
          file.content = content;
          file.title = getChamberTitle(chNum);
          const textWithoutDataUrls = (content || '').replace(/data:image\/[^"')\s]+/g, '[صورة]');
          const trimmed = textWithoutDataUrls.trim();
          file.words = trimmed ? (trimmed.match(/[\w\u0600-\u06FF]+/g) || []).length : 0;
          file.chars = trimmed.length;
          file.updatedAt = Date.now();
          changed = true;
        }
      });
      if (changed) {
        saveFolderFiles(f.key, files);
      }
    });
  }

  // فك ارتباط الحجرة عند التفريغ الرسمي للاحتفاظ بمحتواها في المجلدات المنسوخة
  function detachChamberFromLinkedFiles(chNum) {
    chNum = parseInt(chNum, 10);
    const allFolders = getAppFolders();
    allFolders.forEach(f => {
      let files = getFolderFiles(f.key);
      let changed = false;
      files.forEach(file => {
        if (file.linkedChamber === chNum) {
          // فك الارتباط ليبقى محتوى الملف آمناً ولا يُمسح أبداً
          file.linkedChamber = null;
          changed = true;
        }
      });
      if (changed) {
        saveFolderFiles(f.key, files);
      }
    });
  }

  // زر نسخ الحجرات (Duplicate Chambers - Live Sync)
  window.duplicateChambersToNewFolder = function () {
    // حفظ المحرر الحالي أولاً لضمان وجود أحدث نص
    const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
    setChamberContent(activeChamber, currentVal);

    // جمع الحجرات الممتلئة فقط من 1 إلى 7 (حجرة 8 مخصصة لعرض الملفات)
    const filledChambers = [];
    for (let i = 1; i <= 7; i++) {
      const content = getChamberContent(i) || '';
      if (content.trim().length > 0) {
        filledChambers.push({
          num: i,
          title: getChamberTitle(i),
          content: content,
          meta: getChamberMeta(i)
        });
      }
    }

    if (filledChambers.length === 0) {
      showToast('لا توجد أي حجرة (1-7) مكتوب فيها ليتم نسخها!', 'info', 2200);
      return;
    }

    const folderName = getNextAutoFolderName();
    const folderKey = 'custom_' + Date.now().toString(36);

    // 1. إنشاء المجلد الجديد
    let customFolders = [];
    try {
      const saved = localStorage.getItem('vienix_custom_folders');
      if (saved) customFolders = JSON.parse(saved);
    } catch (e) {}
    customFolders.push({
      key: folderKey,
      name: folderName,
      desc: 'مجلد محفوظات الحجرات المنسوخة',
      isCustom: true,
      parent: null
    });
    try {
      localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
    } catch (e) {}

    // 2. إنشاء ملفات الحجرات الممتلئة كملفات عادية داخل المجلد
    const files = filledChambers.map((ch, idx) => ({
      id: 'file_' + folderKey + '_' + (idx + 1),
      num: idx + 1,
      title: ch.title,
      content: ch.content,
      words: ch.meta.words || 0,
      chars: ch.meta.chars || 0,
      updatedAt: ch.meta.updatedAt || Date.now(),
      linkedChamber: null
    }));
    saveFolderFiles(folderKey, files);

    collapsedFolders[folderKey] = false;
    renderChambersExplorerTree();
    showToast(`تم نسخ ${files.length} حجرة إلى مجلد "${folderName}" كملفات مستقلة! 📋✨`, 'success', 2200);
  };

  // زر نقل الحجرات (Move Chambers - Archive & Empty)
  window.moveChambersToNewFolder = function () {
    const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
    setChamberContent(activeChamber, currentVal);

    // جمع الحجرات الممتلئة فقط من 1 إلى 7
    const filledChambers = [];
    for (let i = 1; i <= 7; i++) {
      const content = getChamberContent(i) || '';
      if (content.trim().length > 0) {
        filledChambers.push({
          num: i,
          title: getChamberTitle(i),
          content: content,
          meta: getChamberMeta(i)
        });
      }
    }

    if (filledChambers.length === 0) {
      showToast('لا توجد أي حجرة (1-7) مكتوب فيها ليتم نقلها!', 'info', 2200);
      return;
    }

    if (!confirm(`هل أنت متأكد من نقل محتوى (${filledChambers.length}) حجرة إلى مجلد جديد وتفريغ الحجرات الحالية للبدء من جديد؟`)) {
      return;
    }

    const folderName = getNextAutoFolderName();
    const folderKey = 'custom_' + Date.now().toString(36);

    // 1. إنشاء المجلد الجديد
    let customFolders = [];
    try {
      const saved = localStorage.getItem('vienix_custom_folders');
      if (saved) customFolders = JSON.parse(saved);
    } catch (e) {}
    customFolders.push({
      key: folderKey,
      name: folderName,
      desc: 'مجلد محفوظات الحجرات المنقولة',
      isCustom: true,
      parent: null
    });
    try {
      localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
    } catch (e) {}

    // 2. نسخ محتويات الحجرات كملفات محفوظة داخل المجلد
    const files = filledChambers.map((ch, idx) => ({
      id: 'file_' + folderKey + '_' + (idx + 1),
      num: idx + 1,
      title: ch.title,
      content: ch.content,
      words: ch.meta.words || 0,
      chars: ch.meta.chars || 0,
      updatedAt: ch.meta.updatedAt || Date.now(),
      linkedChamber: null
    }));
    saveFolderFiles(folderKey, files);

    // 3. تفريغ الحجرات 1 إلى 7
    for (let i = 1; i <= 7; i++) {
      detachChamberFromLinkedFiles(i);
      setChamberContent(i, '');
      const meta = getChamberMeta(i);
      meta.customTitle = '';
      meta.words = 0;
      meta.chars = 0;
      saveChamberMeta(i, meta);
    }

    // تفريغ المحرر النشط فوراً وتحديث الحالة
    editor.value = '';
    if (classicEditor) classicEditor.value = '';
    initHistoryWithContent('');
    if (isClassicMode) {
      renderClassicMarkdown();
    } else {
      renderMarkdown();
    }
    updateStats();

    activeChamber = 1;
    safeSaveToStorage('vienix_active_chamber', 1);
    safeSaveToStorage('yaser_active_chamber', 1);

    collapsedFolders[folderKey] = false;
    updateChambersUI();
    renderChambersExplorerTree();
    showToast(`تم نقل ${files.length} حجرة إلى مجلد "${folderName}" وتفريغ الحجرات! 📦`, 'success', 2200);
  };

  // إلغاء تحديد العناصر عند النقر في المساحة الفارغة
  window.handleExplorerTreeBackgroundClick = function (e) {
    if (!e || !e.target) return;
    if (e.target.closest('.obsidian-tree-item') ||
        e.target.closest('.obsidian-folder-header') ||
        e.target.closest('button') ||
        e.target.closest('input') ||
        e.target.closest('.chamber-context-menu') ||
        e.target.closest('.obsidian-header') ||
        e.target.closest('.obsidian-search') ||
        e.target.closest('.obsidian-footer')) {
      return;
    }
    document.querySelectorAll('.obsidian-tree-item.active').forEach(el => {
      el.classList.remove('active');
    });
    const activeNumEl = document.getElementById('explorer-active-num');
    if (activeNumEl) {
      activeNumEl.textContent = 'لا يوجد تحديد';
    }
  };

  // اللصق السريع المتسلسل التلقائي (Clipboard-Plus)
  window.handleDockClipboardPlus = async function () {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        showToast('يرجى السماح بصلاحية قراءة الحافظة في المتصفح', 'warning', 2000);
        return;
      }

      const text = await navigator.clipboard.readText();
      if (!text || text.trim().length === 0) {
        showToast('الحافظة فارغة حالياً، يرجى نسخ نص أولاً! 📋', 'warning', 1800);
        return;
      }

      // 1. حفظ المحتوى الحالي في الحجرة النشطة قبل الانتقال
      const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
      if (activeChamber !== 8) {
        setChamberContent(activeChamber, currentVal);
        updateChamberMetaStats(activeChamber, currentVal);
      } else if (activeExplorerFile) {
        const curFiles = getFolderFiles(activeExplorerFile.folderKey);
        const f = curFiles.find(x => x.id === activeExplorerFile.fileId);
        if (f) {
          f.content = currentVal;
          const trimmedCur = currentVal.replace(/data:image\/[^"')\s]+/g, '[صورة]').trim();
          f.words = trimmedCur ? (trimmedCur.match(/[\w\u0600-\u06FF]+/g) || []).length : 0;
          f.chars = trimmedCur.length;
          f.updatedAt = Date.now();
          saveFolderFiles(activeExplorerFile.folderKey, curFiles);
        }
      }

      // 2. البحث عن أول حجرة فارغة من الحجرات 1 إلى 7
      let targetChamber = null;

      // أ) البحث بدءاً من الحجرة التي تلي الحالية (إذا كانت الحالية < 7)
      if (activeChamber >= 1 && activeChamber < 7) {
        for (let ch = activeChamber + 1; ch <= 7; ch++) {
          const content = getChamberContent(ch);
          if (!content || content.trim().length === 0) {
            targetChamber = ch;
            break;
          }
        }
      }

      // ب) إذا لم نجد، نبحث من الحجرة 1 فصاعداً حتى 7
      if (!targetChamber) {
        for (let ch = 1; ch <= 7; ch++) {
          const content = getChamberContent(ch);
          if (!content || content.trim().length === 0) {
            targetChamber = ch;
            break;
          }
        }
      }

      // 3. الحالة الأولى: توجد حجرة فارغة بين 1 و 7
      if (targetChamber !== null) {
        setChamberContent(targetChamber, text);
        updateChamberMetaStats(targetChamber, text);

        // التبديل فوراً للحجرة وتحديث الواجهة والمحرر
        window.switchChamber(targetChamber);
        if (typeof renderChambersExplorerTree === 'function') {
          renderChambersExplorerTree();
        }

        showToast(`تم لصق المحتوى في الحجرة #${targetChamber} بنجاح! 📋✨`, 'success', 1600);
        return;
      }

      // 4. الحالة الثانية: الحجرات من 1 إلى 7 كلها ممتلئة -> إنشاء ملف جديد في المجلد الرئيسي (book)
      const folderKey = 'book';
      const files = getFolderFiles(folderKey);

      // حساب الرقم التسلسلي التصاعدي التالي بدءاً من 8
      const nextNum = getNextFolderFileNum(folderKey);

      const textWithoutDataUrls = text.replace(/data:image\/[^"')\s]+/g, '[صورة]');
      const trimmed = textWithoutDataUrls.trim();
      const wordsCount = trimmed ? (trimmed.match(/[\w\u0600-\u06FF]+/g) || []).length : 0;

      const newFile = {
        id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        num: nextNum,
        title: `ملف ${nextNum}`,
        content: text,
        words: wordsCount,
        chars: trimmed.length,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      files.push(newFile);
      saveFolderFiles(folderKey, files);

      // فتح وعرض الملف فوراً في الحجرة المخصصة (حجرة 8)
      window.handleFolderFileClick(folderKey, newFile.id);

      showToast(`تم إنشاء ولصق المحتوى في "${newFile.title}" داخل المجلد الرئيسي 📂✨`, 'success', 1800);

    } catch (err) {
      showToast('تعذر الوصول إلى الحافظة، يرجى السماح بصلاحيات المتصفح', 'error', 2000);
    }
  };

  // تفاعل النقر على ملف داخل مجلد: يُعرض دائماً في الحجرة رقم 8 المخصصة بعلامة النقطة الخضراء
  window.handleFolderFileClick = function (folderKey, fileId) {
    const files = getFolderFiles(folderKey);
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    // 1. تحديد بيانات الملف المعروض حالياً
    activeExplorerFile = {
      folderKey: folderKey,
      fileId: file.id,
      title: file.title
    };
    try {
      localStorage.setItem('vienix_active_explorer_file', JSON.stringify(activeExplorerFile));
    } catch (e) {}

    // 2. إذا كنا في حجرة أخرى (1-7)، نحفظ محتواها قبل الانتقال لحجرة 8
    if (activeChamber !== 8) {
      const curVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
      setChamberContent(activeChamber, curVal);
    }

    // 3. نعيّن حجرة 8 كالحجرة النشطة المخصصة لعرض الملف
    activeChamber = 8;
    setChamberContent(8, file.content || '');
    setChamberCustomTitle(8, file.title || 'ملف المستكشف');

    // 4. تحميل النص في المحرر فوراً
    if (isClassicMode && classicEditor) {
      classicEditor.value = file.content || '';
    } else if (editor) {
      editor.value = file.content || '';
    }

    initHistoryWithContent(file.content || '');
    if (isClassicMode) renderClassicMarkdown(); else renderMarkdown();
    updateStats();
    updateChambersUI();
    renderChambersExplorerTree();

    showToast(`تم عرض "${file.title}" في حجرة الملفات 🟢`, 'success', 1600);
  };

  window.startFolderFileRename = function (e, folderKey, fileId) {
    if (e && e.stopPropagation) e.stopPropagation();
    const files = getFolderFiles(folderKey);
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    const titleRow = document.getElementById('tree-title-row-file-' + fileId);
    if (!titleRow) return;

    titleRow.innerHTML = `
      <div class="obsidian-inline-edit-box" onclick="event.stopPropagation()">
        <input type="text" class="obsidian-rename-input" id="file-rename-input-${fileId}" value="${escapeHtml(file.title)}" placeholder="اسم الملف..." />
        <button type="button" class="obsidian-edit-save-btn" onclick="saveFolderFileInlineRename(event, '${folderKey}', '${fileId}')" title="حفظ الاسم">✓</button>
        <button type="button" class="obsidian-edit-cancel-btn" onclick="cancelTreeInlineRename(event)" title="إلغاء">✕</button>
      </div>
    `;

    if (typeof attachInlineRenameOutsideListener === 'function') {
      attachInlineRenameOutsideListener(() => {
        cancelTreeInlineRename();
      });
    }

    const input = document.getElementById('file-rename-input-' + fileId);
    if (input) {
      input.focus();
      input.select();
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          window.saveFolderFileInlineRename(ev, folderKey, fileId);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          window.cancelTreeInlineRename(ev);
        }
      });
    }
  };

  window.saveFolderFileInlineRename = function (e, folderKey, fileId) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (typeof cleanupInlineRenameOutsideListener === 'function') {
      cleanupInlineRenameOutsideListener();
    }
    const input = document.getElementById('file-rename-input-' + fileId);
    const val = input ? input.value.trim() : '';
    if (!val) {
      renderChambersExplorerTree();
      return;
    }
    const files = getFolderFiles(folderKey);
    const file = files.find(f => f.id === fileId);
    if (file && val !== file.title) {
      file.title = val;
      file.updatedAt = Date.now();
      saveFolderFiles(folderKey, files);
      if (activeExplorerFile && activeExplorerFile.folderKey === folderKey && activeExplorerFile.fileId === fileId) {
        activeExplorerFile.title = file.title;
        try { localStorage.setItem('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
        if (activeChamber === 8) {
          setChamberCustomTitle(8, file.title);
        }
      }
      showToast(`تمت إعادة تسمية الملف إلى "${val}" ✏️`, 'success', 1200);
    }
    renderChambersExplorerTree();
    updateChambersUI();
  };

  window.copyFolderFileContent = function (e, folderKey, fileId) {
    if (e && e.stopPropagation) e.stopPropagation();
    const files = getFolderFiles(folderKey);
    const file = files.find(f => f.id === fileId);
    if (!file || !file.content || file.content.trim() === '') {
      showToast('الملف فارغ، لا يوجد محتوى لنسخه!', 'info', 1200);
      return;
    }
    navigator.clipboard.writeText(file.content).then(() => {
      showToast(`تم نسخ محتوى "${file.title}" للحافظة! 📋`, 'success', 1200);
    }).catch(() => {
      fallbackCopyText(file.content, file.num);
    });
  };

  window.pasteToFolderFile = function (e, folderKey, fileId) {
    if (e && e.stopPropagation) e.stopPropagation();
    navigator.clipboard.readText().then(text => {
      if (!text) {
        showToast('الحافظة فارغة!', 'info', 1200);
        return;
      }
      const files = getFolderFiles(folderKey);
      const file = files.find(f => f.id === fileId);
      if (!file) return;
      file.content = (file.content ? file.content + '\n\n' : '') + text;
      const textWithoutDataUrls = file.content.replace(/data:image\/[^"')\s]+/g, '[صورة]');
      const trimmed = textWithoutDataUrls.trim();
      file.words = trimmed ? (trimmed.match(/[\w\u0600-\u06FF]+/g) || []).length : 0;
      file.chars = trimmed.length;
      file.updatedAt = Date.now();
      saveFolderFiles(folderKey, files);
      if (activeExplorerFile && activeExplorerFile.folderKey === folderKey && activeExplorerFile.fileId === fileId) {
        if (activeChamber === 8) {
          setChamberContent(8, file.content);
          if (isClassicMode && classicEditor) classicEditor.value = file.content;
          else if (editor) editor.value = file.content;
          if (isClassicMode) renderClassicMarkdown(); else renderMarkdown();
          updateStats();
        }
      }
      renderChambersExplorerTree();
      showToast(`تم لصق المحتوى في ملف "${file.title}" 📋`, 'success', 1200);
    }).catch(() => {
      showToast('تعذر الوصول للحافظة', 'error', 1200);
    });
  };

  window.openMoveFolderFileModal = function (folderKey, fileId, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const files = getFolderFiles(folderKey);
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    moveFolderTarget = { type: 'file', folderKey, fileId, fileTitle: file.title, fileNum: file.num };
    moveFolderTargetChamber = null;

    const modal = document.getElementById('move-folder-modal');
    const titleEl = document.getElementById('move-folder-modal-title');
    const desc = document.getElementById('move-folder-chamber-desc');
    const newFolderInput = document.getElementById('move-new-folder-name-input');
    if (!modal) return;

    if (titleEl) titleEl.textContent = 'نقل الملف إلى مجلد';

    const allFolders = getAppFolders();
    const curFolder = allFolders.find(f => f.key === folderKey);
    const curName = curFolder ? curFolder.name : folderKey;

    if (desc) {
      desc.innerHTML = `اختر المجلد الذي ترغب بنقل ملف <strong>"${escapeHtml(file.title)}"</strong> (من ${escapeHtml(curName)}) إليه:`;
    }

    if (typeof renderMoveFolderOptions === 'function') {
      renderMoveFolderOptions(folderKey);
    }

    if (newFolderInput) newFolderInput.value = '';
    modal.style.display = 'flex';
    setTimeout(() => { if (newFolderInput) newFolderInput.focus(); }, 100);
  };

  window.deleteFolderFile = function (e, folderKey, fileId) {
    if (e && e.stopPropagation) e.stopPropagation();
    let files = getFolderFiles(folderKey);
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    const doDelete = () => {
      files = files.filter(f => f.id !== fileId);
      resequenceFolderFiles(folderKey, files);
      saveFolderFiles(folderKey, files);

      // إذا كان الملف المحذوف هو المعروض حالياً في حجرة 8، نفرغها
      if (activeExplorerFile && activeExplorerFile.folderKey === folderKey && activeExplorerFile.fileId === fileId) {
        activeExplorerFile = null;
        try { localStorage.removeItem('vienix_active_explorer_file'); } catch (err) {}
        if (activeChamber === 8) {
          setChamberContent(8, '');
          setChamberCustomTitle(8, '');
          if (isClassicMode && classicEditor) classicEditor.value = '';
          else if (editor) editor.value = '';
          if (isClassicMode) renderClassicMarkdown(); else renderMarkdown();
          updateStats();
        }
      }
      renderChambersExplorerTree();
      updateChambersUI();
      showToast(`تم حذف ملف "${file.title}" من المجلد 🗑️`, 'info', 1400);
    };

    if (typeof window.openActionConfirmModal === 'function') {
      window.openActionConfirmModal(
        '⚠️ تأكيد حذف الملف',
        `هل أنت متأكد تماماً من حذف ملف <strong>"${escapeHtml(file.title)}"</strong> من هذا المجلد؟`,
        'نعم، احذف الملف',
        doDelete
      );
    } else {
      if (confirm(`هل أنت متأكد من حذف ملف "${file.title}" من هذا المجلد؟`)) {
        doDelete();
      }
    }
  };

  function getDeletedDefaultFolders() {
    try {
      const saved = localStorage.getItem('vienix_deleted_default_folders');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  function saveDeletedDefaultFolders(list) {
    try {
      localStorage.setItem('vienix_deleted_default_folders', JSON.stringify(list));
    } catch (e) {}
  }

  function getAppFolders() {
    const overrides = getFolderOverrides();
    const deletedDefaults = getDeletedDefaultFolders();
    const defaultFolders = [
      { key: 'book', name: overrides['book'] || 'المجلد الرئيسي', desc: 'المجلد الرئيسي المخصص للتجميع والعمل', parent: null },
      { key: 'drafts', name: overrides['drafts'] || 'المسودات والأفكار السريعة', desc: 'مسودات وملاحظات حرة', parent: null },
      { key: 'archive', name: overrides['archive'] || 'الأرشيف والمفرغات', desc: 'المحفوظات الاحتياطية', parent: null }
    ].filter(df => !deletedDefaults.includes(df.key));

    let customFolders = [];
    try {
      const saved = localStorage.getItem('vienix_custom_folders');
      if (saved) customFolders = JSON.parse(saved);
    } catch (e) {}

    let dirty = false;
    customFolders.forEach(f => {
      if (overrides[f.key]) f.name = overrides[f.key];
      // في حال أنشأ المستخدم مجلداً باسم 33 دون تحديد مجلد أب، نربطه بالمجلد الرئيسي فوراً إذا لم يكن محذوفاً
      if (f.name === '33' && !f.parent && !deletedDefaults.includes('book')) {
        f.parent = 'book';
        dirty = true;
      }
    });
    if (dirty) {
      try {
        localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
      } catch (e) {}
    }
    return [...defaultFolders, ...customFolders];
  }
  window.getAppFolders = getAppFolders;

  window.openNewFolderModal = function (parentKey) {
    const modal = document.getElementById('new-folder-modal');
    const input = document.getElementById('new-folder-name-input');
    const desc = document.getElementById('new-folder-desc-input');
    const parentSelect = document.getElementById('new-folder-parent-select');
    const heading = document.getElementById('new-folder-modal-heading');
    if (!modal) return;
    if (input) input.value = '';
    if (desc) desc.value = '';

    const allFolders = getAppFolders();
    const targetParent = parentKey ? allFolders.find(f => f.key === parentKey) : null;

    if (heading) {
      heading.textContent = targetParent ? `إنشاء مجلد فرعي داخل: "${targetParent.name}"` : 'إنشاء مجلد جديد';
    }

    if (parentSelect) {
      let opts = `<option value="">📁 (مجلد رئيسي مستقل - المستوى الأعلى)</option>`;
      allFolders.forEach(f => {
        const indent = f.parent ? '&nbsp;&nbsp;&nbsp;&nbsp;└── ' : '';
        opts += `<option value="${f.key}">${indent}📁 ${escapeHtml(f.name)}</option>`;
      });
      parentSelect.innerHTML = opts;
      if (parentKey) {
        parentSelect.value = parentKey;
      } else {
        parentSelect.value = '';
      }
    }

    modal.style.display = 'flex';
    setTimeout(() => input?.focus(), 100);
  };

  window.closeNewFolderModal = function (e) {
    if (e && e.target && e.target.id !== 'new-folder-modal' && !e.target.classList.contains('diff-modal-close') && e.target.tagName !== 'BUTTON') {
      return;
    }
    const modal = document.getElementById('new-folder-modal');
    if (modal) modal.style.display = 'none';
  };

  window.confirmCreateNewFolder = function () {
    const modal = document.getElementById('new-folder-modal');
    const input = document.getElementById('new-folder-name-input');
    const descInput = document.getElementById('new-folder-desc-input');
    const parentSelect = document.getElementById('new-folder-parent-select');
    const name = (input?.value || '').trim();
    if (!name) {
      showToast('يرجى إدخال اسم المجلد!', 'warning', 1500);
      input?.focus();
      return;
    }
    const parentKey = (parentSelect?.value || '').trim() || null;
    const desc = (descInput?.value || '').trim() || (parentKey ? 'مجلد فرعي' : 'مجلد مخصص');
    const key = 'custom_' + Date.now().toString(36);
    let customFolders = [];
    try {
      const saved = localStorage.getItem('vienix_custom_folders');
      if (saved) customFolders = JSON.parse(saved);
    } catch (e) {}
    customFolders.push({ key, name, desc, isCustom: true, parent: parentKey });
    try {
      localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
    } catch (e) {}

    // نضمن فتح المجلد الأب كي يظهر المجلد الفرعي فوراً
    if (parentKey) {
      collapsedFolders[parentKey] = false;
    }

    if (modal) modal.style.display = 'none';
    renderChambersExplorerTree();
    showToast(`تم إنشاء المجلد "${name}" بنجاح! 📁`, 'success', 1800);
  };

  let pendingActionCallback = null;

  window.openActionConfirmModal = function (title, message, buttonText, onConfirm) {
    const modal = document.getElementById('confirm-action-modal');
    const heading = document.getElementById('confirm-action-heading');
    const msgEl = document.getElementById('confirm-action-message');
    const btn = document.getElementById('confirm-action-proceed-btn');
    if (!modal) {
      if (confirm(message.replace(/<[^>]+>/g, ''))) onConfirm();
      return;
    }
    if (heading) heading.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (btn) btn.textContent = buttonText || 'تأكيد الحذف';
    pendingActionCallback = onConfirm;
    modal.style.display = 'flex';
  };

  window.closeConfirmActionModal = function (e) {
    if (e && e.target && e.target.id !== 'confirm-action-modal' && !e.target.classList.contains('diff-modal-close') && e.target.tagName !== 'BUTTON') {
      return;
    }
    const modal = document.getElementById('confirm-action-modal');
    if (modal) modal.style.display = 'none';
    pendingActionCallback = null;
  };

  window.executePendingConfirmedAction = function () {
    const modal = document.getElementById('confirm-action-modal');
    if (modal) modal.style.display = 'none';
    if (typeof pendingActionCallback === 'function') {
      const cb = pendingActionCallback;
      pendingActionCallback = null;
      cb();
    }
  };

  window.deleteCustomFolder = function (folderKey, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const allFolders = getAppFolders();
    const target = allFolders.find(f => f.key === folderKey);
    const folderName = target ? target.name : folderKey;

    window.openActionConfirmModal(
      '⚠️ تأكيد حذف المجلد نهائياً',
      `هل أنت متأكد تماماً من حذف مجلد <strong>"${escapeHtml(folderName)}"</strong> نهائياً؟<br><span style="color:#ef4444; font-size:0.82rem; margin-top:6px; display:inline-block;">سيتم حذف هذا المجلد وجميع الملفات المحفوظة بداخله وإعادة الحجرات للمجلد الرئيسي!</span>`,
      'نعم، احذف المجلد نهائياً',
      () => {
        // 1. حذف ملفات المجلد من التخزين
        try {
          localStorage.removeItem('vienix_folder_files_' + folderKey);
        } catch (e) {}

        // 2. إذا كان مجلداً أساسياً أولياً (مثل المجلد الرئيسي، المسودات، الأرشيف)
        const defaultKeys = ['book', 'drafts', 'archive'];
        if (defaultKeys.includes(folderKey)) {
          const deletedDefaults = getDeletedDefaultFolders();
          if (!deletedDefaults.includes(folderKey)) {
            deletedDefaults.push(folderKey);
            saveDeletedDefaultFolders(deletedDefaults);
          }
        }

        // 3. حذف المجلد من مصفوفة المجلدات المخصصة
        let customFolders = [];
        try {
          const saved = localStorage.getItem('vienix_custom_folders');
          if (saved) customFolders = JSON.parse(saved);
        } catch (e) {}
        customFolders = customFolders.filter(f => f.key !== folderKey);
        try {
          localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
        } catch (e) {}

        // 4. تحديد المجلد البديل لإعادة الحجرات إليه (المجلد الرئيسي إذا كان موجوداً، أو أول مجلد متاح)
        const remainingFolders = getAppFolders();
        let fallbackFolder = remainingFolders.find(f => f.key === 'book' || (f.name && f.name.includes('الرئيسي')));
        if (!fallbackFolder && remainingFolders.length > 0) {
          fallbackFolder = remainingFolders[0];
        }
        const fallbackKey = fallbackFolder ? fallbackFolder.key : 'book';

        // إعادة أي حجرات كانت تابعة لهذا المجلد إلى المجلد البديل
        for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
          const meta = getChamberMeta(i);
          const assigned = meta.folder || (i <= 7 ? 'book' : 'drafts');
          if (assigned === folderKey) {
            meta.folder = fallbackKey;
            saveChamberMeta(i, meta);
          }
        }

        // إعادة توجيه المجلدات الفرعية للأب
        customFolders.forEach(f => {
          if (f.parent === folderKey) {
            f.parent = target && target.parent ? target.parent : (fallbackFolder ? fallbackFolder.key : null);
          }
        });
        try {
          localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
        } catch (e) {}

        renderChambersExplorerTree();
        updateChambersUI();
        showToast(`تم حذف مجلد "${folderName}" بنجاح! 🗑️`, 'info', 1800);
      }
    );
  };

  // ==========================================
  // نظام سحب وإفلات الحجرات والمجلدات (Drag and Drop)
  // ==========================================
  let draggedChamberNum = null;
  let draggedFolderKey = null;
  let draggedFile = null;

  function isDescendantFolder(parentKey, testKey) {
    if (parentKey === testKey) return true;
    const all = getAppFolders();
    let current = all.find(f => f.key === testKey);
    while (current && current.parent) {
      if (current.parent === parentKey) return true;
      current = all.find(f => f.key === current.parent);
    }
    return false;
  }

  function getChambersOrder() {
    try {
      const saved = localStorage.getItem('vienix_chambers_order');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length === TOTAL_CHAMBERS) return arr;
      }
    } catch (e) {}
    const defOrder = [];
    for (let i = 1; i <= TOTAL_CHAMBERS; i++) defOrder.push(i);
    return defOrder;
  }

  function saveChambersOrder(order) {
    try {
      localStorage.setItem('vienix_chambers_order', JSON.stringify(order));
    } catch (e) {}
  }

  function clearAllDragClasses() {
    document.querySelectorAll('.obsidian-tree-item').forEach(el => {
      el.classList.remove('is-dragging', 'drag-over-top', 'drag-over-bottom');
    });
    document.querySelectorAll('.obsidian-folder-children, .obsidian-folder-header').forEach(el => {
      el.classList.remove('folder-drag-over');
    });
    document.querySelectorAll('.obsidian-folder').forEach(el => {
      el.classList.remove('is-folder-dragging');
    });
    document.getElementById('explorer-tree')?.classList.remove('root-drag-over');
  }

  window.handleFolderDragStart = function (e, folderKey) {
    draggedFolderKey = folderKey;
    draggedChamberNum = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', folderKey);
    setTimeout(() => {
      const el = document.getElementById('obsidian-folder-' + folderKey);
      if (el) el.classList.add('is-folder-dragging');
    }, 0);
  };

  window.handleFolderDragEnd = function (e) {
    clearAllDragClasses();
    draggedFolderKey = null;
    draggedChamberNum = null;
    draggedFile = null;
  };

  window.handleItemDragStart = function (e, chNum) {
    draggedChamberNum = chNum;
    draggedFolderKey = null;
    draggedFile = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', chNum.toString());
    setTimeout(() => {
      const el = document.getElementById('tree-item-' + chNum);
      if (el) el.classList.add('is-dragging');
    }, 0);
  };

  window.handleItemDragOver = function (e, targetChNum) {
    if (!draggedChamberNum && !draggedFile) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetEl = document.getElementById('tree-item-' + targetChNum);
    if (targetEl && targetChNum !== draggedChamberNum) {
      const rect = targetEl.getBoundingClientRect();
      const isTopHalf = (e.clientY - rect.top) < (rect.height / 2);
      targetEl.classList.toggle('drag-over-top', isTopHalf);
      targetEl.classList.toggle('drag-over-bottom', !isTopHalf);
    }
  };

  window.handleItemDragLeave = function (e) {
    if (e.currentTarget) {
      e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  };

  window.handleItemDrop = function (e, targetChNum, targetFolderKey) {
    e.preventDefault();
    e.stopPropagation();
    clearAllDragClasses();

    // إذا كان المسحوب ملفاً وتم إفلاته فوق حجرة
    if (draggedFile) {
      const { folderKey: srcFolderKey, fileId: srcFileId } = draggedFile;
      draggedFile = null;
      if (srcFolderKey !== targetFolderKey) {
        const srcFiles = getFolderFiles(srcFolderKey);
        const srcIndex = srcFiles.findIndex(f => f.id === srcFileId);
        if (srcIndex !== -1) {
          const [movingFile] = srcFiles.splice(srcIndex, 1);
          resequenceFolderFiles(srcFolderKey, srcFiles);
          saveFolderFiles(srcFolderKey, srcFiles);

          const targetFiles = getFolderFiles(targetFolderKey);
          targetFiles.unshift(movingFile);
          resequenceFolderFiles(targetFolderKey, targetFiles);
          saveFolderFiles(targetFolderKey, targetFiles);

          if (activeExplorerFile && activeExplorerFile.folderKey === srcFolderKey && activeExplorerFile.fileId === srcFileId) {
            activeExplorerFile.folderKey = targetFolderKey;
            try { localStorage.setItem('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
          }
          collapsedFolders[targetFolderKey] = false;
          renderChambersExplorerTree();
          const allFolders = getAppFolders();
          const dest = allFolders.find(f => f.key === targetFolderKey);
          showToast(`تم نقل ملف "${movingFile.title}" إلى مجلد "${dest ? dest.name : targetFolderKey}"! 📁`, 'success', 1500);
        }
      }
      return;
    }

    if (!draggedChamberNum || draggedChamberNum === targetChNum) return;

    // 1. نقل إلى المجلد في حال كان مختلفاً
    const meta = getChamberMeta(draggedChamberNum);
    const prevFolder = meta.folder || (draggedChamberNum <= 7 ? 'book' : 'drafts');
    if (prevFolder !== targetFolderKey) {
      meta.folder = targetFolderKey;
      saveChamberMeta(draggedChamberNum, meta);
    }

    // 2. إعادة ترتيب الحجرات بالترتيب الجديد
    const order = getChambersOrder().filter(n => n !== draggedChamberNum);
    const targetIndex = order.indexOf(targetChNum);
    const targetEl = document.getElementById('tree-item-' + targetChNum);
    const rect = targetEl ? targetEl.getBoundingClientRect() : null;
    const isTopHalf = rect ? ((e.clientY - rect.top) < (rect.height / 2)) : true;

    const insertIndex = isTopHalf ? targetIndex : targetIndex + 1;
    order.splice(insertIndex, 0, draggedChamberNum);
    saveChambersOrder(order);

    renderChambersExplorerTree();
    showToast(`تم تغيير ترتيب الحجرة #${draggedChamberNum} بنجاح! ⇅`, 'info', 1200);
    draggedChamberNum = null;
  };

  // ==========================================
  // سحب وإفلات ملفات المجلدات (Folder Files Drag & Drop)
  // ==========================================
  window.handleFileDragStart = function (e, folderKey, fileId) {
    draggedFile = { folderKey, fileId };
    draggedChamberNum = null;
    draggedFolderKey = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'file', folderKey, fileId }));
    setTimeout(() => {
      const el = document.getElementById('tree-file-' + fileId);
      if (el) el.classList.add('is-dragging');
    }, 0);
  };

  window.handleFileDragOver = function (e, folderKey, fileId) {
    if (!draggedFile && !draggedChamberNum) return;
    if (draggedFile && draggedFile.fileId === fileId) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const targetEl = document.getElementById('tree-file-' + fileId);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const isTopHalf = (e.clientY - rect.top) < (rect.height / 2);
      targetEl.classList.toggle('drag-over-top', isTopHalf);
      targetEl.classList.toggle('drag-over-bottom', !isTopHalf);
    }
  };

  window.handleFileDragLeave = function (e) {
    if (e.currentTarget) {
      e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  };

  window.handleFileDrop = function (e, targetFileId, targetFolderKey) {
    e.preventDefault();
    e.stopPropagation();
    clearAllDragClasses();

    // 1. إذا كان المسحوب هو حجرة تم إفلاتها فوق ملف
    if (draggedChamberNum) {
      const meta = getChamberMeta(draggedChamberNum);
      const prevFolder = meta.folder || (draggedChamberNum <= 7 ? 'book' : 'drafts');
      if (prevFolder !== targetFolderKey) {
        meta.folder = targetFolderKey;
        saveChamberMeta(draggedChamberNum, meta);
        renderChambersExplorerTree();
        showToast(`تم نقل الحجرة #${draggedChamberNum} إلى المجلد! 📁`, 'success', 1400);
      }
      draggedChamberNum = null;
      return;
    }

    // 2. إذا كان المسحوب هو ملف
    if (!draggedFile) return;
    const { folderKey: srcFolderKey, fileId: srcFileId } = draggedFile;
    draggedFile = null;

    if (srcFolderKey === targetFolderKey && srcFileId === targetFileId) return;

    const targetEl = document.getElementById('tree-file-' + targetFileId);
    const rect = targetEl ? targetEl.getBoundingClientRect() : null;
    const isTopHalf = rect ? ((e.clientY - rect.top) < (rect.height / 2)) : true;

    if (srcFolderKey === targetFolderKey) {
      // إعادة ترتيب الملفات داخل نفس المجلد
      const files = getFolderFiles(targetFolderKey);
      const srcIndex = files.findIndex(f => f.id === srcFileId);
      if (srcIndex === -1) return;
      const [movingFile] = files.splice(srcIndex, 1);

      let targetIndex = files.findIndex(f => f.id === targetFileId);
      if (targetIndex === -1) targetIndex = files.length;
      const insertIndex = isTopHalf ? targetIndex : targetIndex + 1;
      files.splice(insertIndex, 0, movingFile);

      resequenceFolderFiles(targetFolderKey, files);
      saveFolderFiles(targetFolderKey, files);
      renderChambersExplorerTree();
      showToast(`تم تغيير ترتيب ملف "${movingFile.title}" بنجاح! ⇅`, 'info', 1200);
    } else {
      // نقل الملف من مجلد إلى مجلد آخر عند الموضع المستهدف
      const srcFiles = getFolderFiles(srcFolderKey);
      const srcIndex = srcFiles.findIndex(f => f.id === srcFileId);
      if (srcIndex === -1) return;
      const [movingFile] = srcFiles.splice(srcIndex, 1);
      resequenceFolderFiles(srcFolderKey, srcFiles);
      saveFolderFiles(srcFolderKey, srcFiles);

      const targetFiles = getFolderFiles(targetFolderKey);
      let targetIndex = targetFiles.findIndex(f => f.id === targetFileId);
      if (targetIndex === -1) targetIndex = targetFiles.length;
      const insertIndex = isTopHalf ? targetIndex : targetIndex + 1;
      targetFiles.splice(insertIndex, 0, movingFile);
      resequenceFolderFiles(targetFolderKey, targetFiles);
      saveFolderFiles(targetFolderKey, targetFiles);

      if (activeExplorerFile && activeExplorerFile.folderKey === srcFolderKey && activeExplorerFile.fileId === srcFileId) {
        activeExplorerFile.folderKey = targetFolderKey;
        try { localStorage.setItem('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
      }

      collapsedFolders[targetFolderKey] = false;
      renderChambersExplorerTree();
      const allFolders = getAppFolders();
      const destFolder = allFolders.find(f => f.key === targetFolderKey);
      showToast(`تم نقل ملف "${movingFile.title}" إلى مجلد "${destFolder ? destFolder.name : targetFolderKey}"! 📁`, 'success', 1500);
    }
  };

  window.handleFileDragEnd = function (e) {
    clearAllDragClasses();
    draggedFile = null;
    draggedChamberNum = null;
    draggedFolderKey = null;
  };

  window.handleFolderDragOver = function (e, folderKey) {
    if (draggedFolderKey) {
      if (draggedFolderKey === folderKey || isDescendantFolder(draggedFolderKey, folderKey)) {
        return;
      }
    }
    if (!draggedFolderKey && !draggedChamberNum && !draggedFile) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const folderEl = document.getElementById('obsidian-folder-' + folderKey);
    if (folderEl) {
      const header = folderEl.querySelector('.obsidian-folder-header');
      if (header) header.classList.add('folder-drag-over');
    }
  };

  window.handleFolderDragLeave = function (e, folderKey) {
    const folderEl = document.getElementById('obsidian-folder-' + folderKey);
    if (folderEl) {
      const header = folderEl.querySelector('.obsidian-folder-header');
      if (header) header.classList.remove('folder-drag-over');
    }
  };

  window.handleFolderDrop = function (e, targetFolderKey) {
    e.preventDefault();
    e.stopPropagation();
    clearAllDragClasses();

    // 1. معالجة سحب وإفلات مجلد داخل مجلد آخر
    if (draggedFolderKey) {
      if (draggedFolderKey === targetFolderKey || isDescendantFolder(draggedFolderKey, targetFolderKey)) {
        draggedFolderKey = null;
        return;
      }
      let customFolders = [];
      try {
        customFolders = JSON.parse(localStorage.getItem('vienix_custom_folders') || '[]');
      } catch (err) {}
      const target = customFolders.find(f => f.key === draggedFolderKey);
      if (target) {
        target.parent = targetFolderKey;
        try {
          localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
        } catch (err) {}
        collapsedFolders[targetFolderKey] = false;
        renderChambersExplorerTree();
        const all = getAppFolders();
        const dest = all.find(f => f.key === targetFolderKey);
        showToast(`تم نقل مجلد "${target.name}" إلى داخل "${dest ? dest.name : ''}"! 📁`, 'success', 1600);
      }
      draggedFolderKey = null;
      return;
    }

    // 2. معالجة سحب وإفلات ملف داخل مجلد
    if (draggedFile) {
      const { folderKey: srcFolderKey, fileId: srcFileId } = draggedFile;
      draggedFile = null;
      if (srcFolderKey === targetFolderKey) return;

      const srcFiles = getFolderFiles(srcFolderKey);
      const srcIndex = srcFiles.findIndex(f => f.id === srcFileId);
      if (srcIndex === -1) return;
      const [movingFile] = srcFiles.splice(srcIndex, 1);
      resequenceFolderFiles(srcFolderKey, srcFiles);
      saveFolderFiles(srcFolderKey, srcFiles);

      const targetFiles = getFolderFiles(targetFolderKey);
      targetFiles.push(movingFile);
      resequenceFolderFiles(targetFolderKey, targetFiles);
      saveFolderFiles(targetFolderKey, targetFiles);

      if (activeExplorerFile && activeExplorerFile.folderKey === srcFolderKey && activeExplorerFile.fileId === srcFileId) {
        activeExplorerFile.folderKey = targetFolderKey;
        try { localStorage.setItem('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
      }

      collapsedFolders[targetFolderKey] = false;
      renderChambersExplorerTree();
      const allFolders = getAppFolders();
      const dest = allFolders.find(f => f.key === targetFolderKey);
      showToast(`تم نقل ملف "${movingFile.title}" إلى مجلد "${dest ? dest.name : targetFolderKey}"! 📁`, 'success', 1600);
      return;
    }

    // 3. معالجة سحب وإفلات حجرة داخل مجلد
    if (!draggedChamberNum) return;
    const meta = getChamberMeta(draggedChamberNum);
    const prevFolder = meta.folder || (draggedChamberNum <= 7 ? 'book' : 'drafts');
    if (prevFolder !== targetFolderKey) {
      meta.folder = targetFolderKey;
      saveChamberMeta(draggedChamberNum, meta);
      renderChambersExplorerTree();
      showToast(`تم نقل الحجرة #${draggedChamberNum} إلى المجلد! 📁`, 'success', 1400);
    }
    draggedChamberNum = null;
  };

  window.handleRootTreeDragOver = function (e) {
    if (!draggedFolderKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const treeEl = document.getElementById('explorer-tree');
    if (treeEl) treeEl.classList.add('root-drag-over');
  };

  window.handleRootTreeDragLeave = function (e) {
    const treeEl = document.getElementById('explorer-tree');
    if (treeEl && e.relatedTarget && !treeEl.contains(e.relatedTarget)) {
      treeEl.classList.remove('root-drag-over');
    }
  };

  window.handleRootTreeDrop = function (e) {
    if (!draggedFolderKey) return;
    e.preventDefault();
    clearAllDragClasses();

    let customFolders = [];
    try {
      customFolders = JSON.parse(localStorage.getItem('vienix_custom_folders') || '[]');
    } catch (err) {}
    const target = customFolders.find(f => f.key === draggedFolderKey);
    if (target && target.parent) {
      target.parent = null;
      try {
        localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
      } catch (err) {}
      renderChambersExplorerTree();
      showToast(`تم تحويل مجلد "${target.name}" إلى مجلد رئيسي مستقل! 📁`, 'success', 1600);
    }
    draggedFolderKey = null;
  };

  window.handleItemDragEnd = function (e) {
    clearAllDragClasses();
    draggedChamberNum = null;
    draggedFolderKey = null;
    draggedFile = null;
  };

  // ==========================================
  // نافذة نقل الحجرة إلى مجلد آخر (Move Folder Modal)
  // ==========================================
  // رندرة خيارات المجلدات داخل نافذة النقل الاحترافية
  function renderMoveFolderOptions(currentFolderKey) {
    const container = document.getElementById('move-folder-options-container');
    if (!container) return;
    const allFolders = getAppFolders();
    container.innerHTML = allFolders.map(f => {
      const isCurrent = (f.key === currentFolderKey);
      const parentFolder = f.parent ? allFolders.find(p => p.key === f.parent) : null;
      const prefix = parentFolder ? `<span style="color:#d97706; font-size:0.75rem;">${escapeHtml(parentFolder.name)} / </span>` : '';
      const currentBadge = isCurrent ? `<span class="folder-pick-current-badge">المجلد الحالي</span>` : '';
      return `
        <button type="button" class="folder-pick-btn ${isCurrent ? 'is-current' : ''}" onclick="confirmMoveFolder('${f.key}')" title="${isCurrent ? 'المجلد الحالي' : 'نقل إلى ' + escapeHtml(f.name)}">
          <span class="folder-pick-icon">${f.key === 'archive' ? '🗄️' : (f.key === 'book' ? '📖' : '📁')}</span>
          <div class="folder-pick-info" style="flex:1;">
            <strong>${f.parent ? '&nbsp;&nbsp;└── ' : ''}${prefix}${escapeHtml(f.name)}</strong>
            <small>${escapeHtml(f.desc)}</small>
          </div>
          ${currentBadge}
        </button>
      `;
    }).join('');
  }

  // نافذة نقل الحجرة إلى مجلد آخر (Move Chamber Modal)
  window.openMoveFolderModal = function (chNum, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const ch = parseInt(chNum, 10);
    moveFolderTargetChamber = ch;
    moveFolderTarget = { type: 'chamber', chamberNum: ch };

    const modal = document.getElementById('move-folder-modal');
    const titleEl = document.getElementById('move-folder-modal-title');
    const desc = document.getElementById('move-folder-chamber-desc');
    const newFolderInput = document.getElementById('move-new-folder-name-input');
    if (!modal) return;

    if (titleEl) titleEl.textContent = 'نقل الحجرة إلى مجلد';

    const title = getChamberTitle(ch);
    const meta = getChamberMeta(ch);
    const currentFolderKey = meta.folder || (ch <= 7 ? 'book' : 'drafts');

    if (desc) {
      desc.innerHTML = `اختر المجلد الذي ترغب بنقل <strong>(حجرة #${ch}: ${escapeHtml(title)})</strong> إليه:`;
    }

    renderMoveFolderOptions(currentFolderKey);

    if (newFolderInput) newFolderInput.value = '';
    modal.style.display = 'flex';
  };

  window.closeMoveFolderModal = function (e) {
    if (e && e.target && e.target.id !== 'move-folder-modal' && !e.target.classList.contains('diff-modal-close') && e.target.tagName !== 'BUTTON') {
      return;
    }
    const modal = document.getElementById('move-folder-modal');
    if (modal) modal.style.display = 'none';
    moveFolderTarget = null;
    moveFolderTargetChamber = null;
  };

  window.confirmMoveFolder = function (targetFolder) {
    if (!moveFolderTarget && !moveFolderTargetChamber) return;
    const modal = document.getElementById('move-folder-modal');

    // 1. إذا كان العنصر المنقول ملفاً داخل مجلد
    if (moveFolderTarget && moveFolderTarget.type === 'file') {
      const { folderKey: srcFolderKey, fileId } = moveFolderTarget;
      if (srcFolderKey === targetFolder) {
        showToast('الملف موجود بالفعل داخل هذا المجلد!', 'info', 1500);
        if (modal) modal.style.display = 'none';
        moveFolderTarget = null;
        return;
      }

      const srcFiles = getFolderFiles(srcFolderKey);
      const fileIdx = srcFiles.findIndex(f => f.id === fileId);
      if (fileIdx === -1) {
        if (modal) modal.style.display = 'none';
        moveFolderTarget = null;
        return;
      }

      const [movingFile] = srcFiles.splice(fileIdx, 1);
      resequenceFolderFiles(srcFolderKey, srcFiles);
      saveFolderFiles(srcFolderKey, srcFiles);

      const destFiles = getFolderFiles(targetFolder);
      destFiles.push(movingFile);
      resequenceFolderFiles(targetFolder, destFiles);
      saveFolderFiles(targetFolder, destFiles);

      if (activeExplorerFile && activeExplorerFile.folderKey === srcFolderKey && activeExplorerFile.fileId === fileId) {
        activeExplorerFile.folderKey = targetFolder;
        try { localStorage.setItem('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
      }

      collapsedFolders[targetFolder] = false;
      renderChambersExplorerTree();
      const allFolders = getAppFolders();
      const dest = allFolders.find(f => f.key === targetFolder);
      showToast(`تم نقل ملف "${movingFile.title}" إلى مجلد "${dest ? dest.name : targetFolder}" بنجاح! 📂`, 'success', 1600);

      if (modal) modal.style.display = 'none';
      moveFolderTarget = null;
      return;
    }

    // 2. إذا كان العنصر المنقول حجرة
    const targetChamber = (moveFolderTarget && moveFolderTarget.chamberNum) || moveFolderTargetChamber;
    if (targetChamber) {
      const meta = getChamberMeta(targetChamber);
      const curFolder = meta.folder || (targetChamber <= 7 ? 'book' : 'drafts');
      if (curFolder === targetFolder) {
        showToast('الحجرة موجودة بالفعل داخل هذا المجلد!', 'info', 1500);
        if (modal) modal.style.display = 'none';
        moveFolderTarget = null;
        moveFolderTargetChamber = null;
        return;
      }
      window.moveChamberToFolder(targetChamber, targetFolder);
      if (modal) modal.style.display = 'none';
      moveFolderTarget = null;
      moveFolderTargetChamber = null;
    }
  };

  // إنشاء مجلد جديد ونقل الملف أو الحجرة إليه مباشرة وبنقرة واحدة
  window.confirmCreateFolderAndMove = function () {
    const input = document.getElementById('move-new-folder-name-input');
    const name = (input?.value || '').trim();
    if (!name) {
      showToast('يرجى إدخال اسم المجلد الجديد!', 'warning', 1600);
      input?.focus();
      return;
    }

    const key = 'custom_' + Date.now().toString(36);
    let customFolders = [];
    try {
      const saved = localStorage.getItem('vienix_custom_folders');
      if (saved) customFolders = JSON.parse(saved);
    } catch (e) {}

    customFolders.push({ key, name, desc: 'مجلد مخصص', isCustom: true, parent: null });
    try {
      localStorage.setItem('vienix_custom_folders', JSON.stringify(customFolders));
    } catch (e) {}

    collapsedFolders[key] = false;

    // نقل العنصر المستهدف فوراً إلى هذا المجلد الجديد المنشأ
    confirmMoveFolder(key);
  };

  // ==========================================
  // رندرة شجرة المجلدات والفصول (Explorer Tree View)
  // ==========================================
  function renderChambersExplorerTree() {
    const treeEl = document.getElementById('explorer-tree');
    if (!treeEl) return;

    const foldersDef = getAppFolders();
    const chambersOrder = getChambersOrder();

    // إزالة علامة المربع (#) وتصحيح ترقيم الملفات القديمة المتضاربة (مثل ملف 666)
    try {
      foldersDef.forEach(folder => {
        const folderFiles = getFolderFiles(folder.key);
        let changed = false;
        folderFiles.forEach(f => {
          if (f.title && f.title.includes('ملف #')) {
            f.title = f.title.replace(/ملف\s*#(\d+)/g, 'ملف $1');
            changed = true;
          }
        });

        // تصحيح ترقيم الملفات إذا كان هناك ملف أخذ رقماً مساوياً أو أقل من حجرات المجلد (مثل ملف 666 الذي أخذ #7)
        let maxChamberNum = 0;
        for (let ch = 1; ch <= 7; ch++) {
          const meta = getChamberMeta(ch);
          const chFolder = meta.folder || (ch <= 7 ? 'book' : 'drafts');
          if (chFolder === folder.key && ch > maxChamberNum) {
            maxChamberNum = ch;
          }
        }

        const hasInvalidNum = folderFiles.some(f => !f.num || (maxChamberNum > 0 && f.num <= maxChamberNum));
        if (hasInvalidNum) {
          let currentMax = maxChamberNum;
          folderFiles.forEach(f => {
            if (typeof f.num === 'number' && f.num > maxChamberNum && f.num > currentMax) {
              currentMax = f.num;
            }
          });
          folderFiles.forEach(f => {
            if (!f.num || (maxChamberNum > 0 && f.num <= maxChamberNum)) {
              currentMax++;
              f.num = currentMax;
              changed = true;
            }
          });
        }

        if (changed) saveFolderFiles(folder.key, folderFiles);
      });
      if (activeExplorerFile && activeExplorerFile.title && activeExplorerFile.title.includes('ملف #')) {
        activeExplorerFile.title = activeExplorerFile.title.replace(/ملف\s*#(\d+)/g, 'ملف $1');
        try { localStorage.setItem('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (e) {}
        if (activeChamber === 8) {
          setChamberCustomTitle(8, activeExplorerFile.title);
        }
      }
    } catch (e) {}

    let totalProjectWords = 0;
    let filledChambersCount = 0;
    const folderBuckets = {};
    foldersDef.forEach(f => { folderBuckets[f.key] = []; });

    for (let i = 1; i <= 7; i++) {
      const content = getChamberContent(i);
      const isFilled = content.trim().length > 0;
      const meta = getChamberMeta(i);
      const title = getChamberTitle(i);
      const words = meta.words || 0;
      const chars = meta.chars || 0;
      const updatedAt = meta.updatedAt || Date.now();
      const isActive = i === activeChamber;

      if (isFilled) {
        filledChambersCount++;
        totalProjectWords += words;
      }

      if (explorerSearchFilter) {
        const matchTitle = title.toLowerCase().includes(explorerSearchFilter);
        const matchContent = content.toLowerCase().includes(explorerSearchFilter);
        const matchNum = i.toString() === explorerSearchFilter;
        if (!matchTitle && !matchContent && !matchNum) {
          continue;
        }
      }

      let assignedFolder = meta.folder || (i <= 7 ? 'book' : 'drafts');
      if (!folderBuckets[assignedFolder]) assignedFolder = 'drafts';
      if (!folderBuckets[assignedFolder]) folderBuckets[assignedFolder] = [];

      folderBuckets[assignedFolder].push({
        num: i,
        title,
        isCustom: !!(meta.customTitle && meta.customTitle.trim()),
        content,
        isFilled,
        isActive,
        words,
        chars,
        updatedAt,
        folder: assignedFolder
      });
    }

    // ترتيب الحجرات داخل كل مجلد حسب الترتيب المخصص بالسحب والإفلات
    Object.keys(folderBuckets).forEach(k => {
      folderBuckets[k].sort((a, b) => {
        return chambersOrder.indexOf(a.num) - chambersOrder.indexOf(b.num);
      });
    });

    let totalFilesCount = 0;
    foldersDef.forEach(f => {
      totalFilesCount += (folderBuckets[f.key] || []).length;
      totalFilesCount += getFolderFiles(f.key).length;
    });
    const totalFoldersCount = foldersDef.length;

    const foldersCountEl = document.getElementById('explorer-folders-count') || document.getElementById('explorer-total-words');
    const filesCountEl = document.getElementById('explorer-files-count') || document.getElementById('explorer-filled-count');
    const activeNumEl = document.getElementById('explorer-active-num');
    // استخدام الأرقام اللاتينية بشكل صارم (Western Latin Numerals 1, 2, 3...)
    if (foldersCountEl) foldersCountEl.textContent = `${totalFoldersCount} مجلدات`;
    if (filesCountEl) filesCountEl.textContent = `${totalFilesCount} ملف`;
    if (activeNumEl) activeNumEl.textContent = activeChamber === 8 ? 'المستعرض: 🟢 ملف' : `النشطة: #${activeChamber}`;

    // حساب عدد الحجرات التراكمي للمجلد والمجلدات المتفرعة منه
    function getFolderTotalCount(folderKey) {
      let count = (folderBuckets[folderKey] || []).length;
      count += getFolderFiles(folderKey).length;
      const subFolders = foldersDef.filter(f => f.parent === folderKey);
      subFolders.forEach(sub => {
        count += getFolderTotalCount(sub.key);
      });
      return count;
    }

    // رندرة عنصر الحجرة الشجري (نمط الفهرس العصري: سطر واحد مدمج بدون # وبدون أسطر ثانوية)
    function renderItemHTML(item, parentFolderKey) {
      const editIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      const moveIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
      const copyIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      const pasteIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`;
      const clearIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

      const formattedNum = String(item.num).padStart(2, '0');

      return `
        <div class="obsidian-tree-item ${item.isActive ? 'active' : ''}"
             id="tree-item-${item.num}"
             draggable="true"
             ondragstart="handleItemDragStart(event, ${item.num})"
             ondragover="handleItemDragOver(event, ${item.num})"
             ondragleave="handleItemDragLeave(event)"
             ondrop="handleItemDrop(event, ${item.num}, '${parentFolderKey}')"
             ondragend="handleItemDragEnd(event)"
             onclick="handleTreeItemClick(event, ${item.num})"
             oncontextmenu="handleTreeItemContextMenu(event, ${item.num})">
          <span class="obsidian-item-num" title="حجرة رقم ${item.num}">${formattedNum}</span>
          <span class="obsidian-dot ${item.isFilled ? 'filled' : 'empty'}" title="${item.isFilled ? 'محتوى مكتوب' : 'فارغة'}"></span>
          <div class="obsidian-item-title-row" id="tree-title-row-${item.num}">
            <span class="obsidian-item-title" id="tree-title-${item.num}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            ${item.isActive ? '<span class="obsidian-active-indicator" title="الحجرة النشطة"></span>' : ''}
          </div>
          <div class="obsidian-item-actions">
            <button type="button" class="obsidian-action-btn" onclick="startTreeInlineRename(event, ${item.num})" title="إعادة تسمية مخصصة">
              ${editIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="openMoveFolderModal(${item.num}, event)" title="نقل لمجلد">
              ${moveIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="copyChamberFromTree(event, ${item.num})" title="نسخ المحتوى">
              ${copyIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="pasteToChamberFromTree(event, ${item.num})" title="لصق المحتوى للحجرة">
              ${pasteIcon}
            </button>
            <button type="button" class="obsidian-action-btn danger" onclick="clearChamberFromTree(event, ${item.num})" title="حذف وإفراغ الحجرة">
              ${clearIcon}
            </button>
          </div>
        </div>
      `;
    }

    // رندرة ملفات المجلد المستنسخة أو المنقولة أو المنشأة (نمط الفهرس العصري: سطر واحد مدمج بدون # وبدون أسطر ثانوية)
    function renderFolderFileHTML(file, parentFolderKey) {
      const isViewingInChamber8 = (activeChamber === 8 && activeExplorerFile && activeExplorerFile.folderKey === parentFolderKey && activeExplorerFile.fileId === file.id);
      const isFilled = !!(file.content && file.content.trim().length > 0);

      const editIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      const moveIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
      const copyIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      const pasteIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`;
      const clearIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

      const formattedNum = String(file.num).padStart(2, '0');

      return `
        <div class="obsidian-tree-item is-folder-file ${isViewingInChamber8 ? 'active' : ''}"
             id="tree-file-${file.id}"
             draggable="true"
             ondragstart="handleFileDragStart(event, '${parentFolderKey}', '${file.id}')"
             ondragover="handleFileDragOver(event, '${parentFolderKey}', '${file.id}')"
             ondragleave="handleFileDragLeave(event)"
             ondrop="handleFileDrop(event, '${file.id}', '${parentFolderKey}')"
             ondragend="handleFileDragEnd(event)"
             onclick="handleFolderFileClick('${parentFolderKey}', '${file.id}')">
          <span class="obsidian-item-num" title="ملف رقم ${file.num}">${formattedNum}</span>
          <span class="obsidian-dot ${isFilled ? 'filled' : 'empty'}" title="${isFilled ? 'محتوى مكتوب' : 'فارغ'}"></span>
          <div class="obsidian-item-title-row" id="tree-title-row-file-${file.id}">
            <span class="obsidian-item-title" id="tree-title-file-${file.id}" title="${escapeHtml(file.title)}">${escapeHtml(file.title)}</span>
            ${isViewingInChamber8 ? '<span class="obsidian-active-indicator" title="قيد العرض"></span>' : ''}
          </div>
          <div class="obsidian-item-actions">
            <button type="button" class="obsidian-action-btn" onclick="startFolderFileRename(event, '${parentFolderKey}', '${file.id}')" title="إعادة تسمية الملف">
              ${editIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="openMoveFolderFileModal('${parentFolderKey}', '${file.id}', event)" title="نقل لمجلد">
              ${moveIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="copyFolderFileContent(event, '${parentFolderKey}', '${file.id}')" title="نسخ المحتوى">
              ${copyIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="pasteToFolderFile(event, '${parentFolderKey}', '${file.id}')" title="لصق المحتوى للملف">
              ${pasteIcon}
            </button>
            <button type="button" class="obsidian-action-btn danger" onclick="deleteFolderFile(event, '${parentFolderKey}', '${file.id}')" title="حذف الملف من المجلد">
              ${clearIcon}
            </button>
          </div>
        </div>
      `;
    }

    // رندرة شجرة المجلد بما فيها التفرعات الداخلية
    function renderFolderNode(f, depth) {
      const items = folderBuckets[f.key] || [];
      const folderFiles = getFolderFiles(f.key);
      const subFolders = foldersDef.filter(child => child.parent === f.key);
      const isCollapsed = explorerSearchFilter ? false : (collapsedFolders[f.key] !== false);
      const count = getFolderTotalCount(f.key);
      const isSub = depth > 0;

      let filteredFiles = folderFiles;
      if (explorerSearchFilter) {
        filteredFiles = folderFiles.filter(file => {
          const matchTitle = (file.title || '').toLowerCase().includes(explorerSearchFilter);
          const matchContent = (file.content || '').toLowerCase().includes(explorerSearchFilter);
          const matchNum = file.num.toString() === explorerSearchFilter;
          return matchTitle || matchContent || matchNum;
        });
      }

      const folderSvg = `
        <svg class="win-folder-svg sm" viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path d="M2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H9.2C9.7 3.5 10.2 3.7 10.6 4.1L12.4 5.9C12.8 6.3 13.3 6.5 13.8 6.5H19.5C20.6 6.5 21.5 7.4 21.5 8.5V10H2.5V5.5Z" fill="${f.key === 'archive' ? '#64748b' : '#D97706'}"/>
          <path d="M3 8.5H21V18C21 19.1 20.1 20 19 20H5C3.9 20 3 19.1 3 18V8.5Z" fill="${f.key === 'archive' ? '#cbd5e1' : '#FDE68A'}"/>
          <path d="M2 9.5C2 8.67 2.67 8 3.5 8H20.5C21.33 8 22 8.67 22 9.5V18C22 19.38 20.88 20.5 19.5 20.5H4.5C3.12 20.5 2 19.38 2 18V9.5Z" fill="${f.key === 'archive' ? '#94a3b8' : '#F59E0B'}"/>
        </svg>
      `;

      // لا يظهر الرقم إلا إذا تجاوز عدد المحتويات 10 عناصر
      const countBadge = count > 10 ? `<span class="obsidian-folder-count">${count}</span>` : '';

      let nodeHTML = `
        <div class="obsidian-folder ${isSub ? 'sub-folder' : ''} ${isCollapsed ? 'collapsed' : ''}" id="obsidian-folder-${f.key}" data-folder-key="${f.key}">
          <div class="obsidian-folder-header"
               draggable="true"
               ondragstart="handleFolderDragStart(event, '${f.key}')"
               ondragend="handleFolderDragEnd(event)"
               onclick="toggleTreeFolder('${f.key}')"
               oncontextmenu="handleFolderContextMenu(event, '${f.key}')"
               ondragover="handleFolderDragOver(event, '${f.key}')"
               ondragleave="handleFolderDragLeave(event, '${f.key}')"
               ondrop="handleFolderDrop(event, '${f.key}')"
               title="${f.desc}">
            <span class="obsidian-folder-arrow">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </span>
            <span class="obsidian-folder-icon">
              ${folderSvg}
            </span>
            <span class="obsidian-folder-name" id="folder-name-${f.key}">${f.name}</span>
            ${countBadge}
          </div>
          <div class="obsidian-folder-children" id="obsidian-children-${f.key}" ondragover="handleFolderDragOver(event, '${f.key}')" ondragleave="handleFolderDragLeave(event, '${f.key}')" ondrop="handleFolderDrop(event, '${f.key}')">
      `;

      // 1. رندرة المجلدات الفرعية داخل هذا المجلد أولاً
      if (subFolders.length > 0) {
        subFolders.forEach(sub => {
          nodeHTML += renderFolderNode(sub, depth + 1);
        });
      }

      // 2. رندرة الحجرات المنتمية مباشرة لهذا المجلد (1 إلى 7)
      if (items.length > 0) {
        items.forEach(item => {
          nodeHTML += renderItemHTML(item, f.key);
        });
      }

      // 3. رندرة ملفات المجلد مرتبة تصاعدياً لتأتي بعد الحجرات مباشرة (8 بعد 7 وهكذا)
      if (filteredFiles.length > 0) {
        const sortedFiles = [...filteredFiles].sort((a, b) => (a.num || 0) - (b.num || 0));
        sortedFiles.forEach(file => {
          nodeHTML += renderFolderFileHTML(file, f.key);
        });
      }

      if (items.length === 0 && subFolders.length === 0 && filteredFiles.length === 0) {
        nodeHTML += `
          <div style="padding: 6px 12px; font-size: 0.74rem; color: #94a3b8; text-align: center; font-style: italic;">
            لا توجد محتويات هنا حالياً
          </div>
        `;
      }

      nodeHTML += `
          </div>
        </div>
      `;
      return nodeHTML;
    }

    // رندرة المجلدات الأساسية التي لا تمتلك مجلداً أباً
    const rootFolders = foldersDef.filter(f => !f.parent);
    let treeHTML = '';
    rootFolders.forEach(rf => {
      treeHTML += renderFolderNode(rf, 0);
    });

    treeEl.innerHTML = treeHTML;
  }
  window.renderChambersExplorerTree = renderChambersExplorerTree;

  window.handleTreeItemClick = function (e, chNum) {
    if (e.target.closest('.obsidian-item-actions') || e.target.closest('.obsidian-inline-edit-box') || e.target.closest('.tree-action-btn')) {
      return;
    }
    window.switchChamber(chNum);
    renderChambersExplorerTree();
  };

  // ==========================================
  // إعادة التسمية التفاعلية المباشرة (Inline Rename)
  // ==========================================
  let activeInlineRenameOutsideHandler = null;

  function attachInlineRenameOutsideListener(onCancel) {
    cleanupInlineRenameOutsideListener();

    activeInlineRenameOutsideHandler = function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('.obsidian-inline-edit-box')) {
        return;
      }
      cleanupInlineRenameOutsideListener();
      if (typeof onCancel === 'function') {
        onCancel();
      }
    };

    setTimeout(() => {
      document.addEventListener('pointerdown', activeInlineRenameOutsideHandler, true);
    }, 50);
  }

  function cleanupInlineRenameOutsideListener() {
    if (activeInlineRenameOutsideHandler) {
      document.removeEventListener('pointerdown', activeInlineRenameOutsideHandler, true);
      activeInlineRenameOutsideHandler = null;
    }
  }

  window.startTreeInlineRename = function (e, chNum) {
    if (e && e.stopPropagation) e.stopPropagation();
    const titleRow = document.getElementById('tree-title-row-' + chNum);
    if (!titleRow) return;

    const currentTitle = getChamberTitle(chNum);
    const initialVal = (currentTitle === 'فارغة' || currentTitle.startsWith('محتوى (')) ? '' : currentTitle;

    titleRow.innerHTML = `
      <div class="obsidian-inline-edit-box" onclick="event.stopPropagation()">
        <input type="text" class="obsidian-rename-input" id="tree-rename-input-${chNum}" value="${escapeHtml(initialVal)}" placeholder="اسم الحجرة..." />
        <button type="button" class="obsidian-edit-save-btn" onclick="saveTreeInlineRename(event, ${chNum})" title="حفظ الاسم">✓</button>
        <button type="button" class="obsidian-edit-cancel-btn" onclick="cancelTreeInlineRename(event)" title="إلغاء">✕</button>
      </div>
    `;

    attachInlineRenameOutsideListener(() => {
      cancelTreeInlineRename();
    });

    const input = document.getElementById('tree-rename-input-' + chNum);
    if (input) {
      input.focus();
      input.select();
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          window.saveTreeInlineRename(ev, chNum);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          window.cancelTreeInlineRename(ev);
        }
      });
    }
  };

  window.saveTreeInlineRename = function (e, chNum) {
    if (e && e.stopPropagation) e.stopPropagation();
    cleanupInlineRenameOutsideListener();
    const input = document.getElementById('tree-rename-input-' + chNum);
    const val = input ? input.value.trim() : '';
    window.setChamberCustomTitle(chNum, val);
  };

  window.cancelTreeInlineRename = function (e) {
    if (e && e.stopPropagation) e.stopPropagation();
    cleanupInlineRenameOutsideListener();
    renderChambersExplorerTree();
  };

  // ==========================================
  // نسخ وتفريغ الحجرة من الشجرة
  // ==========================================
  window.copyChamberFromTree = function (e, chNum) {
    if (e && e.stopPropagation) e.stopPropagation();
    const val = getChamberContent(chNum);
    if (!val || val.trim() === '') {
      showToast(`الحجرة ${chNum} فارغة حالياً، لا يوجد نص لنسخه!`, 'info', 1600);
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(() => {
        showToast(`تم نسخ محتوى الحجرة ${chNum} للحافظة بنجاح! 📋`, 'success', 1500);
      }).catch(() => {
        fallbackCopyText(val, chNum);
      });
    } else {
      fallbackCopyText(val, chNum);
    }
  };

  function fallbackCopyText(text, chNum) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`تم نسخ محتوى الحجرة ${chNum}! 📋`, 'success', 1500);
  }

  window.pasteToChamberFromTree = async function (e, chNum) {
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
      if (!text || text.trim() === '') {
        showToast('الحافظة فارغة حالياً!', 'warning', 1500);
        return;
      }

      setChamberContent(chNum, text);
      updateChamberMetaStats(chNum);
      updateChambersUI();
      if (typeof renderChambersExplorerTree === 'function') {
        renderChambersExplorerTree();
      }

      if (chNum === activeChamber) {
        if (typeof editor !== 'undefined' && editor) editor.value = text;
        if (typeof classicEditor !== 'undefined' && classicEditor) classicEditor.value = text;
        if (typeof updateMarkdownPreview === 'function') updateMarkdownPreview();
      }

      showToast(`تم لصق المحتوى في الحجرة ${chNum} بنجاح! 📋`, 'success', 1600);
    } catch (err) {
      showToast('يرجى السماح بصلاحية اللصق في المتصفح', 'error', 2000);
    }
  };

  window.clearChamberFromTree = function (e, chNum) {
    if (e && e.stopPropagation) e.stopPropagation();
    chNum = parseInt(chNum, 10);
    const val = getChamberContent(chNum);
    const meta = getChamberMeta(chNum);
    const hasCustomTitle = !!(meta && meta.customTitle && meta.customTitle.trim().length > 0);
    const hasContent = !!(val && val.trim().length > 0);

    if (!hasContent && !hasCustomTitle) {
      showToast(`الحجرة ${chNum} فارغة وافتراضية بالفعل! ✨`, 'info', 1400);
      return;
    }

    const title = getChamberTitle(chNum);
    const confirmMsg = `هل أنت متأكد من تفريغ الحجرة ${chNum} (${escapeHtml(title)}) وحذف التسمية المخصصة وإعادتها للوضع الافتراضي؟`;

    const doClear = () => {
      if (typeof detachChamberFromLinkedFiles === 'function') {
        detachChamberFromLinkedFiles(chNum);
      }

      setChamberContent(chNum, '');
      const curMeta = getChamberMeta(chNum);
      curMeta.customTitle = '';
      curMeta.folder = (chNum <= 7 ? 'book' : 'drafts');
      curMeta.words = 0;
      curMeta.chars = 0;
      curMeta.updatedAt = Date.now();
      saveChamberMeta(chNum, curMeta);

      if (chNum === activeChamber) {
        if (isClassicMode && classicEditor) {
          classicEditor.value = '';
          renderClassicMarkdown();
        } else if (editor) {
          editor.value = '';
          renderMarkdown();
        }
        updateStats();
      }

      updateChambersUI();
      renderChambersExplorerTree();
      showToast(`تم إفراغ الحجرة ${chNum} واستعادة وضعها الافتراضي 🗑️`, 'info', 1500);
    };

    if (typeof window.openActionConfirmModal === 'function') {
      window.openActionConfirmModal(
        '⚠️ تأكيد تفريغ الحجرة وحذف التخصيص',
        `هل أنت متأكد تماماً من تفريغ الحجرة ${chNum} <strong>"${escapeHtml(title)}"</strong> وحذف تخصيصها بالكامل؟`,
        'نعم، إفراغ الحجرة',
        doClear
      );
    } else {
      if (confirm(confirmMsg.replace(/<[^>]+>/g, ''))) {
        doClear();
      }
    }
  };

  // ==========================================
  // CHAMBERS DIFF & MATCHING (المطابقة والمقارنة)
  // ==========================================
  let diffChamberA = 1;
  let diffChamberB = 2;
  let diffViewType = 'split'; // 'split' or 'lines'

  window.openChambersDiffModal = function (chA, chB) {
    const overlay = document.getElementById('diff-modal-overlay');
    if (!overlay) return;

    // حفظ المحتوى النشط قبل فتح المطابقة
    const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
    setChamberContent(activeChamber, currentVal);

    diffChamberA = chA ? parseInt(chA, 10) : activeChamber;
    if (chB) {
      diffChamberB = parseInt(chB, 10);
    } else {
      diffChamberB = (diffChamberA % TOTAL_CHAMBERS) + 1;
      for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
        if (i !== diffChamberA && getChamberContent(i).trim().length > 0) {
          diffChamberB = i;
          break;
        }
      }
    }

    populateDiffSelectors();
    updateChambersDiffView();
    overlay.classList.add('active');
  };

  window.closeChambersDiffModal = function (e) {
    if (e && e.target && !e.target.classList.contains('diff-modal-overlay') && !e.target.classList.contains('diff-modal-close') && !e.target.closest('.diff-modal-close')) {
      return;
    }
    const overlay = document.getElementById('diff-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  };

  function populateDiffSelectors() {
    const selA = document.getElementById('diff-select-a');
    const selB = document.getElementById('diff-select-b');
    if (!selA || !selB) return;

    selA.innerHTML = '';
    selB.innerHTML = '';

    for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
      const isFilled = getChamberContent(i).trim().length > 0;
      const title = getChamberTitle(i);
      const label = `حجرة ${i}: ${isFilled ? title : '(فارغة)'}`;

      const optA = document.createElement('option');
      optA.value = i;
      optA.textContent = label;
      if (i === diffChamberA) optA.selected = true;
      selA.appendChild(optA);

      const optB = document.createElement('option');
      optB.value = i;
      optB.textContent = label;
      if (i === diffChamberB) optB.selected = true;
      selB.appendChild(optB);
    }
  }

  window.swapDiffChambers = function () {
    const temp = diffChamberA;
    diffChamberA = diffChamberB;
    diffChamberB = temp;
    populateDiffSelectors();
    updateChambersDiffView();
  };

  window.setDiffViewType = function (type) {
    diffViewType = type;
    document.getElementById('btn-diff-view-split')?.classList.toggle('active', type === 'split');
    document.getElementById('btn-diff-view-lines')?.classList.toggle('active', type === 'lines');
    updateChambersDiffView();
  };

  window.updateChambersDiffView = function () {
    const selA = document.getElementById('diff-select-a');
    const selB = document.getElementById('diff-select-b');
    if (selA) diffChamberA = parseInt(selA.value, 10);
    if (selB) diffChamberB = parseInt(selB.value, 10);

    const bodyEl = document.getElementById('diff-modal-body');
    const statsEl = document.getElementById('diff-summary-info');
    if (!bodyEl) return;

    const textA = getChamberContent(diffChamberA);
    const textB = getChamberContent(diffChamberB);

    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const wordsA = textA.trim() ? textA.trim().split(/\s+/).length : 0;
    const wordsB = textB.trim() ? textB.trim().split(/\s+/).length : 0;

    if (statsEl) {
      const isIdentical = textA === textB && textA.length > 0;
      statsEl.innerHTML = isIdentical
        ? `<span style="color:#10b981; font-weight:700;">✓ المحتويان متطابقان تماماً 100% (${wordsA} كلمة)</span>`
        : `حجرة (أ): ${linesA.length} سطر (${wordsA} كلمة) • حجرة (ب): ${linesB.length} سطر (${wordsB} كلمة)`;
    }

    if (diffViewType === 'split') {
      const parsedA = parseMarkdownWithMermaid(textA, 'diff-a');
      const parsedB = parseMarkdownWithMermaid(textB, 'diff-b');

      bodyEl.innerHTML = `
        <div class="diff-split-container">
          <div class="diff-pane">
            <div class="diff-pane-header">
              <span>الحجرة (أ) - حجرة ${diffChamberA}</span>
              <span>${wordsA} كلمة</span>
            </div>
            <div class="diff-pane-content markdown-body" id="diff-pane-content-a">${parsedA || '<p style="color:#94a3b8; font-style:italic;">هذه الحجرة فارغة</p>'}</div>
          </div>
          <div class="diff-pane">
            <div class="diff-pane-header">
              <span>الحجرة (ب) - حجرة ${diffChamberB}</span>
              <span>${wordsB} كلمة</span>
            </div>
            <div class="diff-pane-content markdown-body" id="diff-pane-content-b">${parsedB || '<p style="color:#94a3b8; font-style:italic;">هذه الحجرة فارغة</p>'}</div>
          </div>
        </div>
      `;

      const paneA = document.getElementById('diff-pane-content-a');
      const paneB = document.getElementById('diff-pane-content-b');

      if (paneA) {
        renderMermaidNodes(paneA);
        if (typeof Prism !== 'undefined') {
          paneA.querySelectorAll('pre code').forEach((el) => {
            if (!el.parentElement.classList.contains('mermaid')) Prism.highlightElement(el);
          });
        }
      }
      if (paneB) {
        renderMermaidNodes(paneB);
        if (typeof Prism !== 'undefined') {
          paneB.querySelectorAll('pre code').forEach((el) => {
            if (!el.parentElement.classList.contains('mermaid')) Prism.highlightElement(el);
          });
        }
      }
      if (paneA && paneB) {
        let isSyncing = false;
        paneA.addEventListener('scroll', () => {
          if (isSyncing) return;
          isSyncing = true;
          const maxA = paneA.scrollHeight - paneA.clientHeight;
          const maxB = paneB.scrollHeight - paneB.clientHeight;
          if (maxA > 0 && maxB > 0) {
            paneB.scrollTop = (paneA.scrollTop / maxA) * maxB;
          }
          isSyncing = false;
        });
        paneB.addEventListener('scroll', () => {
          if (isSyncing) return;
          isSyncing = true;
          const maxA = paneA.scrollHeight - paneA.clientHeight;
          const maxB = paneB.scrollHeight - paneB.clientHeight;
          if (maxA > 0 && maxB > 0) {
            paneA.scrollTop = (paneB.scrollTop / maxB) * maxA;
          }
          isSyncing = false;
        });
      }
    } else {
      const diffRows = computeSimpleLineDiff(linesA, linesB);
      let diffHtml = '<div class="diff-lines-container">';
      diffRows.forEach(row => {
        let cls = 'diff-line-unchanged';
        let prefix = ' ';
        if (row.type === 'add') {
          cls = 'diff-line-added';
          prefix = '+';
        } else if (row.type === 'remove') {
          cls = 'diff-line-removed';
          prefix = '-';
        }
        diffHtml += `<div class="diff-line-row ${cls}"><span class="diff-line-prefix">${prefix}</span><span>${escapeHtml(row.text)}</span></div>`;
      });
      diffHtml += '</div>';
      bodyEl.innerHTML = diffHtml;
    }
  };

  function computeSimpleLineDiff(linesA, linesB) {
    const diff = [];
    let i = 0, j = 0;

    while (i < linesA.length || j < linesB.length) {
      if (i < linesA.length && j < linesB.length && linesA[i] === linesB[j]) {
        diff.push({ type: 'same', text: linesA[i] });
        i++;
        j++;
      } else if (i < linesA.length && !linesB.includes(linesA[i])) {
        diff.push({ type: 'remove', text: linesA[i] });
        i++;
      } else if (j < linesB.length && !linesA.includes(linesB[j])) {
        diff.push({ type: 'add', text: linesB[j] });
        j++;
      } else {
        if (i < linesA.length) {
          diff.push({ type: 'remove', text: linesA[i] });
          i++;
        }
        if (j < linesB.length) {
          diff.push({ type: 'add', text: linesB[j] });
          j++;
        }
      }
    }
    return diff;
  }

  window.copyDiffChamberB = function () {
    const textB = getChamberContent(diffChamberB);
    if (!textB) {
      showToast('الحجرة (ب) فارغة!', 'info', 1200);
      return;
    }
    navigator.clipboard.writeText(textB).then(() => {
      showToast(`تم نسخ محتوى الحجرة ${diffChamberB} للحافظة! 📋`, 'success', 1500);
    });
  };

  window.applyChamberBToActive = function () {
    const textB = getChamberContent(diffChamberB);
    recordHistorySnapshot(true);
    editor.value = textB;
    if (classicEditor) classicEditor.value = textB;
    setChamberContent(activeChamber, textB);
    if (isClassicMode) {
      renderClassicMarkdown();
    } else {
      renderMarkdown();
    }
    updateChambersUI();
    closeChambersDiffModal();
    showToast(`تم نقل محتوى الحجرة ${diffChamberB} إلى الحجرة النشطة ${activeChamber} بنجاح! ✓`, 'success', 2000);
  };

  // ==========================================
  // BOOK EXPORT CHAMBERS SCOPE (تكامل تصدير الكتاب)
  // ==========================================
  window.toggleBookChamberScope = function (val) {
    const isAll = val === 'all';
    document.getElementById('pill-scope-all')?.classList.toggle('active', isAll);
    document.getElementById('pill-scope-current')?.classList.toggle('active', !isAll);
    const checklist = document.getElementById('book-chambers-checklist');
    if (checklist) {
      checklist.style.display = isAll ? 'flex' : 'none';
    }
  };

  function updateBookChambersList() {
    const checklist = document.getElementById('book-chambers-checklist');
    const curLabel = document.getElementById('book-scope-current-label');
    if (curLabel) {
      const curTitle = getChamberTitle(activeChamber);
      curLabel.textContent = `📄 الحجرة الحالية فقط (حجرة ${activeChamber}: ${curTitle})`;
    }
    if (!checklist) return;

    checklist.innerHTML = '';
    let filledCount = 0;

    for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
      const content = getChamberContent(i).trim();
      if (!content) continue;
      filledCount++;
      const title = getChamberTitle(i);

      const item = document.createElement('label');
      item.className = 'book-chamber-item';
      item.innerHTML = `
        <input type="checkbox" class="book-chamber-checkbox" value="${i}" checked />
        <span class="book-chamber-badge">الفصل ${filledCount} (حجرة ${i})</span>
        <span class="book-chamber-title-text" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
      `;
      checklist.appendChild(item);
    }

    if (filledCount === 0) {
      checklist.innerHTML = '<div style="font-size:0.82rem; color:#94a3b8; padding:4px;">لا توجد حجرات ممتلئة حالياً</div>';
    }
  }

  // ==========================================
  // BOOK EXPORT ENGINE (تصدير ككتاب احترافي)
  // ==========================================

  // فتح نافذة إعدادات الكتاب
  window.openBookModal = function () {
    const overlay = document.getElementById('book-modal-overlay');
    if (overlay) {
      overlay.classList.add('active');
      updateBookChambersList();
      // تحديث لون الغلاف label
      const colorInput = document.getElementById('book-cover-color');
      const colorLabel = document.getElementById('book-cover-color-label');
      if (colorInput && colorLabel) {
        colorLabel.textContent = colorInput.value;
        colorInput.addEventListener('input', function () {
          colorLabel.textContent = this.value;
        });
      }

      // ربط حقل لون الغلاف بحالة خيار إنشاء الغلاف
      const coverCheckbox = document.getElementById('book-include-cover');
      const coverColorField = document.getElementById('book-cover-color-field');
      if (coverCheckbox && coverColorField) {
        const updateCoverField = () => {
          coverColorField.style.opacity = coverCheckbox.checked ? '1' : '0.4';
          coverColorField.style.pointerEvents = coverCheckbox.checked ? 'auto' : 'none';
        };
        coverCheckbox.onchange = updateCoverField;
        updateCoverField();
      }

      // ربط قائمة نمط الترقيم بحالة خيار ترقيم الصفحات
      const pageNumbersCheckbox = document.getElementById('book-page-numbers');
      const pageNumberFormatWrap = document.getElementById('book-numbering-format-wrap');
      if (pageNumbersCheckbox && pageNumberFormatWrap) {
        const updatePageNumberField = () => {
          pageNumberFormatWrap.style.opacity = pageNumbersCheckbox.checked ? '1' : '0.4';
          pageNumberFormatWrap.style.pointerEvents = pageNumbersCheckbox.checked ? 'auto' : 'none';
        };
        pageNumbersCheckbox.onchange = updatePageNumberField;
        updatePageNumberField();
      }
    }
  };

  // إغلاق نافذة الكتاب
  window.closeBookModal = function (e) {
    if (e && e.target && !e.target.classList.contains('book-modal-overlay')) return;
    const overlay = document.getElementById('book-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  };

  // دالة مساعدة: استخراج العناوين من محتوى المعاينة لبناء الفهرس
  function extractHeadingsForTOC() {
    const headings = [];
    const previewEl = document.getElementById('preview-content');
    if (!previewEl) return headings;
    const hElements = previewEl.querySelectorAll('h1, h2, h3');
    hElements.forEach((h, idx) => {
      headings.push({
        level: parseInt(h.tagName.charAt(1)),
        text: h.textContent.trim(),
        id: 'book-heading-' + idx
      });
    });
    return headings;
  }

  // دالة مساعدة: بناء HTML فهرس المحتويات
  function buildTocHTML(headings) {
    if (!headings.length) return '';
    let html = '<div class="book-toc-page"><h1 class="book-toc-title">فهرس المحتويات</h1><div class="book-toc-list">';
    headings.forEach(h => {
      const indent = (h.level - 1) * 24;
      const dotClass = h.level === 1 ? 'book-toc-h1' : h.level === 2 ? 'book-toc-h2' : 'book-toc-h3';
      html += `<div class="book-toc-item ${dotClass}" style="padding-right: ${indent}px;">`
            + `<span class="book-toc-text">${h.text}</span>`
            + `<span class="book-toc-dots"></span>`
            + `</div>`;
    });
    html += '</div></div>';
    return html;
  }

  // دالة مساعدة: لون أفتح من لون الغلاف (لشريط الزخرفة)
  function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
    const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * percent));
    const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * percent));
    return `rgb(${r}, ${g}, ${b})`;
  }

  // دالة مساعدة: بناء كود HTML متكامل للكتاب مع تجزئة حقيقية إلى صفحات منفصلة
  async function generateBookHTML() {
    const title = document.getElementById('book-title')?.value.trim() || 'كتابي';
    const author = document.getElementById('book-author')?.value.trim() || '';
    const subtitle = document.getElementById('book-subtitle')?.value.trim() || '';
    const paperSize = document.getElementById('book-paper')?.value || 'a4';
    const coverColor = document.getElementById('book-cover-color')?.value || '#1e3a5f';
    const fontFamily = document.getElementById('book-font')?.value || 'Tajawal';
    const fontSize = document.getElementById('book-fontsize')?.value || '14';
    const includeCover = document.getElementById('book-include-cover')?.checked ?? true;
    const includeTOC = document.getElementById('book-toc')?.checked ?? true;
    const includePageNumbers = document.getElementById('book-page-numbers')?.checked ?? true;
    const pageNumFormat = document.getElementById('book-page-number-format')?.value || 'detailed';
    const includeHeaderFooter = document.getElementById('book-header-footer')?.checked ?? true;

    // استخدام المحتوى المختار: الحجرة الحالية أو جميع الحجرات الممتلئة المحددة كفصول
    const scopeType = document.querySelector('input[name="book-scope-type"]:checked')?.value || 'all';
    let cleanBody = '';

    if (scopeType === 'all') {
      const selectedBoxes = Array.from(document.querySelectorAll('.book-chamber-checkbox:checked'));
      const chaptersContainer = document.createElement('div');

      if (selectedBoxes.length === 0) {
        const activeContent = (isClassicMode && classicOutput && classicOutput.innerHTML.trim().length > 0)
          ? classicOutput
          : previewContent;
        const contentClone = activeContent.cloneNode(true);
        chaptersContainer.appendChild(contentClone);
      } else {
        selectedBoxes.forEach((chk, idx) => {
          const chNum = parseInt(chk.value, 10);
          const chText = getChamberContent(chNum);
          if (!chText.trim()) return;

          const chTitle = getChamberTitle(chNum);
          const chParsed = typeof marked !== 'undefined' ? marked.parse(chText) : escapeHtml(chText);

          const chSec = document.createElement('section');
          chSec.className = 'book-chapter-section';
          if (idx > 0) {
            const hr = document.createElement('hr');
            hr.className = 'book-page-break';
            chaptersContainer.appendChild(hr);
          }
          chSec.innerHTML = `
            <h1 class="book-chapter-header">الفصل ${idx + 1}: ${escapeHtml(chTitle)}</h1>
            <div class="book-chapter-content">${chParsed}</div>
          `;
          chaptersContainer.appendChild(chSec);
        });
      }

      await convertMermaidSvgsToPngImages(chaptersContainer);
      cleanBody = getCleanExportHTML(chaptersContainer);
    } else {
      const activeContent = (isClassicMode && classicOutput && classicOutput.innerHTML.trim().length > 0)
        ? classicOutput
        : previewContent;

      const contentClone = activeContent.cloneNode(true);
      await convertMermaidSvgsToPngImages(contentClone);
      cleanBody = getCleanExportHTML(contentClone);
    }

    const paperSizes = {
      a4: { name: 'A4 (210×297 مم)', width: '210mm', height: '297mm', padding: '20mm 18mm 25mm 18mm', coverTitleSize: '2.7rem' },
      a5: { name: 'A5 (148×210 مم)', width: '148mm', height: '210mm', padding: '15mm 12mm 18mm 12mm', coverTitleSize: '2.0rem' },
      letter: { name: 'Letter (216×279 مم)', width: '216mm', height: '279mm', padding: '20mm 18mm 25mm 18mm', coverTitleSize: '2.7rem' }
    };
    const paper = paperSizes[paperSize] || paperSizes.a4;
    const lightCover = lightenColor(coverColor, 0.90);

    // ========================================================
    // محرك التجزئة الفيزيائي الذكي (Physical Page Paginator)
    // يقيس ارتفاع العناصر ويفصل الصفحات آلياً عند انتهاء مساحة الورقة الحقيقية
    // ========================================================
    const sandbox = document.createElement('div');
    sandbox.style.cssText = `
      position: fixed;
      top: -99999px;
      left: -99999px;
      width: ${paper.width};
      box-sizing: border-box;
      visibility: hidden;
      pointer-events: none;
      direction: rtl;
      font-family: '${fontFamily}', 'Tajawal', sans-serif;
      font-size: ${fontSize}pt;
      line-height: 1.85;
    `;

    const sandboxPage = document.createElement('article');
    sandboxPage.className = 'book-page book-content-sheet';
    sandboxPage.style.cssText = `
      width: ${paper.width};
      height: ${paper.height};
      padding: ${paper.padding};
      box-sizing: border-box;
      overflow: hidden;
    `;

    const sandboxBody = document.createElement('div');
    sandboxBody.className = 'sheet-body';
    sandboxPage.appendChild(sandboxBody);
    sandbox.appendChild(sandboxPage);
    document.body.appendChild(sandbox);

    // حساب الارتفاع المتاح بدقة
    const pageComputed = window.getComputedStyle(sandboxPage);
    const padTop = parseFloat(pageComputed.paddingTop) || 0;
    const padBottom = parseFloat(pageComputed.paddingBottom) || 0;
    const headerFooterAllowance = (includeHeaderFooter ? 60 : 0) + (includePageNumbers ? 60 : 0);
    // المساحة الرأسية المتاحة لمحتوى الورقة
    const maxPageHeight = Math.max(sandboxPage.clientHeight - padTop - padBottom - headerFooterAllowance, 700);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cleanBody;
    const childNodes = Array.from(tempDiv.children);

    const pages = [];
    let currentPageElements = [];
    const headingsWithPages = [];
    const pageOffset = (includeCover ? 1 : 0) + (includeTOC ? 1 : 0);

    function startNewPage() {
      if (currentPageElements.length > 0) {
        pages.push(currentPageElements);
        currentPageElements = [];
        sandboxBody.innerHTML = '';
      }
    }

    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i];
      const tag = node.tagName ? node.tagName.toUpperCase() : '';

      // 1. عناوين الأبواب الرئيسية H1: تبدأ صفحة جديدة إذا كانت الصفحة الحالية قطعت أكثر من نصف ارتفاعها
      if (tag === 'H1' && sandboxBody.scrollHeight > maxPageHeight * 0.45 && currentPageElements.length > 0) {
        startNewPage();
      }

      // 2. معالجة القوائم (UL / OL) وتوزيع بنودها بين الصفحات بسلاسة تامة
      if (tag === 'UL' || tag === 'OL') {
        const listItems = Array.from(node.children).filter(c => c.tagName && c.tagName.toUpperCase() === 'LI');
        if (listItems.length > 0) {
          // اختبار إضافة القائمة بالكامل أولاً
          const fullClone = node.cloneNode(true);
          sandboxBody.appendChild(fullClone);

          if (sandboxBody.scrollHeight <= maxPageHeight) {
            // القائمة بالكامل تتسع في الصفحة الحالية
            currentPageElements.push(fullClone);
            continue;
          }

          // لا تتسع بالكامل: إزالتها وتوزيع بنودها
          sandboxBody.removeChild(fullClone);

          // إذا كانت المساحة المتبقية صغيرة جداً (< 110px)، ننقل القائمة كاملة للصفحة الجديدة
          if (maxPageHeight - sandboxBody.scrollHeight < 110 && currentPageElements.length > 0) {
            startNewPage();
          }

          let curList = document.createElement(tag.toLowerCase());
          let listStartAttr = node.getAttribute('start');
          if (tag === 'OL' && listStartAttr) {
            curList.setAttribute('start', listStartAttr);
          }
          sandboxBody.appendChild(curList);

          for (let liIdx = 0; liIdx < listItems.length; liIdx++) {
            const liClone = listItems[liIdx].cloneNode(true);
            curList.appendChild(liClone);

            if (sandboxBody.scrollHeight > maxPageHeight && (currentPageElements.length > 0 || curList.children.length > 1)) {
              // هذا البند تجاوز حد الصفحة: التراجع عنه
              curList.removeChild(liClone);

              if (curList.children.length > 0) {
                currentPageElements.push(curList.cloneNode(true));
              }

              // فتح صفحة جديدة
              startNewPage();

              // بدء قائمة مكملة في الصفحة التالية مع الحفاظ على الترقيم التسلسلي
              curList = document.createElement(tag.toLowerCase());
              if (tag === 'OL') {
                const baseStart = parseInt(listStartAttr || '1', 10);
                curList.setAttribute('start', (baseStart + liIdx).toString());
              }
              curList.appendChild(liClone);
              sandboxBody.appendChild(curList);
            }
          }

          if (curList.children.length > 0) {
            currentPageElements.push(curList.cloneNode(true));
          }
          continue;
        }
      }

      // 3. منع ترك العناوين يتيمة في أسفل الصفحة (Orphan Headings)
      if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4') {
        const orphanSafeMargin = 110; // مساحة كافية للعنوان وفقرة تحته على الأقل
        if (maxPageHeight - sandboxBody.scrollHeight < orphanSafeMargin && currentPageElements.length > 0) {
          startNewPage();
        }

        // تسجيل العنوان ورقم صفحته الحقيقي للفهرس
        headingsWithPages.push({
          level: parseInt(tag.charAt(1)),
          text: node.textContent.trim(),
          page: pages.length + 1 + pageOffset
        });
      }

      // 4. اختبار العنصر العادي (فقرة، كود، جدول، اقتباس، أو فاصل أفقي)
      const clone = node.cloneNode(true);
      sandboxBody.appendChild(clone);

      if (sandboxBody.scrollHeight > maxPageHeight && currentPageElements.length > 0) {
        sandboxBody.removeChild(clone);
        startNewPage();
        sandboxBody.appendChild(clone);
        currentPageElements.push(clone);
      } else {
        currentPageElements.push(clone);
      }
    }

    if (currentPageElements.length > 0) {
      pages.push(currentPageElements);
    }

    // تنظيف حاوية القياس
    sandbox.remove();

    const totalBookPages = pages.length + pageOffset;

    // بناء كود فهرس المحتويات مع أرقام الصفحات الحقيقية
    let tocHTML = '';
    if (includeTOC && headingsWithPages.length > 0) {
      let items = '';
      headingsWithPages.forEach(h => {
        const indent = (h.level - 1) * 20;
        const dotClass = h.level === 1 ? 'book-toc-h1' : h.level === 2 ? 'book-toc-h2' : 'book-toc-h3';
        items += `
        <div class="book-toc-item ${dotClass}" style="padding-right: ${indent}px;">
          <span class="book-toc-text">${h.text}</span>
          <span class="book-toc-dots"></span>
          <span class="book-toc-num">${h.page}</span>
        </div>`;
      });

      tocHTML = `
  <!-- صفحة فهرس المحتويات -->
  <section class="book-page book-toc-page">
    <h2 class="book-toc-title">فهرس المحتويات</h2>
    <div class="book-toc-list">
      ${items}
    </div>
  </section>`;
    }

    // بناء صفحات المتن المستقلة (ورقة ورقة)
    let pagesHTML = '';
    pages.forEach((pElements, pIdx) => {
      const pageNum = pIdx + 1 + pageOffset;
      const pageWrapper = document.createElement('div');
      pElements.forEach(el => pageWrapper.appendChild(el));

      let pageIndicatorText = `صفحة ${pageNum} من ${totalBookPages}`;
      if (pageNumFormat === 'simple') {
        pageIndicatorText = `صفحة ${pageNum}`;
      } else if (pageNumFormat === 'number') {
        pageIndicatorText = `${pageNum}`;
      }

      pagesHTML += `
  <!-- صفحة ${pageNum} من الكتاب -->
  <article class="book-page book-content-sheet" id="page-${pageNum}" data-page="${pageNum}">
    ${includeHeaderFooter ? `
    <header class="sheet-header">
      <span class="sheet-header-title">${title}</span>
      ${author ? `<span class="sheet-header-author">${author}</span>` : ''}
    </header>` : ''}
    
    <div class="sheet-body">
      ${pageWrapper.innerHTML}
    </div>

    ${includePageNumbers ? `
    <footer class="sheet-footer">
      <span class="sheet-page-indicator">${pageIndicatorText}</span>
    </footer>` : ''}
  </article>`;
    });

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&family=Cairo:wght@400;600;700&family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Fira+Code:wght@400;500&display=swap">
  <style>
    /* إعدادات الطباعة الفيزيائية وفق المقاس المختار تماماً */
    @page {
      size: ${paper.width} ${paper.height};
      margin: 0;
    }
    ${includeCover ? `
    @page :first {
      margin: 0;
    }` : ''}

    * { box-sizing: border-box; }
    
    body {
      font-family: '${fontFamily}', 'Tajawal', sans-serif;
      direction: rtl;
      text-align: right;
      color: #1a1a2e;
      line-height: 1.85;
      font-size: ${fontSize}pt;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ===== نمط العرض على الشاشة (يلتزم تماماً بمقاس ${paper.name} كأوراق حقيقية مفصولة) ===== */
    @media screen {
      body {
        background-color: #cbd5e1;
        padding: 40px 15px 80px 15px;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-height: 100vh;
      }

      /* كل صفحة عبارة عن ورقة مستقلة بحد ذاتها بفاصل وظلال */
      .book-page,
      .book-cover-page {
        width: ${paper.width};
        min-height: ${paper.height};
        max-width: 100%;
        margin: 0 auto 35px auto;
        box-sizing: border-box;
        border-radius: 4px;
        box-shadow: 0 12px 35px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.08);
        position: relative;
        background: #ffffff;
      }

      .book-cover-page {
        height: ${paper.height};
        background: ${coverColor};
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.25);
      }
    }

    /* ===== الطباعة الفيزيائية والمطابقة 1:1 ===== */
    @media print {
      body {
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .book-page,
      .book-cover-page {
        width: ${paper.width} !important;
        min-height: ${paper.height} !important;
        max-width: none !important;
        margin: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      .sheet-header,
      .sheet-footer {
        display: flex !important;
      }
    }

    /* رأس وتذييل الورقة للشاشة */
    .sheet-header {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 22px;
      font-size: 0.85em;
      color: #94a3b8;
    }
    .sheet-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      margin-top: 30px;
      text-align: center;
      font-size: 0.85em;
      color: #94a3b8;
    }

    /* ===== صفحة الغلاف ===== */
    .book-cover-page {
      padding: 60px 30px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      position: relative;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .cover-ornament {
      width: 120px;
      height: 3px;
      background: ${lightenColor(coverColor, 0.5)};
      margin: 20px auto;
      border-radius: 2px;
    }
    .cover-title {
      font-size: ${paper.coverTitleSize};
      font-weight: 800;
      color: #ffffff;
      margin: 0;
      padding: 0 15px;
      line-height: 1.35;
      text-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .cover-subtitle {
      font-size: 1.25rem;
      color: ${lightenColor(coverColor, 0.8)};
      margin-top: 15px;
      font-weight: 400;
      max-width: 600px;
    }
    .cover-author {
      font-size: 1.35rem;
      color: ${lightenColor(coverColor, 0.95)};
      margin-top: 45px;
      font-weight: 700;
    }
    .cover-year {
      font-size: 1rem;
      color: ${lightenColor(coverColor, 0.65)};
      margin-top: 12px;
    }

    /* ===== صفحة فهرس المحتويات ===== */
    .book-toc-page {
      padding: ${paper.padding};
      page-break-after: always;
      break-after: page;
    }
    .book-toc-title {
      font-size: 1.8rem;
      color: ${coverColor};
      border-bottom: 3px solid ${coverColor};
      padding-bottom: 10px;
      margin-bottom: 25px;
      text-align: center;
    }
    .book-toc-list { display: flex; flex-direction: column; gap: 8px; }
    .book-toc-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px dashed #e2e8f0;
    }
    .book-toc-h1 .book-toc-text { font-weight: 700; font-size: 1.08em; color: ${coverColor}; }
    .book-toc-h2 .book-toc-text { font-weight: 600; font-size: 0.98em; color: #334155; }
    .book-toc-h3 .book-toc-text { font-weight: 400; font-size: 0.92em; color: #64748b; }
    .book-toc-dots { flex: 1; border-bottom: 1px dotted #cbd5e1; margin-bottom: 4px; }
    .book-toc-num { font-weight: 700; color: ${coverColor}; margin-right: 6px; font-family: monospace; font-size: 1.05em; }

    /* ===== ورقة المحتوى والمتن ===== */
    .book-content-sheet {
      padding: ${paper.padding};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }
    .sheet-body {
      flex: 1;
    }
    .sheet-body hr {
      border: 0;
      height: 1px;
      background: #cbd5e1;
      margin: 18px 0;
    }
    .sheet-body h1 {
      font-size: 1.75em;
      color: ${coverColor};
      border-bottom: 2px solid ${coverColor};
      padding-bottom: 8px;
      margin-top: 0;
      margin-bottom: 0.8em;
      page-break-after: avoid;
      break-after: avoid;
    }
    .sheet-body h2 {
      font-size: 1.35em;
      color: #1e40af;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 6px;
      margin-top: 0.8em;
      margin-bottom: 0.4em;
      page-break-after: avoid;
      break-after: avoid;
    }
    .sheet-body h3 {
      font-size: 1.15em;
      color: #2563eb;
      margin-top: 0.8em;
      margin-bottom: 0.3em;
      page-break-after: avoid;
      break-after: avoid;
    }
    .sheet-body p { margin: 0.7em 0; text-align: justify; }
    .sheet-body ul, .sheet-body ol { margin: 0.7em 0; padding-right: 25px; }
    .sheet-body li { margin-bottom: 0.35em; }
    .sheet-body table { border-collapse: collapse; width: 100%; margin: 14px 0; page-break-inside: avoid; break-inside: avoid; }
    .sheet-body th, .sheet-body td { border: 1px solid #94a3b8; padding: 7px 11px; text-align: right; }
    .sheet-body th { background: ${lightCover}; font-weight: 700; color: #1e293b; }
    .sheet-body blockquote {
      border-right: 4px solid ${coverColor};
      padding: 10px 18px;
      margin: 14px 0;
      background: ${lightCover};
      border-radius: 0 8px 8px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sheet-body code:not(pre code) {
      font-family: 'Fira Code', Consolas, monospace;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      color: #9333ea;
      font-size: 0.88em;
    }
    .sheet-body pre {
      background: #1e1e2e !important;
      color: #cdd6f4;
      padding: 14px 18px;
      border-radius: 8px;
      overflow-x: auto;
      direction: ltr;
      text-align: left;
      margin: 14px 0;
      font-family: 'Fira Code', Consolas, monospace;
      font-size: 0.85em;
      line-height: 1.6;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sheet-body pre code { background: transparent !important; color: inherit; padding: 0; }
    .sheet-body img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px auto; display: block; page-break-inside: avoid; break-inside: avoid; }

    /* Syntax Highlighting */
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #94a3b8 !important; font-style: italic; }
    .token.punctuation { color: #cbd5e1 !important; }
    .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #f08d49 !important; }
    .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #7ec699 !important; }
    .token.operator, .token.entity, .token.url { color: #67cdcc !important; }
    .token.atrule, .token.attr-value, .token.keyword { color: #cc99cd !important; }
    .token.function, .token.class-name { color: #6196cc !important; }
    .token.regex, .token.important, .token.variable { color: #f8c555 !important; }
  </style>
</head>
<body>
  <!-- غلاف الكتاب (إذا تم اختياره) -->
  ${includeCover ? `
  <section class="book-cover-page">
    <div class="cover-ornament"></div>
    <h1 class="cover-title">${title}</h1>
    ${subtitle ? `<div class="cover-subtitle">${subtitle}</div>` : ''}
    <div class="cover-ornament"></div>
    ${author ? `<div class="cover-author">${author}</div>` : ''}
    <div class="cover-year">${new Date().getFullYear()}</div>
  </section>` : ''}

  <!-- فهرس المحتويات (إذا تم اختياره) -->
  ${tocHTML}

  <!-- صفحات المتن المنفصلة (ورقة ورقة) -->
  ${pagesHTML}
</body>
</html>`;
  }

  // تنفيذ تصدير الكتاب (PDF أو HTML أو معاينة)
  window.exportAsBook = async function (action = 'pdf') {
    closeBookModal();
    showToast('جاري تجهيز وتنسيق صفحات الكتاب... 📖⏳', 'info', 4000);

    try {
      const bookHTML = await generateBookHTML();
      const title = document.getElementById('book-title')?.value.trim() || 'كتابي';

      // 1. تحميل بصيغة HTML مستقلة
      if (action === 'html') {
        const blob = new Blob([bookHTML], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, `${title}.html`);
        showToast('تم تنزيل ملف الكتاب بصيغة HTML بنجاح! 🌐📚', 'success', 4000);
        return;
      }

      // 2. معاينة في تبويب جديد
      if (action === 'preview') {
        const blob = new Blob([bookHTML], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        showToast('تم فتح معاينة الكتاب في تبويب جديد! 👁️', 'success', 3000);
        return;
      }

      // 3. الطباعة المباشرة للحفظ كـ PDF عبر إطار معزول بدون أي تعارض أو حجب نوافذ
      let printIframe = document.getElementById('book-print-iframe');
      if (printIframe) {
        printIframe.remove();
      }

      printIframe = document.createElement('iframe');
      printIframe.id = 'book-print-iframe';
      printIframe.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; border:none; z-index:-9999; opacity:0; pointer-events:none;';
      document.body.appendChild(printIframe);

      const frameDoc = printIframe.contentWindow.document;
      frameDoc.open();
      frameDoc.write(bookHTML);
      frameDoc.close();

      showToast('جاري فتح نافذة الحفظ كـ PDF... اختر "حفظ بتنسيق PDF" 📄✨', 'success', 5000);

      // انتظار بسيط لتحميل الخطوط والصور ثم استدعاء الطباعة
      setTimeout(() => {
        try {
          printIframe.contentWindow.focus();
          printIframe.contentWindow.print();
        } catch (e) {
          console.warn('Iframe print error, falling back:', e);
          const blob = new Blob([bookHTML], { type: 'text/html;charset=utf-8' });
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank');
        }
      }, 700);

    } catch (err) {
      console.error('Book export error:', err);
      showToast('حدث خطأ أثناء إعداد الكتاب: ' + err.message, 'warning', 5000);
    }
  };

  // ==========================================
  // HISTORY ENGINE (التالي، السابق، وتصفير المحتوى)
  // ==========================================
  function updateHistoryButtonStates() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnClassicUndo = document.getElementById('btn-classic-undo');
    const btnClassicRedo = document.getElementById('btn-classic-redo');

    const canUndo = undoStack.length > 1;
    const canRedo = redoStack.length > 0;

    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnClassicUndo) btnClassicUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
    if (btnClassicRedo) btnClassicRedo.disabled = !canRedo;
  }

  function initHistoryWithContent(text) {
    undoStack.length = 0;
    redoStack.length = 0;
    undoStack.push({
      value: text || '',
      start: editor.selectionStart || 0,
      end: editor.selectionEnd || 0
    });
    updateHistoryButtonStates();
  }

  function recordHistorySnapshot(immediate = false) {
    if (isPerformingHistory) return;

    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    const currentVal = activeEl.value;
    const currentStart = activeEl.selectionStart;
    const currentEnd = activeEl.selectionEnd;

    const saveState = () => {
      const top = undoStack[undoStack.length - 1];
      if (top && top.value === currentVal) {
        top.start = currentStart;
        top.end = currentEnd;
        return;
      }

      undoStack.push({
        value: currentVal,
        start: currentStart,
        end: currentEnd
      });

      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }

      redoStack.length = 0;
      updateHistoryButtonStates();
    };

    if (immediate) {
      clearTimeout(historyDebounceTimer);
      saveState();
    } else {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = setTimeout(saveState, 350);
    }
  }

  // 1. التالي (Redo)
  window.redoAction = function () {
    if (redoStack.length === 0) {
      showToast('لا توجد خطوات تالية للإعادة', 'info', 1200);
      return;
    }

    const nextState = redoStack.pop();
    undoStack.push(nextState);

    isPerformingHistory = true;
    editor.value = nextState.value;
    if (classicEditor) classicEditor.value = nextState.value;

    if (isClassicMode) {
      if (classicEditor) {
        classicEditor.focus();
        if (typeof nextState.start === 'number' && typeof nextState.end === 'number') {
          try { classicEditor.setSelectionRange(nextState.start, nextState.end); } catch (e) {}
        }
      }
      renderClassicMarkdown();
    } else {
      editor.focus();
      if (typeof nextState.start === 'number' && typeof nextState.end === 'number') {
        try { editor.setSelectionRange(nextState.start, nextState.end); } catch (e) {}
      }
      renderMarkdown();
    }

    isPerformingHistory = false;
    updateHistoryButtonStates();
    showToast('التالي ↻ (إعادة الخطوة)', 'info', 1000);
  };

  // 2. السابق (Undo)
  window.undoAction = function () {
    if (undoStack.length <= 1) {
      showToast('لا توجد خطوات سابقة للتراجع عنها', 'info', 1200);
      return;
    }

    const currentState = undoStack.pop();
    redoStack.push(currentState);

    const prevState = undoStack[undoStack.length - 1];
    isPerformingHistory = true;
    editor.value = prevState.value;
    if (classicEditor) classicEditor.value = prevState.value;

    if (isClassicMode) {
      if (classicEditor) {
        classicEditor.focus();
        if (typeof prevState.start === 'number' && typeof prevState.end === 'number') {
          try { classicEditor.setSelectionRange(prevState.start, prevState.end); } catch (e) {}
        }
      }
      renderClassicMarkdown();
    } else {
      editor.focus();
      if (typeof prevState.start === 'number' && typeof prevState.end === 'number') {
        try { editor.setSelectionRange(prevState.start, prevState.end); } catch (e) {}
      }
      renderMarkdown();
    }

    isPerformingHistory = false;
    updateHistoryButtonStates();
    showToast('السابق ↺ (تراجع)', 'info', 1000);
  };

  // 3. تصفير (مسح المحتوى الحالي للحجرة النشطة)
  window.clearWorkspaceContent = function () {
    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEl.value || activeEl.value.trim() === '') {
      return;
    }

    if (typeof detachChamberFromLinkedFiles === 'function') {
      detachChamberFromLinkedFiles(activeChamber);
    }

    // حفظ النص الحالي أولاً في undoStack حتى يتمكن المستخدم من التراجع فوراً
    recordHistorySnapshot(true);

    undoStack.push({
      value: '',
      start: 0,
      end: 0
    });
    redoStack.length = 0;

    isPerformingHistory = true;
    editor.value = '';
    if (classicEditor) classicEditor.value = '';

    setChamberContent(activeChamber, '');

    if (isClassicMode) {
      if (classicEditor) classicEditor.focus();
      renderClassicMarkdown();
    } else {
      editor.focus();
      renderMarkdown();
    }
    isPerformingHistory = false;

    updateHistoryButtonStates();
    updateChambersUI();
    showToast(`تم إفراغ الحجرة ${activeChamber} (يمكنك التراجع ↺)`, 'info', 1500);
  };

  // 4. لصق المحتوى من الحافظة (نصوص أو صور مدمجة دون أي إشعارات)
  window.pasteWorkspaceContent = async function () {
    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEl) return;

    try {
      // 1. التحقق أولاً مما إذا كانت الحافظة تحتوي على صورة منسوخة
      if (navigator.clipboard && navigator.clipboard.read) {
        try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                const optimizedUrl = await optimizeImageFile(blob);
                if (optimizedUrl) {
                  window.insertImageIntoEditor(optimizedUrl, 'صورة ملصقة');
                }
                return;
              }
            }
          }
        } catch (clipImgErr) {
          // المتابعة للصق النص إذا لم تكن صورة
        }
      }

      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }

      if (text) {
        // حفظ لقطة تراجع قبل التعديل
        recordHistorySnapshot(true);

        // حفظ مواضع السكرول الحالية قبل اللصق لمنع القفز للأسفل
        const savedEditorScroll = activeEl.scrollTop;
        const savedPreviewScroll = preview ? preview.scrollTop : 0;

        const start = typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : activeEl.value.length;
        const end = typeof activeEl.selectionEnd === 'number' ? activeEl.selectionEnd : activeEl.value.length;
        const val = activeEl.value;

        activeEl.value = val.substring(0, start) + text + val.substring(end);
        const newPos = start + text.length;
        try {
          activeEl.setSelectionRange(newPos, newPos);
        } catch (e) {}

        // استعادة سكرول المحرر قبل focus لمنع المتصفح من السكرول التلقائي
        activeEl.scrollTop = savedEditorScroll;
        activeEl.focus();
        // إعادة الضبط مرة أخرى بعد focus لأن المتصفح قد يعيد السكرول
        activeEl.scrollTop = savedEditorScroll;

        if (isClassicMode) {
          if (editor) editor.value = activeEl.value;
          renderClassicMarkdown();
        } else {
          if (classicEditor) classicEditor.value = activeEl.value;
          renderMarkdown();
        }

        // استعادة مواضع السكرول بعد الرندر لمنع أي قفز
        requestAnimationFrame(() => {
          activeEl.scrollTop = savedEditorScroll;
          if (preview) preview.scrollTop = savedPreviewScroll;
        });

        recordHistorySnapshot();
        updateHistoryButtonStates();
      } else {
        // بديل: التركيز ومحاولة execCommand لصق
        activeEl.focus();
        document.execCommand('paste');
      }
    } catch (err) {
      console.warn('Clipboard read failed or permission denied:', err);
      activeEl.focus();
      try {
        document.execCommand('paste');
      } catch (e) {}
    }
  };

  // ==========================================
  // CLASSIC MODE LOGIC (الوضع الكلاسيكي الأصلي)
  // ==========================================
  function renderClassicMarkdown() {
    if (!classicEditor || !classicOutput) return;
    const rawText = classicEditor.value;
    if (typeof marked !== 'undefined') {
      classicOutput.innerHTML = marked.parse(rawText);
    } else {
      classicOutput.textContent = rawText;
    }
    setupImageResizers(classicOutput);
    setChamberContent(activeChamber, rawText);
    updateChambersUI();
  }

  function syncClassicTogglePosition() {
    const modernBtn = document.getElementById('btn-toggle-classic');
    const classicBtn = document.getElementById('btn-classic-switch');
    if (!modernBtn || !classicBtn) return;

    if (window.innerWidth <= 768) {
      classicBtn.style.top = '';
      classicBtn.style.left = '';
      classicBtn.style.width = '';
      classicBtn.style.height = '';
      return;
    }

    const rect = modernBtn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      classicBtn.style.top = rect.top + 'px';
      classicBtn.style.left = rect.left + 'px';
      classicBtn.style.width = rect.width + 'px';
      classicBtn.style.height = rect.height + 'px';
      try {
        const toggleData = JSON.stringify({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        });
        localStorage.setItem('vienix_toggle_rect', toggleData);
        localStorage.setItem('yaser_toggle_rect', toggleData);
      } catch (e) {}
    } else {
      try {
        const saved = JSON.parse(getStored('vienix_toggle_rect', 'yaser_toggle_rect'));
        if (saved && saved.width > 0) {
          classicBtn.style.top = saved.top + 'px';
          classicBtn.style.left = saved.left + 'px';
          classicBtn.style.width = saved.width + 'px';
          classicBtn.style.height = saved.height + 'px';
        }
      } catch (e) {}
    }
  }

  window.toggleClassicMode = function () {
    isClassicMode = !isClassicMode;
    try {
      localStorage.setItem('vienix_classic_mode', isClassicMode ? 'true' : 'false');
      localStorage.setItem('yaser_classic_mode', isClassicMode ? 'true' : 'false');
    } catch (e) {}
    applyUIMode(true);
    showToast(isClassicMode ? 'الوضع الكلاسيكي' : 'الواجهة الحديثة', 'info', 1800);
  };

  function applyUIMode(shouldScrollTop = false) {
    if (isClassicMode) {
      syncClassicTogglePosition();
      document.body.classList.add('classic-mode');
      if (window.innerWidth <= 768) {
        setClassicMobileTab('editor');
      }
      if (classicEditor) {
        classicEditor.value = editor.value;
        renderClassicMarkdown();
      }
      if (shouldScrollTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      document.body.classList.remove('classic-mode');
      if (classicEditor) {
        editor.value = classicEditor.value;
      }
      renderMarkdown();
      if (window.innerWidth <= 768) {
        setViewMode('editor');
      }
      requestAnimationFrame(syncClassicTogglePosition);
      if (shouldScrollTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    updateHistoryButtonStates();
  }

  window.addEventListener('resize', syncClassicTogglePosition);

  // ==========================================
  // FORMATTING TOOLBAR HELPERS
  // ==========================================

  window.insertFormat = function (prefix, suffix, defaultText) {
    recordHistorySnapshot(true);
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.substring(start, end) || defaultText || '';
    const replacement = prefix + selected + suffix;

    editor.setRangeText(replacement, start, end, 'select');
    editor.focus();
    renderMarkdown();
    recordHistorySnapshot(true);
  };

  window.insertHeading = function (level) {
    recordHistorySnapshot(true);
    const hashes = '#'.repeat(level) + ' ';
    const start = editor.selectionStart;
    const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
    editor.setRangeText(hashes, lineStart, lineStart, 'end');
    editor.focus();
    renderMarkdown();
    recordHistorySnapshot(true);
  };

  window.insertList = function (ordered) {
    const bullet = ordered ? '1. ' : '- ';
    window.insertFormat(bullet, '', 'عنصر في القائمة');
  };

  window.insertTask = function () {
    window.insertFormat('- [ ] ', '', 'مهمة جديدة');
  };

  window.insertTable = function () {
    const tableTemplate = `\n| العمود الأول | العمود الثاني | العمود الثالث |\n| :--- | :---: | :---: |\n| بيانات 1 | بيانات 2 | بيانات 3 |\n| بيانات 4 | بيانات 5 | بيانات 6 |\n\n`;
    window.insertFormat('', '', tableTemplate);
  };

  window.insertLink = function () {
    window.insertFormat('[', '](https://example.com)', 'عنوان الرابط');
  };

  // إدراج صورة مدمجة (Base64) في موضع المؤشر بالمحرر مع تحديث المعاينة والتاريخ
  window.insertImageIntoEditor = function (dataUrl, altText = 'صورة') {
    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const start = typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : activeEl.value.length;
    const end = typeof activeEl.selectionEnd === 'number' ? activeEl.selectionEnd : activeEl.value.length;
    const val = activeEl.value;

    const imgMarkdown = `\n![${altText}](${dataUrl})\n\n`;
    activeEl.value = val.substring(0, start) + imgMarkdown + val.substring(end);
    const newPos = start + imgMarkdown.length;
    try {
      activeEl.setSelectionRange(newPos, newPos);
    } catch (e) {}

    activeEl.focus();

    if (isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }

    recordHistorySnapshot();
    updateHistoryButtonStates();
  };

  // إدراج ورفع صورة من الجهاز مباشرة
  window.insertImage = function () {
    const fileInput = document.getElementById('image-upload-input');
    if (fileInput) {
      fileInput.click();
    } else {
      window.insertFormat('![', '](https://example.com/image.png)', 'وصف الصورة');
    }
  };

  window.insertHorizontalRule = function () {
    window.insertFormat('\n---\n', '', '');
  };

  window.insertCodeBlock = function () {
    window.insertFormat('```javascript\n', '\n```', '// اكتب الكود البرمجي هنا');
  };

  // Diagram Templates Inserter
  window.insertDiagram = function (type) {
    let template = '';
    if (type === 'flowchart') {
      template = `\n\`\`\`mermaid\ngraph TD\n    A[بداية العملية] --> B{هل البيانات صحيحة؟}\n    B -- نعم --> C[متابعة التنفيذ]\n    B -- لا --> D[تصحيح المدخلات]\n    D --> A\n    C --> E[اكتمال المهمة بنجاح 🎯]\n\`\`\`\n`;
    } else if (type === 'sequence') {
      template = `\n\`\`\`mermaid\nsequenceDiagram\n    autonumber\n    المستخدم->>الخادم: طلب تسجيل الدخول\n    الخادم->>قاعدة البيانات: التحقق من الهوية\n    قاعدة البيانات-->>الخادم: البيانات مطابقة\n    الخادم-->>المستخدم: تم الدخول بنجاح\n\`\`\`\n`;
    } else if (type === 'mindmap') {
      template = `\n\`\`\`mermaid\nmindmap\n  root((الفكرة الرئيسية))\n    المحور الأول\n      نقطة فرعية 1\n      نقطة فرعية 2\n    المحور الثاني\n      نقطة فرعية 3\n    المحور الثالث\n      الخلاصة والتوصيات\n\`\`\`\n`;
    } else if (type === 'pie') {
      template = `\n\`\`\`mermaid\npie title نسبة إنجاز المشروع\n    "المهام المكتملة" : 65\n    "قيد التنفيذ" : 25\n    "المتبقي" : 10\n\`\`\`\n`;
    }

    window.insertFormat('', '', template);
    showToast(`تم إدراج قالب مخطط: ${type} 📊`, 'success');
  };

  // Reset to initial rich demo template
  window.resetToSample = function () {
    if (confirm('هل أنت متأكد من استعادة النموذج الافتراضي؟ سيتم استبدال النص الحالي.')) {
      fetch('initcontent.md')
        .then((res) => res.text())
        .then((data) => {
          recordHistorySnapshot(true);
          editor.value = data;
          renderMarkdown();
          recordHistorySnapshot(true);
          showToast('تمت استعادة النموذج التجريبي الافتراضي ✨', 'info');
        })
        .catch(() => {
          showToast('تعذر تحميل الملف الافتراضي', 'warning');
        });
    }
  };

  // Clear editor
  window.clearEditor = function () {
    if (confirm('هل تريد مسح كل النص في المحرر؟')) {
      editor.value = '';
      renderMarkdown();
      showToast('تم مسح النص', 'info');
    }
  };

  // ==========================================
  // UTILITY & TOAST NOTIFICATION
  // ==========================================

  function showToast(message, type = 'info') {
    // تم إخفاء كافة رسائل التنبيه نهائياً من الظهور بناءً على طلب المستخدم الصريح مع الحفاظ على الدالة في الكود
    return;
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg} <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3200);
  }

  // ==========================================
  // WORKSPACE ZOOM (تكبير وتصغير مساحات العمل فقط)
  // ==========================================
  let currentZoom = parseInt(getStored('vienix_md_zoom', 'yaser_md_zoom') || '100', 10);

  function applyWorkspaceZoom(zoomVal) {
    currentZoom = Math.min(Math.max(zoomVal, 70), 160); // نسبة التكبير بين 70% و 160%
    try {
      localStorage.setItem('vienix_md_zoom', currentZoom.toString());
      localStorage.setItem('yaser_md_zoom', currentZoom.toString());
    } catch (e) {}

    const scale = currentZoom / 100;
    const workspace = document.getElementById('workspace');
    const editorEl = document.getElementById('markdown-editor');
    const previewEl = document.getElementById('preview-content');

    // 1. تطبيق النسبة على مساحة العمل المشتركة
    if (workspace) {
      workspace.style.setProperty('--workspace-zoom', scale);
    }

    // 2. تطبيق الزوم الشامل الماستر (كأنك تضغط Ctrl + Scroll) على محتوى الصندوقين بالكامل
    if (editorEl) {
      editorEl.style.fontSize = '';
      editorEl.style.lineHeight = '';
      editorEl.style.zoom = scale;
    }

    if (previewEl) {
      previewEl.style.fontSize = '';
      previewEl.style.lineHeight = '';
      previewEl.style.zoom = scale;
    }

    showToast(`حجم مساحات العمل: ${currentZoom}%`, 'info', 1000);
  }

  window.zoomWorkspace = function (direction) {
    if (direction === 0) {
      applyWorkspaceZoom(100);
    } else {
      applyWorkspaceZoom(currentZoom + (direction * 10));
    }
  };

  // استعادة مستوى التكبير المحفوظ عند الفتح
  if (currentZoom !== 100) {
    setTimeout(() => {
      applyWorkspaceZoom(currentZoom);
    }, 150);
  }

  // دعم اختصارات لوحة المفاتيح لتكبير/تصغير مساحات العمل: Ctrl + و Ctrl - و Ctrl 0
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        window.zoomWorkspace(1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        window.zoomWorkspace(-1);
      } else if (e.key === '0') {
        e.preventDefault();
        window.zoomWorkspace(0);
      }
    }
  });

  // ==========================================
  // SINGLE DIAGRAM ZOOM (تكبير وتصغير المخطط والمحتوى معاً مع ثبات الأزرار تحت الماوس)
  // ==========================================
  window.zoomSingleDiagram = function (btn, direction) {
    const wrapper = btn.closest('.mermaid-wrapper');
    if (!wrapper) return;

    const svg = wrapper.querySelector('.mermaid svg');
    if (!svg) return;

    // استخراج وتثبيت الحجم الأصلي الحقيقي للمخطط
    let baseWidth = parseFloat(svg.getAttribute('data-base-width'));
    if (!baseWidth || isNaN(baseWidth)) {
      baseWidth = parseFloat(svg.style.maxWidth) || svg.viewBox?.baseVal?.width || svg.getBoundingClientRect().width || 320;
      svg.setAttribute('data-base-width', baseWidth);
    }

    let currentScale = parseFloat(wrapper.getAttribute('data-zoom') || '1.0');

    if (direction === 1) {
      currentScale = Math.min(currentScale + 0.15, 2.2); // تكبير حتى 220%
    } else if (direction === -1) {
      currentScale = Math.max(currentScale - 0.15, 0.45); // تصغير حتى 45%
    }

    wrapper.setAttribute('data-zoom', currentScale.toFixed(2));

    // 1. تكبير أو تصغير المخطط الفعلي (SVG Content) نفسه
    const targetWidth = Math.round(baseWidth * currentScale);
    svg.style.maxWidth = `${targetWidth}px`;
    svg.style.width = `${targetWidth}px`;
    svg.style.height = 'auto';

    // 2. تكييف حجم الإطار ليلتصق بالمحتوى ويتوسع ويضيق معه بدقة متطابقة
    wrapper.style.width = 'fit-content';
    wrapper.style.maxWidth = '100%';
    wrapper.style.minWidth = '220px';

    showToast(`حجم المخطط: ${Math.round(currentScale * 100)}%`, 'info', 800);
  };

  // ==========================================
  // CODE BLOCK COPY BUTTON (نسخ الكود كاملاً بنقرة زر بدون تكبير)
  // ==========================================
  function setupCodeCopyButtons() {
    previewContent.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.code-copy-btn')) return;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'code-copy-btn';
      copyBtn.setAttribute('title', 'نسخ الكود كاملاً');
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>نسخ</span>
      `;

      copyBtn.onclick = function (e) {
        e.stopPropagation();
        const codeEl = pre.querySelector('code') || pre;
        const textToCopy = codeEl.innerText || codeEl.textContent;

        const handleSuccess = () => {
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10b981" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span style="color:#10b981;">تم النسخ!</span>
          `;
          showToast('تم نسخ الكود البرمجي بالكامل! 📋', 'success', 2000);
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>نسخ</span>
            `;
          }, 2000);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy.trim()).then(handleSuccess).catch(() => {
            fallbackCopy(textToCopy.trim());
            handleSuccess();
          });
        } else {
          fallbackCopy(textToCopy.trim());
          handleSuccess();
        }
      };

      pre.appendChild(copyBtn);
    });
  }

  // ==========================================
  // INTERACTIVE IMAGE RESIZING WITH HANDLES
  // مقابض تكبير وتصغير الصور التفاعلية مع شريط أدوات مصغر
  // ==========================================
  function setupImageResizers(container) {
    if (!container) return;

    // فك أي تغليف خاطئ للأيقونات والإيموجي المضمنة لتعود نصوصاً طبيعية بدون إطارات
    container.querySelectorAll('.image-resizer-wrapper').forEach((wrapper) => {
      const emojiImg = wrapper.querySelector('img.inline-emoji, img[src*="assets/icons/emojis/"]');
      if (emojiImg && wrapper.parentNode) {
        wrapper.parentNode.replaceChild(emojiImg, wrapper);
      }
    });

    const images = container.querySelectorAll('img');

    images.forEach((img) => {
      // استثناء مخططات mermaid وأزرار التكبير وأيقونات الإيموجي المضمنة
      if (
        img.closest('.mermaid') ||
        img.closest('.diagram-zoom-controls') ||
        img.classList.contains('inline-emoji') ||
        (img.getAttribute('src') || '').includes('assets/icons/emojis/') ||
        img.closest('.inline-emoji')
      ) {
        return;
      }
      if (img.parentElement && img.parentElement.classList.contains('image-resizer-wrapper')) {
        return;
      }

      const originalWidth = img.getAttribute('width') || (img.style.width ? img.style.width : '');
      const wrapper = document.createElement('div');
      wrapper.className = 'image-resizer-wrapper';
      wrapper.setAttribute('data-align', 'center');

      if (originalWidth) {
        wrapper.style.width = originalWidth.endsWith('%') || originalWidth.endsWith('px') ? originalWidth : `${originalWidth}px`;
      }

      // Quick Floating Toolbar
      const toolbar = document.createElement('div');
      toolbar.className = 'image-resizer-toolbar';
      toolbar.setAttribute('contenteditable', 'false');
      toolbar.innerHTML = `
        <button type="button" class="resizer-btn" data-preset="25%" title="تصغير إلى 25%">25%</button>
        <button type="button" class="resizer-btn" data-preset="50%" title="تصغير إلى 50%">50%</button>
        <button type="button" class="resizer-btn" data-preset="75%" title="تصغير إلى 75%">75%</button>
        <button type="button" class="resizer-btn" data-preset="100%" title="عرض كامل 100%">100%</button>
        <span class="resizer-divider"></span>
        <button type="button" class="resizer-btn" data-align="right" title="محاذاة لليمين">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="12" x2="9" y2="12"></line><line x1="21" y1="18" x2="5" y2="18"></line></svg>
        </button>
        <button type="button" class="resizer-btn active" data-align="center" title="توسيط">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="6"></line><line x1="21" y1="12" x2="3" y2="12"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>
        </button>
        <button type="button" class="resizer-btn" data-align="left" title="محاذاة لليسار">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="15" y1="12" x2="3" y2="12"></line><line x1="19" y1="18" x2="3" y2="18"></line></svg>
        </button>
        <span class="resizer-divider"></span>
        <span class="resizer-size-badge"></span>
      `;

      // Handles
      const handlesHtml = `
        <div class="resizer-handle handle-nw" data-dir="nw" title="اسحب للتكبير والتصغير"></div>
        <div class="resizer-handle handle-ne" data-dir="ne" title="اسحب للتكبير والتصغير"></div>
        <div class="resizer-handle handle-sw" data-dir="sw" title="اسحب للتكبير والتصغير"></div>
        <div class="resizer-handle handle-se" data-dir="se" title="اسحب للتكبير والتصغير"></div>
        <div class="resizer-handle handle-w" data-dir="w" title="اسحب للتكبير والتصغير العرضي"></div>
        <div class="resizer-handle handle-e" data-dir="e" title="اسحب للتكبير والتصغير العرضي"></div>
      `;

      // Wrap image in DOM
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(toolbar);
      wrapper.appendChild(img);
      wrapper.insertAdjacentHTML('beforeend', handlesHtml);

      const sizeBadge = toolbar.querySelector('.resizer-size-badge');
      const updateBadge = () => {
        const currentW = Math.round(wrapper.getBoundingClientRect().width);
        const parentW = wrapper.parentElement ? wrapper.parentElement.clientWidth : 800;
        const pct = Math.round((currentW / (parentW || 1)) * 100);
        sizeBadge.textContent = `${currentW}px (${pct}%)`;
      };

      setTimeout(updateBadge, 50);

      // Presets
      toolbar.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const preset = btn.getAttribute('data-preset');
          wrapper.style.width = preset;
          updateBadge();
          updateImageWidthInMarkdown(img.getAttribute('src'), preset);
        });
      });

      // Alignment
      toolbar.querySelectorAll('[data-align]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          toolbar.querySelectorAll('[data-align]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const align = btn.getAttribute('data-align');
          wrapper.setAttribute('data-align', align);
        });
      });

      // Select / Activate
      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.image-resizer-wrapper.active').forEach((w) => {
          if (w !== wrapper) w.classList.remove('active');
        });
        wrapper.classList.add('active');
        updateBadge();
      });

      // Handles Dragging
      const handles = wrapper.querySelectorAll('.resizer-handle');
      handles.forEach((handle) => {
        const dir = handle.getAttribute('data-dir');

        const onPointerDown = (e) => {
          e.preventDefault();
          e.stopPropagation();

          wrapper.classList.add('active');
          const startX = e.clientX || (e.touches && e.touches[0].clientX);
          const startWidth = wrapper.getBoundingClientRect().width;
          const containerWidth = wrapper.parentElement ? wrapper.parentElement.clientWidth : window.innerWidth;

          const onPointerMove = (moveEvt) => {
            const currentX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0].clientX);
            const deltaX = currentX - startX;

            let newWidth = startWidth;
            if (dir === 'se' || dir === 'ne' || dir === 'e') {
              newWidth = startWidth + deltaX;
            } else if (dir === 'sw' || dir === 'nw' || dir === 'w') {
              newWidth = startWidth - deltaX;
            }

            newWidth = Math.max(80, Math.min(newWidth, containerWidth));
            wrapper.style.width = `${Math.round(newWidth)}px`;
            updateBadge();
          };

          const onPointerUp = () => {
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);

            const finalWidth = Math.round(wrapper.getBoundingClientRect().width);
            updateImageWidthInMarkdown(img.getAttribute('src'), `${finalWidth}px`);
          };

          document.addEventListener('mousemove', onPointerMove);
          document.addEventListener('mouseup', onPointerUp);
          document.addEventListener('touchmove', onPointerMove);
          document.addEventListener('touchend', onPointerUp);
        };

        handle.addEventListener('mousedown', onPointerDown);
        handle.addEventListener('touchstart', onPointerDown, { passive: false });
      });
    });
  }

  // Deactivate resizers when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.image-resizer-wrapper')) {
      document.querySelectorAll('.image-resizer-wrapper.active').forEach((w) => w.classList.remove('active'));
    }
  });

  // تحديث حجم الصورة داخل نص الماركداون بالمحرر
  function updateImageWidthInMarkdown(imgSrc, newWidthVal) {
    if (!imgSrc) return;
    const activeEditor = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEditor) return;

    const currentText = activeEditor.value;
    const escapedSrc = imgSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let updatedText = currentText;

    // 1. فحص كود HTML img
    const htmlImgRegex = new RegExp(`(<img\\s+[^>]*src=["']${escapedSrc}["'][^>]*>)`, 'i');
    if (htmlImgRegex.test(currentText)) {
      updatedText = currentText.replace(htmlImgRegex, (match) => {
        if (/width=["'][^"']*["']/i.test(match)) {
          return match.replace(/width=["'][^"']*["']/i, `width="${newWidthVal}"`);
        } else {
          return match.replace(/\/?>$/, ` width="${newWidthVal}" />`);
        }
      });
    } else {
      // 2. فحص كود الماركداون: ![alt](src) أو ![alt|width](src)
      const mdImgRegex = new RegExp(`!\\[(.*?)\\]\\(\\s*${escapedSrc}(?:\\s+=[^\\)]*)?\\)`, 'i');
      if (mdImgRegex.test(currentText)) {
        updatedText = currentText.replace(mdImgRegex, (match, altText) => {
          const cleanAlt = (altText || '').replace(/\|(\d+%?|\d+px)$/, '').trim() || 'صورة';
          return `![${cleanAlt}|${newWidthVal}](${imgSrc})`;
        });
      }
    }

    if (updatedText !== currentText) {
      recordHistorySnapshot(true);
      editor.value = updatedText;
      if (classicEditor) classicEditor.value = updatedText;
      safeSaveToStorage('vienix_md_content', updatedText);
      safeSaveToStorage('yaser_md_content', updatedText);
      recordHistorySnapshot(true);
    }
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  // تفعيل سحب صندوق الأدوات العائمة بحرية (بدون أي تأثير بصري)
  function setupDraggableFloatingActions() {
    const containers = [
      document.getElementById('editor-floating-actions'),
      document.getElementById('classic-floating-actions')
    ];

    containers.forEach(container => {
      if (!container) return;

      let isDragging = false;
      let hasMoved = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;
      const DRAG_THRESHOLD = 5; // بكسل - لتمييز السحب عن النقر

      container.addEventListener('mousedown', (e) => {
        // تجاهل إذا كان الضغط على زر داخل الحاوية
        if (e.target.closest('button')) return;

        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
        startY = e.clientY;

        // تحويل من bottom/left إلى top/left عند أول سحب
        const rect = container.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // فحص عتبة الحركة
        if (!hasMoved && Math.abs(deltaX) < DRAG_THRESHOLD && Math.abs(deltaY) < DRAG_THRESHOLD) {
          return;
        }
        hasMoved = true;

        // حساب الموقع الجديد مع منع الخروج من الشاشة
        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;

        const maxLeft = window.innerWidth - container.offsetWidth;
        const maxTop = window.innerHeight - container.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        // تحديث الموقع
        container.style.position = 'fixed';
        container.style.left = newLeft + 'px';
        container.style.top = newTop + 'px';
        container.style.bottom = 'auto';
        container.style.right = 'auto';
      });

      document.addEventListener('mouseup', () => {
        isDragging = false;
      });
    });
  }

  // تفعيل سحب الخط الفاصل لتعديل مساحة المحرر والمعاينة ديناميكياً
  function setupWorkspaceResizer() {
    const resizer = document.getElementById('workspace-resizer');
    const workspaceContainer = document.getElementById('workspace');
    const panelEditor = document.getElementById('panel-editor');
    if (!resizer || !workspaceContainer || !panelEditor) return;

    // استعادة النسبة المحفوظة مسبقاً (الافتراضي 50%)
    try {
      const savedPct = getStored('vienix_split_pct', 'yaser_split_pct');
      if (savedPct) {
        const pct = parseFloat(savedPct);
        if (!isNaN(pct) && pct >= 15 && pct <= 85) {
          workspaceContainer.style.setProperty('--editor-pane-width', `${pct}%`);
        }
      }
      const savedStyle = getStored('vienix_resizer_style', 'yaser_resizer_style');
      if (savedStyle === 'slim') {
        resizer.classList.add('is-slim');
        document.getElementById('btn-toggle-resizer-style')?.classList.add('active');
      }
    } catch (e) {}

    let isResizing = false;

    function startResizing(e) {
      if (e.type === 'mousedown' && e.button !== 0) return;
      isResizing = true;
      resizer.classList.add('is-dragging');
      document.body.classList.add('is-resizing-workspace');
      if (e.cancelable) e.preventDefault();
    }

    function doResize(clientX) {
      if (!isResizing) return;
      const workspaceRect = workspaceContainer.getBoundingClientRect();
      if (workspaceRect.width <= 0) return;

      // في الواجهة العربية (RTL)، قسم المحرر موجود على اليمين
      // المسافة من الحافة اليمنى للحاوية إلى موضع الماوس هي عرض المحرر
      const editorWidth = workspaceRect.right - clientX;
      let pct = (editorWidth / workspaceRect.width) * 100;

      // تحديد الحدود بين 15% و 85% لمنع اختفاء أي قسم تماماً
      pct = Math.max(15, Math.min(85, pct));

      workspaceContainer.style.setProperty('--editor-pane-width', `${pct}%`);
      if (typeof window.updateDrawerOverlayBounds === 'function') {
        window.updateDrawerOverlayBounds();
      }
      try {
        localStorage.setItem('vienix_split_pct', pct.toFixed(1));
        localStorage.setItem('yaser_split_pct', pct.toFixed(1));
      } catch (e) {}
    }

    function stopResizing() {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('is-dragging');
        document.body.classList.remove('is-resizing-workspace');
      }
    }

    // أحداث الفأرة (Mouse Events)
    resizer.addEventListener('mousedown', startResizing);

    document.addEventListener('mousemove', (e) => {
      if (isResizing) {
        doResize(e.clientX);
      }
    });

    document.addEventListener('mouseup', stopResizing);

    // النقر المزدوج لإعادة التقسيم بدقة إلى 50%
    resizer.addEventListener('dblclick', () => {
      window.resetSplitPercentage();
    });

    // أحداث اللمس للأجهزة اللمسية (Touch Events)
    resizer.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        startResizing(e);
      }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (isResizing && e.touches && e.touches.length === 1) {
        doResize(e.touches[0].clientX);
      }
    }, { passive: true });

    document.addEventListener('touchend', stopResizing);
  }

  // زر إعادة تنصيف موقع الخط الفاصل إلى 50% / 50%
  window.resetSplitPercentage = function () {
    const workspaceContainer = document.getElementById('workspace');
    if (!workspaceContainer) return;
    workspaceContainer.style.setProperty('--editor-pane-width', '50%');
    if (typeof window.updateDrawerOverlayBounds === 'function') {
      window.updateDrawerOverlayBounds();
    }
    try {
      localStorage.setItem('vienix_split_pct', '50');
      localStorage.setItem('yaser_split_pct', '50');
    } catch (e) {}
    showToast('تمت إعادة تنصيف مساحة العمل (50% / 50%) ⚖️', 'success', 1500);
  };

  // زر تبديل مظهر الخط الفاصل (خط رفيع 1px / مقبض بارز تفاعلي)
  window.toggleResizerStyle = function () {
    const resizer = document.getElementById('workspace-resizer');
    const btn = document.getElementById('btn-toggle-resizer-style');
    if (!resizer) return;
    const isNowSlim = !resizer.classList.contains('is-slim');
    resizer.classList.toggle('is-slim', isNowSlim);
    if (btn) btn.classList.toggle('active', isNowSlim);
    try {
      localStorage.setItem('vienix_resizer_style', isNowSlim ? 'slim' : 'handle');
      localStorage.setItem('yaser_resizer_style', isNowSlim ? 'slim' : 'handle');
    } catch (e) {}
    showToast(isNowSlim ? 'تم تفعيل الخط الفاصل الرفيع 📏' : 'تم تفعيل الخط الفاصل بمقبض بارز 🎛️', 'info', 1500);
  };

  // =========================================================
  // نظام الصفحات القانونية والسياسات (Legal Pages & Modal)
  // جاهز للقبول في Google AdSense وحماية حقوق الملكية
  // =========================================================

  const LEGAL_DOCS = {
    privacy: {
      title: 'سياسة الخصوصية',
      sub: 'Privacy Policy (Google AdSense & GDPR Ready)',
      icon: '🛡️',
      url: 'legal/privacy.html',
      html: `
        <div class="legal-modal-highlight">
          <strong>مبدأ الخصوصية أولاً (100% Client-side):</strong> محرر Vienix Markdown Editor يعمل محلياً بالكامل داخل متصفحك. لا نقوم برفع أو حفظ نصوصك أو مخططاتك على أي خوادم خارجية إطلاقاً.
        </div>
        <h4>1. ملفات تعريف الارتباط وإعلانات الطرف الثالث (Google AdSense)</h4>
        <p>قد يستعين موقعنا ببرنامج <strong>Google AdSense</strong> لعرض الإعلانات:</p>
        <ul>
          <li>يستخدم موردو الجهات الخارجية، ومنهم Google، ملفات تعريف ارتباط (Cookies) لعرض الإعلانات بناءً على زيارات المستخدم السابقة.</li>
          <li>تتيح ملفات تعريف الارتباط الإعلانية لشركة Google وشركائها إمكانية عرض إعلانات ملائمة للمستخدمين.</li>
          <li>يمكن للمستخدمين إلغاء الاشتراك في الإعلانات المخصصة بزيارة <a href="https://adssettings.google.com" target="_blank" rel="noopener">إعدادات إعلانات Google</a> أو موقع <a href="https://www.aboutads.info" target="_blank" rel="noopener">aboutads.info</a>.</li>
        </ul>
        <h4>2. حفظ البيانات محلياً (Local Storage)</h4>
        <p>تُحفظ مسودة النص وحالة الواجهة وتفضيلات الثيم محلياً في ذاكرة التخزين الداخلي لمتصفحك دون إرسالها إلى أي مكان.</p>
        <h4>3. الامتثال للوائح الدولية (GDPR / CCPA)</h4>
        <p>يحق لك مسح كافة بياناتك بضغطة زر واحدة عبر مسح ذاكرة التخزين المؤقت في متصفحك في أي وقت تشاء.</p>
      `
    },
    terms: {
      title: 'شروط الاستخدام',
      sub: 'Terms of Service & Usage Policy',
      icon: '📜',
      url: 'legal/terms.html',
      html: `
        <div class="legal-modal-highlight">
          <strong>ملكية المحتوى:</strong> كل ما تكتبه داخل المحرر هو ملكيتك الفكرية الخالصة والكاملة. لا يملك الموقع أو مطوره أي حقوق في كتاباتك أو أعمالك.
        </div>
        <h4>1. قبول الاتفاقية</h4>
        <p>استخدامك لمحرر Vienix Markdown Editor يعني موافقتك الكاملة على هذه الشروط المعمول بها لخدمات الويب الحرة.</p>
        <h4>2. رخصة الاستخدام والبرمجيات</h4>
        <p>الأداة البرمجية مفتوحة ومحمية بموجب حقوق <strong>Vienix Markdown Editor © 2026</strong> مع الامتثال لرخصة الاستخدام الواردة في ملف LICENSE.</p>
        <h4>3. الاستخدام العادل</h4>
        <p>يُحظر استخدام الأداة لتنفيذ أي نصوص برمجية خبيثة في الأكواد أو انتهاك حقوق الملكية الفكرية للآخرين.</p>
        <h4>4. تقديم الخدمة "كما هي" (AS IS)</h4>
        <p>يتم تقديم المحرر دون ضمانات صريحة أو ضمنية بالاستمرارية أو خلوّه من الأخطاء غير المتوقعة في بيئات التشغيل المختلفة.</p>
      `
    },
    impressum: {
      title: 'إشعار الناشر (Impressum)',
      sub: 'Legal Notice & Publisher Identification (§ 5 TMG)',
      icon: '🏛️',
      url: 'legal/impressum.html',
      html: `
        <div class="legal-modal-highlight">
          <strong>بيانات الناشر القانوني:</strong> مشروع Vienix Markdown Editor مطور ومصان بواسطة <strong>Yaser Hasan</strong> كأداة برمجية مفتوحة المصدر للمجتمع العربي والدولي.
        </div>
        <h4>1. المشغل والمسؤول عن النشر</h4>
        <p><strong>المطور والناشر:</strong> Vienix / Yaser Hasan</p>
        <p><strong>البريد الإلكتروني المعتمد:</strong> <a href="mailto:vienixtech@gmail.com">vienixtech@gmail.com</a></p>
        <h4>2. المسؤولية القانونية عن المحتوى</h4>
        <p>المحرر يعمل محلياً من طرف العميل (Client-Side). المستخدم هو المسؤول الوحيد عن أي محتوى يقوم بصياغته أو تصديره عبر الأداة.</p>
        <h4>3. تسوية النزاعات الأوروبية (ODR)</h4>
        <p>وفقاً للوائح المفوضية الأوروبية، نوفر قناة التواصل المباشر لحل أي استفسارات أو ملاحظات بشكل ودي وسريع عبر البريد الإلكتروني.</p>
      `
    },
    license: {
      title: 'رخصة الاستخدام وحقوق الملكية',
      sub: 'MIT License & Open Source Terms',
      icon: '⚖️',
      url: 'legal/license.html',
      html: `
        <div class="legal-modal-highlight">
          <strong>رخصة MIT الحرة:</strong> يحق لك استخدام وتطوير هذا المشروع وتضمينه في مشاريعك بحرية تامة بشرط ذكر حقوق المؤلف الأصلي.
        </div>
        <h4>ملخص الحقوق:</h4>
        <ul>
          <li><strong>حقوق الطبع والنشر:</strong> جميع الحقوق محفوظة © 2026 Vienix Markdown Editor.</li>
          <li><strong>حرية الاستخدام التجاري والشخصي:</strong> مسموح بالكامل دون أي رسوم.</li>
          <li><strong>إخلاء المسؤولية:</strong> يُقدم البرنامج كما هو "AS IS" دون ضمانات إضافية.</li>
        </ul>
        <p>يمكنك الاطلاع على النص القانوني الكامل للرخصة في صفحة <a href="legal/license.html" target="_blank">MIT License</a>.</p>
      `
    },
    disclaimer: {
      title: 'إخلاء المسؤولية',
      sub: 'Disclaimer & Data Safety Notice',
      icon: '⚠️',
      url: 'legal/disclaimer.html',
      html: `
        <div class="legal-modal-highlight">
          <strong>تنبيه هام حول النسخ الاحتياطي:</strong> نظراً لأن المحرر يعمل داخل المتصفح، فإن مسح بيانات التصفح أو استخدام وضع التصفح المتخفي قد يحذف النصوص المخزنة مؤقتاً. يرجى دائماً تصدير أو حفظ نسخ من أعمالك الهامة.
        </div>
        <h4>1. إخلاء المسؤولية عن فقدان البيانات</h4>
        <p>لا يتحمل مطور الموقع أي مسؤولية عن فقدان غير مقصود للمستندات بسبب تعطل المتصفح أو مسح ذاكرة التخزين المؤقت من قِبل المستخدم.</p>
        <h4>2. الروابط الخارجية والإعلانات</h4>
        <p>الموقع غير مسؤول عن محتوى أي مواقع خارجية أو إعلانات تابعة لشركات أخرى تظهر عبر شبكات الإعلانات كـ Google AdSense.</p>
      `
    },
    cookies: {
      title: 'سياسة ملفات تعريف الارتباط',
      sub: 'Cookie Policy & Web Storage',
      icon: '🍪',
      url: 'legal/cookies.html',
      html: `
        <h4>1. التخزين الضروري لتشغيل الأداة</h4>
        <p>نستخدم <strong>Web LocalStorage</strong> حصرياً لحفظ:</p>
        <ul>
          <li>مستنداتك ومسوداتك التحريرية لمنع ضياعها.</li>
          <li>تفضيلات المظهر (الوضع الليلي والنهاري).</li>
          <li>نسبة تقسيم الشاشة ومواضع النوافذ.</li>
        </ul>
        <h4>2. كوكيز الطرف الثالث (الإعلانات)</h4>
        <p>قد تقوم أدوات الإعلانات (مثل Google AdSense) بإنشاء ملفات كوكيز لأغراض عرض إعلانات تناسب اهتماماتك ومنع تكرار الإعلانات نفسها.</p>
        <p>يمكنك تعطيل هذه الملفات في أي وقت من خلال إعدادات المتصفح الخاص بك.</p>
      `
    },
    about: {
      title: 'من نحن',
      sub: 'About Vienix Markdown Editor',
      icon: 'ℹ️',
      url: 'legal/about.html',
      html: `
        <div class="legal-modal-highlight">
          <strong>رسالة المشروع:</strong> توفير بيئة كتابة ماركداون متقدمة ومجانية تدعم اللغة العربية والاتجاه من اليمين إلى اليسار (RTL) بشكل أصيل واحترافي.
        </div>
        <h4>أبرز المزايا:</h4>
        <ul>
          <li>دعم أصيل للنصوص العربية وتداخل الأكواد الإنجليزية.</li>
          <li>رسم المخططات الذكية بواسطة Mermaid.</li>
          <li>تصدير مباشر إلى PDF و DOCX و HTML و Markdown.</li>
          <li>عمل كامل بدون إنترنت (Offline Ready).</li>
        </ul>
        <h4>إشراف وتطوير:</h4>
        <p>المشروع مطور ومصان بواسطة <strong>Vienix / Yaser Hasan</strong> © 2026 لخدمة المحتوى العربي والمبرمجين والكتاب.</p>
      `
    },
    contact: {
      title: 'اتصل بنا',
      sub: 'Contact Us & Intellectual Property',
      icon: '✉️',
      url: 'legal/contact.html',
      html: `
        <h4>قنوات التواصل الرسمية:</h4>
        <p>لأي استفسارات قانونية، أسئلة حول الخصوصية، التبليغ عن مشاكل، أو انتهاكات حقوق الملكية (DMCA):</p>
        <ul>
          <li><strong>البريد الإلكتروني المعتمد:</strong> <a href="mailto:vienixtech@gmail.com">vienixtech@gmail.com</a></li>
        </ul>
        <p>نلتزم بالرد على جميع الرسائل والطلبات القانونية في غضون 24 إلى 48 ساعة.</p>
      `
    }
  };

  let currentLegalDocKey = 'privacy';

  window.toggleLegalMenu = function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const wrap = document.getElementById('legal-dropdown-wrap');
    if (!wrap) return;
    wrap.classList.toggle('open');
  };

  window.closeLegalMenu = function () {
    const wrap = document.getElementById('legal-dropdown-wrap');
    if (wrap) wrap.classList.remove('open');
  };

  // إغلاق القائمة عند النقر بالخارج
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('legal-dropdown-wrap');
    if (wrap && wrap.classList.contains('open')) {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('open');
      }
    }
  });

  window.openLegalModal = function (e, docKey) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    window.closeLegalMenu();
    window.switchLegalTab(docKey || 'privacy');

    const overlay = document.getElementById('legal-modal-overlay');
    if (overlay) {
      overlay.classList.add('active');
    }
  };

  window.closeLegalModal = function () {
    const overlay = document.getElementById('legal-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
  };

  window.closeLegalModalOnBackdrop = function (e) {
    if (e.target.id === 'legal-modal-overlay') {
      window.closeLegalModal();
    }
  };

  window.switchLegalTab = function (docKey) {
    const doc = LEGAL_DOCS[docKey];
    if (!doc) return;
    currentLegalDocKey = docKey;

    const heading = document.getElementById('legal-modal-heading');
    const sub = document.getElementById('legal-modal-sub');
    const icon = document.getElementById('legal-modal-icon');
    const body = document.getElementById('legal-modal-body');
    const extLink = document.getElementById('legal-modal-external-link');

    if (heading) heading.textContent = doc.title;
    if (sub) sub.textContent = doc.sub;
    if (icon) icon.textContent = doc.icon;
    if (body) body.innerHTML = doc.html;
    if (extLink) extLink.href = doc.url;

    // تحديث أزرار التبويب في الفوتر
    const navButtons = document.querySelectorAll('.legal-tab-btn');
    const tabKeys = ['privacy', 'terms', 'impressum', 'license', 'disclaimer', 'cookies', 'about', 'contact'];
    navButtons.forEach((btn, index) => {
      if (tabKeys[index] === docKey) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (body) body.scrollTop = 0;
  };

  // إغلاق المودال بزر Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeLegalModal();
      window.closeLegalMenu();
      if (typeof window.closeWysiwygLinkModal === 'function') {
        window.closeWysiwygLinkModal();
      }
      if (typeof window.closeWysiwygColorPopover === 'function') {
        window.closeWysiwygColorPopover();
      }
      if (typeof window.closeEmojiPicker === 'function') {
        window.closeEmojiPicker();
      }
    }
  });

  // =========================================================================
  // نظام التحرير المباشر في مساحة العرض (WYSIWYG Live Preview System)
  // يشمل: تحويل المعاينة إلى محرر، مكتبة Turndown، شريط التنسيق العائم، وحماية المخططات
  // =========================================================================
  let isWysiwygActive = false;
  let turndownService = null;
  let wysiwygDebounceTimer = null;
  let isWysiwygSyncing = false;

  function initTurndown() {
    if (typeof TurndownService === 'undefined') {
      console.warn('TurndownService is not available yet.');
      return;
    }
    turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      strongDelimiter: '**'
    });

    // استخدام إضافات GFM للجداول والشطب وقوائم المهام
    if (typeof turndownPluginGfm !== 'undefined' && turndownPluginGfm.gfm) {
      turndownService.use(turndownPluginGfm.gfm);
    }

    // قاعدة حماية مخططات Mermaid واسترجاع الكود الأصلي
    turndownService.addRule('preserveMermaidDiagrams', {
      filter: function (node) {
        return (
          node.nodeName === 'DIV' &&
          (node.classList.contains('mermaid-wrapper') || node.classList.contains('mermaid'))
        );
      },
      replacement: function (content, node) {
        let diagramCode = '';
        const mermaidInner = node.classList.contains('mermaid') ? node : node.querySelector('.mermaid');
        if (mermaidInner) {
          if (mermaidInner.hasAttribute('data-diagram')) {
            try {
              diagramCode = decodeURIComponent(mermaidInner.getAttribute('data-diagram'));
            } catch (e) {
              diagramCode = mermaidInner.getAttribute('data-diagram');
            }
          } else {
            diagramCode = mermaidInner.textContent.trim();
          }
        }
        return '\n\n```mermaid\n' + (diagramCode || '').trim() + '\n```\n\n';
      }
    });

    // قاعدة الحفاظ على لغة كتل الأكواد البرمجية Prism
    turndownService.addRule('preserveCodeBlocks', {
      filter: function (node) {
        return (
          node.nodeName === 'PRE' &&
          node.querySelector('code') &&
          !node.classList.contains('mermaid')
        );
      },
      replacement: function (content, node) {
        const codeEl = node.querySelector('code');
        let lang = '';
        if (codeEl) {
          const classes = codeEl.className.split(/\s+/);
          for (const cls of classes) {
            if (cls.startsWith('language-')) {
              lang = cls.replace('language-', '');
              break;
            }
          }
        }
        const rawCode = codeEl ? codeEl.textContent : node.textContent;
        return '\n\n```' + lang + '\n' + rawCode.replace(/\n+$/, '') + '\n```\n\n';
      }
    });

    // قاعدة تجريد عناصر واجهة المستخدم الداخلية (أزرار الزوم، أزرار النسخ، ومقابض التحجيم)
    turndownService.addRule('stripInternalUIElements', {
      filter: function (node) {
        return (
          node.classList &&
          (node.classList.contains('diagram-zoom-controls') ||
           node.classList.contains('code-copy-btn') ||
           node.classList.contains('img-resize-handle') ||
           node.classList.contains('image-action-overlay'))
        );
      },
      replacement: function () {
        return '';
      }
    });

    // قاعدة الحفاظ على ألوان النصوص والتمييز (Text Colors & Highlights)
    turndownService.addRule('preserveColorsAndHighlights', {
      filter: function (node) {
        if (node.nodeName === 'MARK') return true;
        if (node.nodeName === 'SPAN') {
          return !!(node.style && (node.style.color || node.style.backgroundColor));
        }
        if (node.nodeName === 'FONT' && (node.color || node.getAttribute('color'))) {
          return true;
        }
        return false;
      },
      replacement: function (content, node) {
        if (!content) return '';
        if (node.nodeName === 'MARK') {
          const bg = node.style && node.style.backgroundColor;
          return bg ? `<mark style="background-color: ${bg};">${content}</mark>` : `<mark>${content}</mark>`;
        }
        let styles = [];
        const color = (node.style && node.style.color) || node.getAttribute('color') || '';
        const bg = (node.style && node.style.backgroundColor) || '';
        if (color) styles.push(`color: ${color}`);
        if (bg) styles.push(`background-color: ${bg}`);
        if (styles.length > 0) {
          return `<span style="${styles.join('; ')}">${content}</span>`;
        }
        return content;
      }
    });

    // قاعدة الحفاظ على أيقونات الإيموجي والشارات الملونة المحلية
    turndownService.addRule('preserveInlineEmojis', {
      filter: function (node) {
        return (
          node.nodeName === 'IMG' &&
          (node.classList.contains('inline-emoji') || (node.getAttribute('src') || '').includes('assets/icons/emojis/'))
        );
      },
      replacement: function (content, node) {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || 'emoji';
        const title = node.getAttribute('title') || '';
        return `<img src="${src}" width="22" height="22" class="inline-emoji" alt="${alt}" title="${title}">`;
      }
    });
  }

  // حماية العناصر غير القابلة للتحرير المباشر داخل المعاينة
  function protectNonEditableElements() {
    if (!previewContent) return;
    const nonEditables = previewContent.querySelectorAll(
      '.mermaid-wrapper, .mermaid, .diagram-zoom-controls, .code-copy-btn, .img-resize-handle, .image-action-overlay'
    );
    nonEditables.forEach(el => {
      el.setAttribute('contenteditable', 'false');
    });
  }

  // مزامنة محتوى المعاينة المباشر إلى نصوص الماركداون
  function syncPreviewToMarkdown(immediate = false) {
    if (!turndownService) initTurndown();
    if (!turndownService || !previewContent) return;

    clearTimeout(wysiwygDebounceTimer);

    const doSync = () => {
      if (isWysiwygSyncing) return;
      isWysiwygSyncing = true;

      try {
        // نسخ مؤقت لشجرة العناصر لتنظيفها قبل التحويل
        const clone = previewContent.cloneNode(true);

        // إزالة أزرار الزوم والنسخ ومقابض التحجيم من النسخة
        clone.querySelectorAll(
          '.diagram-zoom-controls, .code-copy-btn, .img-resize-handle, .image-action-overlay'
        ).forEach(el => el.remove());

        // تحويل شجرة HTML إلى نصوص ماركداون دقيقة
        let md = turndownService.turndown(clone.innerHTML);

        // توحيد فواصل الأسطر
        md = md.replace(/\r\n/g, '\n');

        // تحديث محرر النصوص بدون وميض
        editor.value = md;
        if (classicEditor) classicEditor.value = md;

        // تحديث الإحصائيات والحجرة النشطة
        updateStats(md);
        setChamberContent(activeChamber, md);
        updateChambersUI();

        if (saveStatus) {
          saveStatus.textContent = 'تم الحفظ تلقائياً ✓';
          saveStatus.className = 'save-badge';
        }

        if (!isPerformingHistory) {
          recordHistorySnapshot(false);
        }
      } catch (err) {
        console.warn('WYSIWYG Markdown Sync Warning:', err);
      } finally {
        isWysiwygSyncing = false;
      }
    };

    if (immediate) {
      doSync();
    } else {
      wysiwygDebounceTimer = setTimeout(doSync, 280);
    }
  }

  // تحديث شارة ترويسة نافذة المعاينة
  function updatePreviewHeaderIndicator(active) {
    const badge = document.getElementById('preview-mode-badge');
    if (badge) {
      if (active) {
        badge.textContent = 'وضع التحرير المباشر ✏️';
        badge.className = 'badge wysiwyg-active-badge';
      } else {
        badge.textContent = 'Mermaid & HTML';
        badge.className = 'badge';
      }
    }
  }

  // إخفاء شريط التنسيق العائم
  function hideFloatingFormatToolbar() {
    const toolbar = document.getElementById('wysiwyg-floating-toolbar');
    if (toolbar) {
      toolbar.classList.remove('visible');
      toolbar.style.display = 'none';
    }
    if (typeof window.closeWysiwygColorPopover === 'function') {
      window.closeWysiwygColorPopover();
    }
    if (typeof window.closeEmojiPicker === 'function') {
      window.closeEmojiPicker();
    }
  }

  // فحص وتحديث حالة أزرار شريط التنسيق العائم
  function updateToolbarButtonStates() {
    const toolbar = document.getElementById('wysiwyg-floating-toolbar');
    if (!toolbar || !isWysiwygActive) return;

    toolbar.querySelectorAll('.wysiwyg-tool-btn').forEach(btn => {
      const cmd = btn.getAttribute('data-command');
      if (cmd && ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(cmd)) {
        try {
          if (document.queryCommandState(cmd)) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        } catch (_) {}
      }
    });
  }

  // تهيئة شريط التنسيق العائم (Floating Formatting Bar - المرحلة 3)
  function setupFloatingFormatToolbar() {
    const toolbar = document.getElementById('wysiwyg-floating-toolbar');
    if (!toolbar) return;

    // منع فقدان التحديد عند النقر على أدوات الشريط
    toolbar.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    // ربط أوامر التنسيق بأزرار الشريط
    toolbar.querySelectorAll('.wysiwyg-tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isWysiwygActive) return;

        const cmd = btn.getAttribute('data-command');
        const val = btn.getAttribute('data-value') || null;

        if (cmd === 'createLink') {
          openWysiwygLinkModal();
          return;
        } else if (cmd === 'removeFormat') {
          // مسح التنسيق الشامل الاحترافي
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            document.execCommand('removeFormat', false, null);
            document.execCommand('unlink', false, null);
            document.execCommand('formatBlock', false, 'P');
            const range = sel.getRangeAt(0);
            let container = range.commonAncestorContainer;
            if (container) {
              const codeParent = (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement)?.closest('code');
              if (codeParent && previewContent.contains(codeParent)) {
                const textNode = document.createTextNode(codeParent.textContent);
                codeParent.parentNode.replaceChild(textNode, codeParent);
              }
              const markParent = (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement)?.closest('mark');
              if (markParent && previewContent.contains(markParent)) {
                const textNode = document.createTextNode(markParent.textContent);
                markParent.parentNode.replaceChild(textNode, markParent);
              }
              const coloredSpan = (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement)?.closest('span[style]');
              if (coloredSpan && previewContent.contains(coloredSpan)) {
                coloredSpan.style.color = '';
                coloredSpan.style.backgroundColor = '';
                if (!coloredSpan.getAttribute('style') || !coloredSpan.getAttribute('style').trim()) {
                  const textNode = document.createTextNode(coloredSpan.textContent);
                  coloredSpan.parentNode.replaceChild(textNode, coloredSpan);
                }
              }
            }
          }
          syncPreviewToMarkdown(true);
          updateToolbarButtonStates();
          return;
        } else if (cmd === 'code') {
          // تبديل كود مضمن inline code
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            const parentCode = range.commonAncestorContainer.parentElement?.closest('code');
            if (parentCode) {
              const textNode = document.createTextNode(parentCode.textContent);
              parentCode.parentNode.replaceChild(textNode, parentCode);
            } else {
              const fragment = range.extractContents();
              const codeEl = document.createElement('code');
              codeEl.appendChild(fragment);
              range.insertNode(codeEl);
              sel.selectAllChildren(codeEl);
            }
          }
        } else if (cmd) {
          document.execCommand(cmd, false, val);
        }

        // المزامنة الفورية مع محرر النصوص بعد التنسيق
        syncPreviewToMarkdown(true);
        updateToolbarButtonStates();
      });
    });

    // معالجة ظهور وتموضع شريط التنسيق عند تحديد نص داخل المعاينة
    const handleSelection = () => {
      if (!isWysiwygActive) {
        hideFloatingFormatToolbar();
        return;
      }

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        hideFloatingFormatToolbar();
        return;
      }

      const range = sel.getRangeAt(0);
      let container = range.commonAncestorContainer;
      if (container && container.nodeType !== Node.ELEMENT_NODE) {
        container = container.parentElement;
      }
      if (!container || !previewContent.contains(container)) {
        hideFloatingFormatToolbar();
        return;
      }

      const text = sel.toString().trim();
      if (!text) {
        hideFloatingFormatToolbar();
        return;
      }

      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideFloatingFormatToolbar();
        return;
      }

      toolbar.style.display = 'flex';
      toolbar.classList.add('visible');

      const toolbarWidth = toolbar.offsetWidth || 340;
      const toolbarHeight = toolbar.offsetHeight || 38;

      let left = rect.left + rect.width / 2;
      const margin = 12;
      const minLeft = toolbarWidth / 2 + margin;
      const maxLeft = window.innerWidth - toolbarWidth / 2 - margin;
      left = Math.max(minLeft, Math.min(left, maxLeft));

      let top = rect.top - toolbarHeight - 8;
      if (top < 12) {
        // إذا كان قريباً جداً من الحافة العلوية، يظهر أسفل النص المحدد
        top = rect.bottom + 8;
      }

      toolbar.style.left = `${left}px`;
      toolbar.style.top = `${top}px`;

      updateToolbarButtonStates();
    };

    document.addEventListener('selectionchange', handleSelection);
    previewContent.addEventListener('mouseup', () => setTimeout(handleSelection, 25));
    previewContent.addEventListener('keyup', () => setTimeout(handleSelection, 25));

    window.addEventListener('scroll', () => {
      if (isWysiwygActive && toolbar.classList.contains('visible')) {
        handleSelection();
      }
    }, { passive: true });
  }

  // التبديل بين وضع القراءة ووضع التحرير المباشر
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
  };

  // تهيئة النظام بالكامل
  function initWysiwygPreviewSystem() {
    initTurndown();
    setupFloatingFormatToolbar();

    if (previewContent) {
      previewContent.addEventListener('input', () => {
        if (!isWysiwygActive) return;
        if (saveStatus) {
          saveStatus.textContent = 'جارٍ الحفظ والكتابة في المعاينة...';
          saveStatus.className = 'save-badge saving';
        }
        syncPreviewToMarkdown(false);
      });

      previewContent.addEventListener('blur', () => {
        if (!isWysiwygActive) return;
        syncPreviewToMarkdown(true);
      });
    }
  }

  // =========================================================================
  // نافذة إدراج رابط احترافية (WYSIWYG Link Modal Logic)
  // =========================================================================
  let savedWysiwygSelectionRange = null;

  window.openWysiwygLinkModal = function () {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedWysiwygSelectionRange = sel.getRangeAt(0).cloneRange();
    } else {
      savedWysiwygSelectionRange = null;
    }

    const selectedText = savedWysiwygSelectionRange ? savedWysiwygSelectionRange.toString().trim() : '';

    const textInput = document.getElementById('wysiwyg-link-text-input');
    const urlInput = document.getElementById('wysiwyg-link-url-input');
    const modal = document.getElementById('wysiwyg-link-modal');

    if (textInput) textInput.value = selectedText;
    if (urlInput) {
      let currentHref = '';
      if (savedWysiwygSelectionRange) {
        let node = savedWysiwygSelectionRange.commonAncestorContainer;
        const anchor = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('a');
        if (anchor) currentHref = anchor.getAttribute('href') || '';
      }
      urlInput.value = currentHref || '';
    }

    if (modal) {
      modal.style.display = 'flex';
      setTimeout(() => {
        if (urlInput) {
          urlInput.focus();
          if (urlInput.value) urlInput.select();
        }
      }, 50);
    }
  };

  window.closeWysiwygLinkModal = function (e) {
    if (e && e.target && e.target.closest && e.target.closest('.chamber-modal-dialog')) return;
    const modal = document.getElementById('wysiwyg-link-modal');
    if (modal) modal.style.display = 'none';
  };

  window.confirmInsertWysiwygLink = function () {
    const urlInput = document.getElementById('wysiwyg-link-url-input');
    const textInput = document.getElementById('wysiwyg-link-text-input');
    let url = urlInput ? urlInput.value.trim() : '';
    let text = textInput ? textInput.value.trim() : '';

    if (!url) {
      if (urlInput) urlInput.focus();
      return;
    }

    if (!/^(https?:\/\/|mailto:|tel:|#)/i.test(url)) {
      url = 'https://' + url;
    }

    // Restore saved selection
    if (savedWysiwygSelectionRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedWysiwygSelectionRange);
    }

    if (text && (!savedWysiwygSelectionRange || savedWysiwygSelectionRange.collapsed)) {
      const a = document.createElement('a');
      a.href = url;
      a.textContent = text;
      if (savedWysiwygSelectionRange) {
        savedWysiwygSelectionRange.insertNode(a);
      } else if (previewContent) {
        previewContent.appendChild(a);
      }
    } else {
      document.execCommand('createLink', false, url);
      if (text && savedWysiwygSelectionRange) {
        const anchor = (savedWysiwygSelectionRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ?
                        savedWysiwygSelectionRange.commonAncestorContainer :
                        savedWysiwygSelectionRange.commonAncestorContainer.parentElement)?.closest('a') ||
                       (savedWysiwygSelectionRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ?
                        savedWysiwygSelectionRange.commonAncestorContainer.querySelector('a') : null);
        if (anchor) anchor.textContent = text;
      }
    }

    closeWysiwygLinkModal();
    syncPreviewToMarkdown(true);
  };

  // =========================================================================
  // نظام ألوان النصوص والتمييز للشريط العائم (WYSIWYG Colors & Highlights)
  // =========================================================================
  let activeColorType = 'foreColor';

  const TEXT_COLORS = [
    { name: 'أسود', hex: '#000000' },
    { name: 'أحمر', hex: '#ef4444' },
    { name: 'برتقالي', hex: '#f97316' },
    { name: 'أصفر عنبري', hex: '#eab308' },
    { name: 'أخضر', hex: '#16a34a' },
    { name: 'سماوي', hex: '#06b6d4' },
    { name: 'أزرق فينيكس', hex: '#2563eb' },
    { name: 'بنفسجي', hex: '#8b5cf6' },
    { name: 'وردي', hex: '#ec4899' },
    { name: 'رمادي', hex: '#64748b' },
    { name: 'بني', hex: '#b45309' },
    { name: 'أبيض', hex: '#ffffff' }
  ];

  const HILITE_COLORS = [
    { name: 'أصفر قلم التمييز', hex: '#fef08a' },
    { name: 'أخضر نعناعي', hex: '#bbf7d0' },
    { name: 'سماوي هادئ', hex: '#bae6fd' },
    { name: 'مشمشي دافئ', hex: '#fed7aa' },
    { name: 'وردي ناعم', hex: '#fecdd3' },
    { name: 'خزامى بنفسجي', hex: '#e9d5ff' },
    { name: 'أصفر باستيل', hex: '#fef9c3' },
    { name: 'أخضر ليموني', hex: '#dcfce7' },
    { name: 'أزرق جليدي', hex: '#e0f2fe' },
    { name: 'خوخي دافئ', hex: '#ffedd5' },
    { name: 'مرجاني فاتح', hex: '#ffe4e6' },
    { name: 'رمادي لؤلؤي', hex: '#f1f5f9' }
  ];

  window.openWysiwygColorPopover = function (type, triggerBtn, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedWysiwygSelectionRange = sel.getRangeAt(0).cloneRange();
    }

    activeColorType = type;
    const popover = document.getElementById('wysiwyg-color-popover');
    const titleEl = document.getElementById('wysiwyg-popover-title');
    const swatchesContainer = document.getElementById('wysiwyg-color-swatches');
    if (!popover || !swatchesContainer) return;

    if (titleEl) {
      titleEl.textContent = type === 'foreColor' ? 'لون الخط (Text Color)' : 'لون التمييز (Highlight Color)';
    }

    const palette = type === 'foreColor' ? TEXT_COLORS : HILITE_COLORS;
    swatchesContainer.innerHTML = '';

    palette.forEach(c => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'wysiwyg-color-swatch';
      swatch.style.backgroundColor = c.hex;
      swatch.title = c.name;
      swatch.onclick = (e) => {
        e.preventDefault();
        applyWysiwygColor(c.hex);
      };
      swatchesContainer.appendChild(swatch);
    });

    popover.style.display = 'block';

    popover.onmousedown = (e) => {
      if (e.target.id !== 'wysiwyg-custom-color-input') {
        e.preventDefault();
      }
    };

    const targetBtn = triggerBtn || document.getElementById(type === 'foreColor' ? 'wysiwyg-btn-forecolor' : 'wysiwyg-btn-hilitecolor');
    if (targetBtn) {
      const btnRect = targetBtn.getBoundingClientRect();
      const popWidth = popover.offsetWidth || 236;
      const popHeight = popover.offsetHeight || 150;

      let left = btnRect.left + btnRect.width / 2 - popWidth / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - popWidth - 12));

      let top = btnRect.bottom + 8;
      if (top + popHeight > window.innerHeight - 10) {
        top = btnRect.top - popHeight - 8;
      }

      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    }
  };

  window.closeWysiwygColorPopover = function () {
    const popover = document.getElementById('wysiwyg-color-popover');
    if (popover) {
      popover.style.display = 'none';
    }
  };

  window.applyWysiwygColor = function (colorHex) {
    if (savedWysiwygSelectionRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedWysiwygSelectionRange);
    }

    try {
      document.execCommand('styleWithCSS', false, true);
    } catch (_) {}

    if (activeColorType === 'foreColor') {
      if (!colorHex) {
        document.execCommand('foreColor', false, 'inherit');
        const bar = document.getElementById('wysiwyg-forecolor-bar');
        if (bar) bar.style.backgroundColor = '#ef4444';
      } else {
        document.execCommand('foreColor', false, colorHex);
        const bar = document.getElementById('wysiwyg-forecolor-bar');
        if (bar) bar.style.backgroundColor = colorHex;
      }
    } else {
      // hiliteColor
      if (!colorHex) {
        try {
          document.execCommand('hiliteColor', false, 'transparent');
        } catch (_) {
          document.execCommand('backColor', false, 'transparent');
        }
      } else {
        try {
          document.execCommand('hiliteColor', false, colorHex);
        } catch (_) {
          document.execCommand('backColor', false, colorHex);
        }
      }
    }

    closeWysiwygColorPopover();
    syncPreviewToMarkdown(true);
  };

  // إغلاق لوحة الألوان عند النقر خارجها
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('wysiwyg-color-popover');
    if (popover && popover.style.display !== 'none') {
      if (!popover.contains(e.target) && !e.target.closest('.wysiwyg-color-trigger-btn')) {
        window.closeWysiwygColorPopover();
      }
    }
    const emojiPop = document.getElementById('emoji-picker-popover');
    if (emojiPop && emojiPop.style.display !== 'none') {
      if (!emojiPop.contains(e.target) && !e.target.closest('#btn-insert-emoji') && !e.target.closest('#wysiwyg-btn-emoji')) {
        window.closeEmojiPicker();
      }
    }
  });

  // =========================================================================
  // نظام منتقي الأيقونات والإيموجي الملونة الفلات (Rich Flat Emoji & Badges)
  // =========================================================================
  const EMOJI_ITEMS = [
    { id: 'cool', file: 'cool.svg', name: 'نظارة شمسية كول', cat: 'faces', tags: 'cool sunglasses shade وجه نظارة كول فخم أصفر' },
    { id: 'heart-eyes', file: 'heart-eyes.svg', name: 'عيون قلوب حب', cat: 'faces', tags: 'love heart eyes عيون قلوب حب إعجاب رائع' },
    { id: 'star-eyes', file: 'star-eyes.svg', name: 'عيون نجوم مبهر', cat: 'faces', tags: 'star eyes excited نجوم حماس إبهار مذهل' },
    { id: 'laughing', file: 'laughing.svg', name: 'ضحك دموع فرح', cat: 'faces', tags: 'laugh joy tears ضحك دموع وناسة فرح' },
    { id: 'grin', file: 'grin.svg', name: 'ابتسامة عريضة', cat: 'faces', tags: 'grin smile happy ابتسامة سعادة مرح' },
    { id: 'thinking', file: 'thinking.svg', name: 'تفكير وتحليل', cat: 'faces', tags: 'think thinking idea تفكير ذكاء فكرة تأمل' },
    { id: 'wink', file: 'wink.svg', name: 'غمزة ثقة', cat: 'faces', tags: 'wink confidence غمزة ثقة سر' },
    { id: 'sad-blue', file: 'sad-blue.svg', name: 'حزن أزرق', cat: 'faces', tags: 'sad blue crying حزن زعل بكاء' },

    { id: 'verified-blue', file: 'verified-blue.svg', name: 'توثيق أزرق معتمد', cat: 'badges', tags: 'verified blue check badge توثيق أزرق صح علامة صح معتمد رسمي' },
    { id: 'verified-black', file: 'verified-black.svg', name: 'توثيق داكن ملكي', cat: 'badges', tags: 'verified black dark badge توثيق أسود داكن رسمي' },
    { id: 'check-circle-blue', file: 'check-circle-blue.svg', name: 'دائرة صح زرقاء', cat: 'badges', tags: 'check circle blue صح دائرة أزرق تأكيد نجاح تم' },
    { id: 'check-circle-green', file: 'check-circle-green.svg', name: 'دائرة صح خضراء', cat: 'badges', tags: 'check circle green صح دائرة أخضر تم قبول موافق' },
    { id: 'star-gold', file: 'star-gold.svg', name: 'نجمة ذهبية مميزة', cat: 'badges', tags: 'star gold favorite نجمة ذهبي مميز مفضلة' },
    { id: 'crown', file: 'crown.svg', name: 'تاج ذهبي ملكي', cat: 'badges', tags: 'crown gold king vip تاج ملك فخم ذهبي' },
    { id: 'target', file: 'target.svg', name: 'هدف وإنجاز', cat: 'badges', tags: 'target goal bullseye هدف إنجاز دقة وصول' },

    { id: 'fire', file: 'fire.svg', name: 'شعلة نار حماس', cat: 'symbols', tags: 'fire hot lit شعلة نار ترند حماس قوي اشتعال' },
    { id: 'rocket', file: 'rocket.svg', name: 'صاروخ انطلاق وسرعة', cat: 'symbols', tags: 'rocket launch fast صاروخ انطلاق سرعة تطور قفزة' },
    { id: 'sparkles', file: 'sparkles.svg', name: 'بريق ولمعان سحري', cat: 'symbols', tags: 'sparkles magic star بريق لمعان سحر جديد إشراق' },
    { id: 'heart-red', file: 'heart-red.svg', name: 'قلب أحمر نقي', cat: 'symbols', tags: 'heart red love قلب أحمر حب إعجاب شغف' },
    { id: 'idea', file: 'idea.svg', name: 'مصباح فكرة وإلهام', cat: 'symbols', tags: 'idea bulb light مصباح فكرة ذكاء إلهام اقتراح' },
    { id: 'thumbs-up', file: 'thumbs-up.svg', name: 'إعجاب ممتاز', cat: 'symbols', tags: 'thumbs up like approve إعجاب موافق ممتاز تم تمام' },
    { id: 'party', file: 'party.svg', name: 'احتفال ومفرقعات', cat: 'symbols', tags: 'party celebration احتفال نجاح مبروك فرح عيد' },
    { id: 'gem', file: 'gem.svg', name: 'جوهرة ألماسة نادرة', cat: 'symbols', tags: 'gem diamond جوهرة ألماس قيمة ثمين جوهرة' },
    { id: 'warning', file: 'warning.svg', name: 'تنبيه وتحذير', cat: 'symbols', tags: 'warning alert تنبيه تحذير انتباه هام خطر' }
  ];

  let currentEmojiCategory = 'all';

  window.renderEmojiGrid = function (filterQuery = '') {
    const grid = document.getElementById('emoji-picker-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const query = (filterQuery || '').trim().toLowerCase();
    const filtered = EMOJI_ITEMS.filter(item => {
      const matchCat = currentEmojiCategory === 'all' || item.cat === currentEmojiCategory;
      const matchQuery = !query || item.name.toLowerCase().includes(query) || item.tags.toLowerCase().includes(query);
      return matchCat && matchQuery;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; font-size: 0.78rem; padding: 20px 0;">لا توجد أيقونة مطابقة لهذا البحث</div>';
      return;
    }

    filtered.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-grid-item';
      btn.title = item.name;
      btn.innerHTML = `<img src="assets/icons/emojis/${item.file}" alt="${item.id}" loading="lazy">`;
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.insertEmojiIcon(item);
      };
      grid.appendChild(btn);
    });
  };

  window.toggleEmojiPicker = function (triggerBtn, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const popover = document.getElementById('emoji-picker-popover');
    if (!popover) return;

    if (popover.style.display !== 'none') {
      window.closeEmojiPicker();
      return;
    }

    // حفظ التحديد الحالي إن وجد
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedWysiwygSelectionRange = sel.getRangeAt(0).cloneRange();
    }

    currentEmojiCategory = 'all';
    document.querySelectorAll('.emoji-cat-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-cat') === 'all');
    });

    const searchInput = document.getElementById('emoji-search-input');
    if (searchInput) searchInput.value = '';

    window.renderEmojiGrid('');
    popover.style.display = 'flex';

    // تموضع اللوحة المنبثقة
    const btnRect = (triggerBtn || document.getElementById('btn-insert-emoji')).getBoundingClientRect();
    const popWidth = popover.offsetWidth || 295;
    const popHeight = popover.offsetHeight || 340;

    let left = btnRect.left + btnRect.width / 2 - popWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - popWidth - 12));

    let top = btnRect.bottom + 8;
    if (top + popHeight > window.innerHeight - 10) {
      top = btnRect.top - popHeight - 8;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    setTimeout(() => {
      if (searchInput) searchInput.focus();
    }, 50);
  };

  window.closeEmojiPicker = function () {
    const popover = document.getElementById('emoji-picker-popover');
    if (popover) {
      popover.style.display = 'none';
    }
  };

  window.selectEmojiCategory = function (category) {
    currentEmojiCategory = category;
    document.querySelectorAll('.emoji-cat-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-cat') === category);
    });
    const searchInput = document.getElementById('emoji-search-input');
    window.renderEmojiGrid(searchInput ? searchInput.value : '');
  };

  window.filterEmojis = function (query) {
    window.renderEmojiGrid(query);
  };

  window.insertEmojiIcon = function (iconItem) {
    const imgHtml = `<img src="assets/icons/emojis/${iconItem.file}" width="22" height="22" class="inline-emoji" alt="${iconItem.id}" title="${iconItem.name}">`;

    if (isWysiwygActive && previewContent) {
      if (savedWysiwygSelectionRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedWysiwygSelectionRange);
      }
      try {
        document.execCommand('insertHTML', false, imgHtml);
      } catch (_) {
        const span = document.createElement('span');
        span.innerHTML = imgHtml;
        if (savedWysiwygSelectionRange) {
          savedWysiwygSelectionRange.insertNode(span.firstChild);
        } else {
          previewContent.appendChild(span.firstChild);
        }
      }
      syncPreviewToMarkdown(true);
    } else {
      window.insertFormat('', '', imgHtml + ' ');
    }

    window.closeEmojiPicker();
    showToast(`تم إدراج أيقونة ${iconItem.name} ✓`, 'success');
  };

})();

/* ============================================================
   نظام السحب والإفلات للوحة الأدوات العائمة
   يستخدم Pointer Events API + setPointerCapture لموثوقية أعلى
   ============================================================ */
(function initFloatingDockDrag() {

  /* مسح أي موضع قديم بعد تحديث البنية (v4) */
  const DOCK_VERSION = 'v4';
  if (localStorage.getItem('vienix_dock_version') !== DOCK_VERSION) {
    localStorage.removeItem('vienix_dock_pos');
    localStorage.removeItem('vienix_classic_dock_pos');
    localStorage.setItem('vienix_dock_version', DOCK_VERSION);
  }

  function makeDraggable(wrapperId, storageKey) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    /* --- استعادة الموضع المحفوظ --- */
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved.left === 'number' && typeof saved.bottom === 'number') {
        wrapper.style.left   = saved.left   + 'px';
        wrapper.style.bottom = saved.bottom + 'px';
        wrapper.style.right  = 'auto';
        wrapper.style.top    = 'auto';
      }
    } catch (_) {}

    let startX, startY, startLeft, startBottom;
    let isDragging = false;
    let hasMoved   = false;

    function getParentRect() {
      const p = wrapper.offsetParent || wrapper.parentElement || document.body;
      return p.getBoundingClientRect();
    }

    wrapper.addEventListener('pointerdown', function (e) {
      /* تجاهُل الأزرار الداخلية */
      if (e.target.closest('button')) return;
      /* تجاهُل بزر اليمين */
      if (e.button !== 0) return;

      isDragging = true;
      hasMoved   = false;

      const rect   = wrapper.getBoundingClientRect();
      const parent = getParentRect();

      startX      = e.clientX;
      startY      = e.clientY;
      startLeft   = rect.left - parent.left;
      startBottom = parent.bottom - rect.bottom;

      /* تثبيت القيم الحالية inline لمنع أي CSS من تغييرها */
      wrapper.style.left       = startLeft   + 'px';
      wrapper.style.bottom     = startBottom + 'px';
      wrapper.style.right      = 'auto';
      wrapper.style.top        = 'auto';
      wrapper.style.transition = 'none';

      /* التقاط كل أحداث المؤشر على هذا العنصر */
      wrapper.setPointerCapture(e.pointerId);

      e.preventDefault();
    });

    wrapper.addEventListener('pointermove', function (e) {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!hasMoved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      hasMoved = true;

      const parent = getParentRect();
      const wRect  = wrapper.getBoundingClientRect();

      let newLeft   = Math.max(0, Math.min(startLeft   + dx, parent.width  - wRect.width));
      let newBottom = Math.max(0, Math.min(startBottom - dy, parent.height - wRect.height));

      wrapper.style.left   = newLeft   + 'px';
      wrapper.style.bottom = newBottom + 'px';
    });

    wrapper.addEventListener('pointerup', function (e) {
      if (!isDragging) return;
      isDragging = false;
      wrapper.style.transition = '';

      if (hasMoved) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            left:   parseFloat(wrapper.style.left),
            bottom: parseFloat(wrapper.style.bottom)
          }));
        } catch (_) {}
      }
      hasMoved = false;
    });

    wrapper.addEventListener('pointercancel', function () {
      isDragging = false;
      hasMoved   = false;
      wrapper.style.transition = '';
    });
  }

  function initDrag() {
    makeDraggable('floating-dock-wrapper',         'vienix_dock_pos');
    makeDraggable('classic-floating-dock-wrapper', 'vienix_classic_dock_pos');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDrag);
  } else {
    initDrag();
  }

})();

