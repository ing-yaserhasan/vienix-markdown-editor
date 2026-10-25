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

  // Storage key helper with fallback for seamless compatibility (IndexedDB + LocalStorage)
  function getStored(key, legacyKey) {
    if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
      const val = window.VienixIDB.getSync(key, legacyKey);
      if (val !== null) return val;
    }
    try {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
      if (legacyKey) return localStorage.getItem(legacyKey);
    } catch (e) {}
    return null;
  }

  // Settings Configuration & Defaults
  const SETTINGS_KEY = 'vienix_settings';
  const SETTINGS_DEFAULTS = {
    // Appearance
    theme: 'dark',
    comfortReadingMode: true, // وضع القراءة المريح فائق الأناقة (مفعّل افتراضياً)
    previewFont: 'system',
    previewFontSize: '16',
    editorFontSize: '15',
    accentColor: '#6366f1',
    // Editor
    wordWrap: true,
    preserveBlankLines: true,
    autoBrackets: true,
    editorFont: "'Fira Code', monospace",
    textDirection: 'rtl',
    autoSaveInterval: '5000',
    // Pronunciation Assistant (★ مساعد التدرب على نطق اللغات - معطل افتراضياً للزائر لأول مرة)
    pronunciationEnabled: false,
    pronunciationEngine: 'native',
    targetLanguage: 'auto',  // Default: Smart Auto-Detect 🤖
    speechRate: '0.8',       // 0.8× ideal for learning & clear syllable perception
    speechPitch: '1.0',
    speechVolume: '1.0',
    interactionMode: 'mixed', // mixed: 🔊 for phrase + click for individual word
    dottedUnderline: true,
    keepSpeakingOnClick: false, // Default false: clicking preview stops speech automatically
    quickLang1: 'de-AT',        // Quick language shortcut 1 in context menu
    quickLang2: 'en-US',        // Quick language shortcut 2 in context menu
    syncWordHighlight: false,   // Synchronized word-by-word highlight during phrase speech
    wordTranslationBubble: true, // Show translation bubble on word click (Hybrid 1+3)
    inlinePhraseTranslation: true,    // Scenario 1: Show 文A inline button beside each phrase
    globalBilingualTranslation: true, // Scenario 2: Show global bilingual icon in toolbar
    voiceName: '',
    // API
    googleTtsKey: '',
    groqKey: ''
  };

  var vienixSettings = {};
  window.vienixSettings = vienixSettings;
  window._activeUtterances = []; // Prevent Chromium Garbage Collection from dropping speech mid-sentence

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        vienixSettings = Object.assign({}, SETTINGS_DEFAULTS, JSON.parse(raw));
      } else {
        vienixSettings = Object.assign({}, SETTINGS_DEFAULTS);
        const existingTheme = getStored('vienix_theme', 'yaser_theme');
        if (existingTheme) {
          vienixSettings.theme = existingTheme;
        }
      }
    } catch (e) {
      vienixSettings = Object.assign({}, SETTINGS_DEFAULTS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(vienixSettings));
    } catch (e) {
      console.warn('Unable to save settings:', e);
    }
  }

  window.applySetting = function (key, value) {
    vienixSettings[key] = value;
    saveSettings();
    applySettingsToUI(key, value);
  };

  function applySettingsToUI(key, value) {
    switch (key) {
      case 'theme':
        if (value === 'auto') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          isDarkMode = prefersDark;
        } else {
          isDarkMode = value === 'dark';
        }
        try {
          localStorage.setItem('vienix_theme', isDarkMode ? 'dark' : 'light');
          localStorage.setItem('yaser_theme', isDarkMode ? 'dark' : 'light');
        } catch (e) {}
        initTheme();
        initMermaid();
        renderMarkdown();
        break;

      case 'previewFontSize':
        const prevLabel = document.getElementById('s-preview-font-size-val');
        if (prevLabel) prevLabel.textContent = value + 'px';
        if (previewContent) previewContent.style.fontSize = value + 'px';
        break;

      case 'editorFontSize':
        const edLabel = document.getElementById('s-editor-font-size-val');
        if (edLabel) edLabel.textContent = value + 'px';
        if (editor) editor.style.fontSize = value + 'px';
        break;

      case 'accentColor':
        const accLabel = document.getElementById('s-accent-color-label');
        if (accLabel) accLabel.textContent = value;
        document.documentElement.style.setProperty('--accent-color', value);
        break;

      case 'wordWrap':
        if (editor) editor.style.whiteSpace = value ? 'pre-wrap' : 'pre';
        break;

      case 'preserveBlankLines':
        const blankLinesChk = document.getElementById('s-preserve-blank-lines');
        if (blankLinesChk) blankLinesChk.checked = !!value;
        renderMarkdown();
        break;

      case 'editorFont':
        if (editor) editor.style.fontFamily = value;
        break;

      case 'textDirection':
        if (editor) editor.dir = value === 'auto' ? 'auto' : value;
        break;

      case 'comfortReadingMode':
        applyComfortReadingMode(!!value);
        break;

      case 'previewFont':
        applyPreviewFont(value);
        break;

      case 'pronunciationEnabled':
      case 'targetLanguage':
      case 'dottedUnderline':
      case 'interactionMode':
      case 'speechRate':
      case 'inlinePhraseTranslation':
      case 'globalBilingualTranslation':
        updateGlobalBilingualBtnVisibility();
        renderMarkdown();
        break;
    }
  }

  window.applyComfortReadingMode = function (enabled) {
    const isComfort = enabled !== false;
    document.body.classList.toggle('comfort-reading-mode', isComfort);
    const wrapper = document.getElementById('modern-app-wrapper');
    if (wrapper) wrapper.classList.toggle('comfort-reading-mode', isComfort);
    const prev = document.getElementById('preview-output');
    if (prev) prev.classList.toggle('comfort-reading-mode', isComfort);
  };

  window.toggleZenReadingMode = function () {
    const isZen = document.body.classList.toggle('zen-reading-mode');
    const btn = document.getElementById('btn-toggle-zen-reading');
    if (btn) {
      const enterIcon = btn.querySelector('.zen-icon-enter');
      const exitIcon = btn.querySelector('.zen-icon-exit');
      const textSpan = btn.querySelector('.zen-btn-text');
      if (enterIcon) enterIcon.style.display = isZen ? 'none' : 'inline-block';
      if (exitIcon) exitIcon.style.display = isZen ? 'inline-block' : 'none';
      if (textSpan) textSpan.textContent = isZen ? 'إنهاء التركيز' : 'وضع التركيز';
      btn.title = isZen ? 'إنهاء نمط ملء الشاشة (Esc)' : 'نمط القراءة بملء الشاشة والتركيز (Zen Mode)';
    }

    if (isZen && typeof showToast === 'function') {
      showToast('تم تفعيل نمط القراءة بملء الشاشة (Zen Mode) • انقر الزر العائم أو اضغط Esc للخروج', 'info', 2500);
    }
  };

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('zen-reading-mode')) {
      window.toggleZenReadingMode();
    }
  });

  window.applyPreviewFont = function (fontKey) {
    let fontVal = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    if (fontKey && fontKey !== 'system') {
      fontVal = fontKey;
    }
    document.documentElement.style.setProperty('--preview-body-font', fontVal);
    const prevContent = document.getElementById('preview-content');
    if (prevContent) {
      prevContent.style.setProperty('--preview-body-font', fontVal);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof window.applyComfortReadingMode === 'function') {
        window.applyComfortReadingMode(vienixSettings.comfortReadingMode !== false);
      }
      if (typeof window.applyPreviewFont === 'function') {
        window.applyPreviewFont(vienixSettings.previewFont || 'system');
      }
    });
  } else {
    if (typeof window.applyComfortReadingMode === 'function') {
      window.applyComfortReadingMode(vienixSettings.comfortReadingMode !== false);
    }
    if (typeof window.applyPreviewFont === 'function') {
      window.applyPreviewFont(vienixSettings.previewFont || 'system');
    }
  }

  function applyAllSettings() {
    if (vienixSettings.previewFontSize && previewContent) {
      previewContent.style.fontSize = vienixSettings.previewFontSize + 'px';
    }
    if (vienixSettings.editorFontSize && editor) {
      editor.style.fontSize = vienixSettings.editorFontSize + 'px';
    }
    if (vienixSettings.editorFont && editor) {
      editor.style.fontFamily = vienixSettings.editorFont;
    }
    if (vienixSettings.wordWrap !== undefined && editor) {
      editor.style.whiteSpace = vienixSettings.wordWrap ? 'pre-wrap' : 'pre';
    }
    if (vienixSettings.textDirection && editor) {
      editor.dir = vienixSettings.textDirection === 'auto' ? 'auto' : vienixSettings.textDirection;
    }
    if (vienixSettings.accentColor) {
      document.documentElement.style.setProperty('--accent-color', vienixSettings.accentColor);
    }
    if (typeof applyComfortReadingMode === 'function') {
      applyComfortReadingMode(vienixSettings.comfortReadingMode !== false);
    }
    if (typeof applyPreviewFont === 'function') {
      applyPreviewFont(vienixSettings.previewFont || 'system');
    }
    if (typeof updateGlobalBilingualBtnVisibility === 'function') {
      updateGlobalBilingualBtnVisibility();
    }
  }

  // Theme & Settings
  let isDarkMode = (getStored('vienix_theme', 'yaser_theme')) === 'dark';
  let isSyncScroll = (getStored('vienix_sync_scroll', 'yaser_sync_scroll')) !== 'false';
  let renderDebounceTimer = null;
  let isUpdatingScroll = false;

  // History Storage per Document / File (سجل حركات مستقل ومستمر لكل ملف وحجرة)
  const documentHistories = {};
  const MAX_HISTORY = 60;
  let historyDebounceTimer = null;
  let isPerformingHistory = false;
  const historyPersistTimers = {};

  // Persistent History Engine (حفظ واسترجاع سجل الحركات من IndexedDB لضمان بقائه بعد إطفاء الجهاز)
  function schedulePersistHistory(docKey = getActiveDocumentKey()) {
    if (historyPersistTimers[docKey]) {
      clearTimeout(historyPersistTimers[docKey]);
    }
    historyPersistTimers[docKey] = setTimeout(() => {
      persistDocHistory(docKey);
    }, 600);
  }

  function persistDocHistory(docKey = getActiveDocumentKey()) {
    if (historyPersistTimers[docKey]) {
      clearTimeout(historyPersistTimers[docKey]);
      delete historyPersistTimers[docKey];
    }
    if (!window.VienixIDB || typeof window.VienixIDB.set !== 'function') return;
    const history = documentHistories[docKey];
    if (!history) return;

    try {
      const dataToSave = JSON.stringify({
        undoStack: history.undoStack || [],
        redoStack: history.redoStack || [],
        updatedAt: Date.now()
      });
      window.VienixIDB.set('vienix_history_' + docKey, dataToSave);
    } catch (e) {
      console.warn('[VienixHistory] Failed to persist history for', docKey, e);
    }
  }

  function loadPersistedDocHistory(docKey) {
    try {
      let raw = null;
      if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
        raw = window.VienixIDB.getSync('vienix_history_' + docKey);
      }
      if (raw && typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.undoStack) && parsed.undoStack.length > 0) {
          return {
            undoStack: parsed.undoStack,
            redoStack: Array.isArray(parsed.redoStack) ? parsed.redoStack : []
          };
        }
      }
    } catch (e) {
      console.warn('[VienixHistory] Failed loading persisted history for', docKey, e);
    }
    return null;
  }

  // Document Scroll Positions per File / Chamber (حفظ موضع التمرير والمؤشر لكل مستند وملف)
  const documentScrollPositions = {};
  let isRestoringScroll = false;

  function getActiveDocumentKey() {
    if (activeChamber === 8 && activeExplorerFile && activeExplorerFile.fileId) {
      return 'file_' + (activeExplorerFile.folderKey || 'book') + '_' + activeExplorerFile.fileId;
    }
    return 'chamber_' + (activeChamber || 1);
  }

  function getActiveDocHistory(docKey = getActiveDocumentKey()) {
    if (!documentHistories[docKey]) {
      const persisted = loadPersistedDocHistory(docKey);
      if (persisted) {
        documentHistories[docKey] = persisted;
      } else {
        documentHistories[docKey] = {
          undoStack: [],
          redoStack: []
        };
      }
    }
    return documentHistories[docKey];
  }

  function saveCurrentDocScroll() {
    try {
      const docKey = getActiveDocumentKey();
      const activeEl = isClassicMode ? (classicEditor || editor) : editor;
      const outputEl = isClassicMode ? classicOutput : preview;
      if (!activeEl) return;
      documentScrollPositions[docKey] = {
        editorScroll: activeEl.scrollTop || 0,
        outputScroll: outputEl ? (outputEl.scrollTop || 0) : 0,
        cursorStart: activeEl.selectionStart,
        cursorEnd: activeEl.selectionEnd
      };
    } catch (e) {
      console.warn('saveCurrentDocScroll error:', e);
    }
  }

  function restoreDocScroll(docKey = getActiveDocumentKey()) {
    try {
      const saved = documentScrollPositions[docKey];
      const activeEl = isClassicMode ? (classicEditor || editor) : editor;
      const outputEl = isClassicMode ? classicOutput : preview;
      if (!activeEl) return;

      isRestoringScroll = true;
      const targetEditorScroll = saved ? (saved.editorScroll || 0) : 0;
      const targetOutputScroll = saved ? (saved.outputScroll || 0) : 0;

      // 1. التثبيت الفوري المتزامن الحاسم (Instant Jump 0ms) دون أي أنيميشن أو انزلاق
      if (activeEl) {
        try { activeEl.scrollTo({ top: targetEditorScroll, behavior: 'instant' }); } catch (e) {}
        activeEl.scrollTop = targetEditorScroll;
      }
      if (outputEl) {
        try { outputEl.scrollTo({ top: targetOutputScroll, behavior: 'instant' }); } catch (e) {}
        outputEl.scrollTop = targetOutputScroll;
      }

      if (saved && typeof saved.cursorStart === 'number') {
        try {
          if (activeEl.setSelectionRange) {
            activeEl.setSelectionRange(saved.cursorStart, saved.cursorEnd);
          }
        } catch (e) {}
        // إعادة التثبيت الفوري بعد ضبط المؤشر لمنع المتصفح من سحب الشاشة
        activeEl.scrollTop = targetEditorScroll;
      }

      // 2. تأكيد التثبيت مع إطار الرندر لضمان ثبات المعاينة بعد اكتمال الماركداون
      requestAnimationFrame(() => {
        if (activeEl) activeEl.scrollTop = targetEditorScroll;
        if (outputEl) {
          try { outputEl.scrollTo({ top: targetOutputScroll, behavior: 'instant' }); } catch (e) {}
          outputEl.scrollTop = targetOutputScroll;
        }
        setTimeout(() => { isRestoringScroll = false; }, 60);
      });
    } catch (e) {
      console.warn('restoreDocScroll error:', e);
      isRestoringScroll = false;
    }
  }

  // Mode state: Modern vs Classic
  let isClassicMode = (getStored('vienix_classic_mode', 'yaser_classic_mode')) === 'true';
  const classicEditor = document.getElementById('classic-markdown-input');
  const classicOutput = document.getElementById('classic-output');

  // Chambers System (نظام الحجرات: 7 حجرات أساسية + الحجرة الثامنة المخصصة لعرض الملفات فقط)
  const TOTAL_CHAMBERS = 8;
  window.VienixGetTotalChambers = () => TOTAL_CHAMBERS;

  // تنظيف أي حجرات قديمة غير صالحة تتجاوز 8 وحذف الترقيم العشوائي من الذاكرة
  try {
    localStorage.removeItem('vienix_total_chambers');
    localStorage.removeItem('yaser_total_chambers');
    for (let ch = 9; ch <= 100; ch++) {
      localStorage.removeItem('vienix_chamber_' + ch);
      localStorage.removeItem('yaser_chamber_' + ch);
      localStorage.removeItem('vienix_chamber_meta_' + ch);
      localStorage.removeItem('yaser_chamber_meta_' + ch);
    }
  } catch (e) {}

  // ضمان أن الحجرة ضمن النطاق الثابت (1 إلى 8)
  function ensureChamberExists(chNum) {
    chNum = parseInt(chNum, 10);
    return !isNaN(chNum) && chNum >= 1 && chNum <= TOTAL_CHAMBERS;
  }

  let activeChamber = parseInt(getStored('vienix_active_chamber', 'yaser_active_chamber') || '1', 10);
  if (isNaN(activeChamber) || activeChamber < 1 || activeChamber > TOTAL_CHAMBERS) {
    activeChamber = 1;
  }
  let lastActiveOverflowChamber = 8;

  // Initialize Application
  async function initApplication() {
    if (window.VienixIDB && typeof window.VienixIDB.openDB === 'function') {
      try {
        await window.VienixIDB.openDB();
      } catch (err) {
        console.warn('[Vienix] IDB bootstrap warning:', err);
      }
    }
    loadSettings();
    applyAllSettings();
    initTheme();
    initMermaid();
    initMarked();
    setupEventListeners();
    loadInitialContent();
    setupDraggableFloatingActions();
    setupWorkspaceResizer();
    initResponsiveMode();
    initWysiwygPreviewSystem();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApplication);
  } else {
    initApplication();
  }

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

  // تحليل صيغة الماركداون المختصرة للأسهم: ![←|120px|#2563eb](arrow:1/left?rot=64&float=35,53)
  function parseArrowMarkdown(href, altText) {
    const cleanHref = (href || '').replace(/^(?:vienix-)?arrow:\/?/i, '');
    const [pathPart, queryPart] = cleanHref.split('?');
    const [modelPart, dirPart] = (pathPart || '1/right').split('/');

    const modelId = parseInt(modelPart, 10) || 1;
    const dir = dirPart || 'right';

    let id = '';
    let rot = 0;
    let isFloating = false;
    let floatX = 0;
    let floatY = 0;
    let align = 'inline';

    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      if (params.has('id')) id = params.get('id');
      if (params.has('rot')) rot = parseInt(params.get('rot'), 10) || 0;
      if (params.has('float')) {
        isFloating = true;
        const [fx, fy] = (params.get('float') || '0,0').split(',');
        floatX = parseFloat(fx) || 0;
        floatY = parseFloat(fy) || 0;
      }
      if (params.has('align')) align = params.get('align') || 'inline';
    }

    const altParts = (altText || '').split('|');
    const rawChar = altParts[0] ? altParts[0].trim() : '';
    let size = altParts[1] ? altParts[1].trim() : '28px';
    if (size && !size.endsWith('px') && !size.endsWith('%')) size += 'px';
    let color = altParts[2] ? altParts[2].trim() : '#2563eb';

    const charMap = {
      '1': { up: '↑', down: '↓', left: '←', right: '→' },
      '2': { up: '⇑', down: '⇓', left: '⇐', right: '⇒' },
      '3': { up: '➔', down: '➔', left: '➔', right: '➔' },
      '4': { up: '➜', down: '➜', left: '➜', right: '➜' },
      '5': { up: '➛', down: '➛', left: '➛', right: '➛' },
      '6': { up: '➚', down: '➚', left: '➚', right: '➚' },
      '7': { up: '➤', down: '➤', left: '➤', right: '➤' },
      '8': { up: '⬆\uFE0E', down: '⬇\uFE0E', left: '⬅\uFE0E', right: '➡\uFE0E' },
      '9': { up: '⇧', down: '⇩', left: '⇦', right: '⇨' },
      '10': { up: '■', down: '■', left: '■', right: '■' },
      '11': { up: '□', down: '□', left: '□', right: '□' },
      '12': { up: '▢', down: '▢', left: '▢', right: '▢' },
      '13': { up: '▣', down: '▣', left: '▣', right: '▣' },
      '14': { up: '◯', down: '◯', left: '◯', right: '◯' }
    };
    const defaultChar = (charMap[modelId] && charMap[modelId][dir]) || '→';
    const char = rawChar || defaultChar;

    return {
      id,
      modelId,
      dir,
      size: size || '28px',
      color: color || '#2563eb',
      rot,
      align,
      char,
      isFloating,
      floatX,
      floatY
    };
  }

  // تحويل خصائص السهم إلى صيغة ماركداون مختصرة ومرنة شبيهة بالصور: ![←|120px|#2563eb](arrow:1/left?id=a1&rot=64&float=35,53)
  function formatArrowToMarkdown(attrs) {
    const modelId = attrs.modelId || 1;
    const dir = attrs.dir || 'right';
    const char = attrs.char || '→';
    const size = attrs.size || '28px';
    const color = attrs.color || '#2563eb';
    const rot = typeof attrs.rotation === 'number' ? attrs.rotation : (parseInt(attrs.rotation, 10) || 0);
    const align = attrs.align || 'inline';
    const isFloating = !!attrs.isFloating;
    const floatX = Math.round(attrs.floatX || 0);
    const floatY = Math.round(attrs.floatY || 0);
    const arrowId = attrs.arrowId || attrs.id || '';

    const query = [];
    if (arrowId) query.push(`id=${arrowId}`);
    if (rot !== 0) query.push(`rot=${rot}`);
    if (isFloating) query.push(`float=${floatX},${floatY}`);
    if (align && align !== 'inline') query.push(`align=${align}`);
    const queryString = query.length ? `?${query.join('&')}` : '';

    return `![${char}|${size}|${color}](arrow:${modelId}/${dir}${queryString})`;
  }

  // Initialize Marked with custom image sizing support
  function initMarked() {
    if (typeof marked !== 'undefined') {
      const renderer = new marked.Renderer();

      // دعم أبعاد ومقاسات الصور المخصصة في الماركداون: ![alt|450px](url) أو ![alt](url =450x)
      renderer.image = function (href, title, text) {
        // 1. دعم الأسهم الموجهة التفاعلية بصيغة مختصرة شبيهة بالصور
        if (href && (href.startsWith('arrow:') || href.startsWith('vienix-arrow:'))) {
          const info = parseArrowMarkdown(href, text);
          const arrowId = info.id || `arrow-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          const rotStyle = info.rot !== 0 ? ` transform: rotate(${info.rot}deg);` : '';
          const floatAttrs = info.isFloating ? ` data-is-floating="true" data-float-x="${info.floatX}" data-float-y="${info.floatY}"` : '';
          const anchorClass = info.isFloating ? 'arrow-anchor is-floating' : 'arrow-anchor';
          const anchorStyle = info.isFloating ? ' style="display: inline-block !important; position: relative !important; width: 0 !important; height: 0 !important; line-height: 0 !important; font-size: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; vertical-align: baseline !important; overflow: visible !important;"' : '';

          return `<span class="${anchorClass}" data-arrow-id="${arrowId}"${anchorStyle}><span class="vienix-arrow" data-arrow-id="${arrowId}" data-arrow-model="${info.modelId}" data-arrow-dir="${info.dir}" data-arrow-color="${info.color}" data-arrow-size="${info.size}" data-arrow-rotation="${info.rot}" data-arrow-align="${info.align}"${floatAttrs} style="font-size: ${info.size}; color: ${info.color};${rotStyle}">${info.char}</span></span>`;
        }
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

        // فحص ودعم مسارات مرفقات صور فينيكس (vienix-img://) واسترجاعها فورياً من IndexedDB
        let displaySrc = href;
        let attachmentId = '';
        if (href && (href.startsWith('vienix-img://') || href.startsWith('vienix-image://'))) {
          attachmentId = href.replace(/^vienix-(?:img|image):\/\//i, '').trim();
          const stored = window.VienixImages ? window.VienixImages.getImage(attachmentId) : null;
          if (stored) {
            displaySrc = stored;
          } else {
            // صورة احتياطية توضيحية خفيفة في حال حذف أو عدم توفر مفتاح الصورة محلياً
            displaySrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150" fill="none"><rect width="300" height="150" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 4"/><circle cx="150" cy="58" r="18" fill="#e2e8f0"/><path d="M144 54L150 62L156 54" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/><text x="150" y="100" font-family="system-ui, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">صورة غير متوفرة (${attachmentId})</text></svg>`
            );
          }
        }

        const styleAttr = width ? ` style="width: ${width}; max-width: 100%;"` : '';
        const widthAttr = width ? ` width="${width}"` : '';
        const dataAttAttr = attachmentId ? ` data-attachment-id="${attachmentId}" data-attachment-url="${href}"` : '';
        let out = `<img src="${displaySrc}" alt="${cleanText}"${widthAttr}${styleAttr}${dataAttAttr}`;
        if (title) {
          out += ` title="${title}"`;
        }
        out += '>';
        return out;
      };

      // دعم قوائم المهام التفاعلية والقابلة للتحديد (Interactive Task Lists) بدون disabled وبدون نقطة تعداد مزدوجة
      renderer.listitem = function (text, task, checked) {
        if (task) {
          const cleanText = text.replace(/<input[^>]*>/gi, '').trim();
          const checkedAttr = checked ? ' checked' : '';
          return `<li class="task-list-item"><input type="checkbox" class="task-checkbox"${checkedAttr}> <span>${cleanText}</span></li>\n`;
        }
        return `<li>${text}</li>\n`;
      };

      marked.setOptions({
        gfm: true,
        breaks: true,
        renderer: renderer
      });
    }
  }

  // ============================================================
  // تطبيق CSS classes على الجداول التي تملك data-border و data-rounded
  // ============================================================
  function applyTableStyles(container) {
    if (!container) return;
    container.querySelectorAll('table[data-border]').forEach(function (tbl) {
      const borderVal = tbl.getAttribute('data-border') || '1';
      const roundedVal = tbl.getAttribute('data-rounded') === 'true';
      tbl.classList.remove('tbl-border-0', 'tbl-border-1', 'tbl-border-2', 'tbl-border-3', 'tbl-rounded');
      tbl.classList.add('tbl-border-' + borderVal);
      if (roundedVal) tbl.classList.add('tbl-rounded');
    });
  }

  // ============================================================
  // شريط أدوات الجداول العائم الاحترافي في لوحة المعاينة
  // ============================================================
  (function setupTableToolbar() {
    let activeToolbar = null;
    let activeTable = null;

    function removeToolbar() {
      if (activeToolbar) {
        activeToolbar.remove();
        activeToolbar = null;
        activeTable = null;
      }
    }

    function buildToolbar(table) {
      removeToolbar();
      activeTable = table;

      const toolbar = document.createElement('div');
      toolbar.className = 'table-resizer-toolbar';
      toolbar.setAttribute('data-vienix-table-toolbar', '1');

      const borderVal = parseInt(table.getAttribute('data-border') || '1', 10);
      const roundedVal = table.getAttribute('data-rounded') === 'true';
      const nextBorder = (borderVal + 1) % 4;
      const borderLabels = ['0 (مخفي)', '1px خفيف', '2px وسط', '3px سميك'];

      const actions = [
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" rx="3"/></svg>',
          label: roundedVal ? 'زوايا حادة' : 'زوايا دائرية',
          title: 'تبديل زوايا الجدول',
          action: 'toggle-rounded',
          active: roundedVal
        },
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/></svg>',
          label: `إطار: ${borderLabels[nextBorder]}`,
          title: 'تغيير سماكة إطار الجدول',
          action: 'cycle-border'
        },
        { divider: true },
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
          label: 'صف فوق',
          title: 'إضافة صف جديد فوق الموضع الحالي',
          action: 'add-row-above'
        },
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
          label: 'صف تحت',
          title: 'إضافة صف جديد أسفل الجدول',
          action: 'add-row-below'
        },
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
          label: 'عمود يسار',
          title: 'إضافة عمود على اليسار',
          action: 'add-col-left'
        },
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 19l7-7-7-7"/></svg>',
          label: 'عمود يمين',
          title: 'إضافة عمود على اليمين',
          action: 'add-col-right'
        },
        { divider: true },
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>',
          label: 'محاذاة يمين',
          title: 'محاذاة الجدول لليمين',
          action: 'align-right'
        },
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
          label: 'محاذاة وسط',
          title: 'محاذاة الجدول للوسط',
          action: 'align-center'
        },
        { divider: true },
        {
          icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
          label: 'حذف الجدول',
          title: 'حذف الجدول بالكامل من المستند',
          action: 'delete-table',
          danger: true
        }
      ];

      actions.forEach(function (item) {
        if (item.divider) {
          const sep = document.createElement('div');
          sep.className = 'tbl-divider';
          toolbar.appendChild(sep);
          return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tbl-btn' + (item.active ? ' active' : '') + (item.danger ? ' btn-danger-action' : '');
        btn.title = item.title || item.label;
        btn.innerHTML = `${item.icon}<span>${item.label}</span>`;
        btn.setAttribute('data-tbl-action', item.action);
        toolbar.appendChild(btn);
      });

      toolbar.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-tbl-action]');
        if (!btn || !activeTable) return;
        e.stopPropagation();
        handleTableToolbarAction(btn.getAttribute('data-tbl-action'), activeTable);
        removeToolbar();
      });

      toolbar.addEventListener('mousedown', function (e) {
        e.stopPropagation();
      });

      return toolbar;
    }

    function handleTableToolbarAction(action, table) {
      const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
      if (!activeEl) return;

      const borderVal = parseInt(table.getAttribute('data-border') || '1', 10);
      const roundedVal = table.getAttribute('data-rounded') === 'true';

      // تحديد موضع الجدول في Markdown وتعديله
      const mdText = activeEl.value;
      // ابحث عن HTML comment الخاص بهذا الجدول في نص الـ markdown
      const tblMetaRegex = /<!--\s*vienix-tbl:border=(\d+),rounded=(true|false)\s*-->/g;

      // عد الجداول في الـ preview لمعرفة index الجدول المستهدف
      const allTables = Array.from(
        (table.closest('#preview-content') || table.closest('#classic-output') || document)
          .querySelectorAll('table[data-border]')
      );
      const tableIndex = allTables.indexOf(table);

      if (action === 'toggle-rounded' || action === 'cycle-border') {
        let matchIdx = 0;
        const newMdText = mdText.replace(tblMetaRegex, function (full, b, r) {
          if (matchIdx === tableIndex) {
            let newBorder = parseInt(b, 10);
            let newRounded = r === 'true';
            if (action === 'toggle-rounded') newRounded = !newRounded;
            if (action === 'cycle-border') newBorder = (newBorder + 1) % 4;
            matchIdx++;
            return `<!-- vienix-tbl:border=${newBorder},rounded=${newRounded} -->`;
          }
          matchIdx++;
          return full;
        });
        if (newMdText !== mdText) {
          recordHistorySnapshot(true);
          const sel = activeEl.selectionStart;
          activeEl.value = newMdText;
          try { activeEl.setSelectionRange(sel, sel); } catch (_) {}
          if (typeof isClassicMode !== 'undefined' && isClassicMode) {
            if (editor) editor.value = activeEl.value;
            if (typeof renderClassicMarkdown === 'function') renderClassicMarkdown();
          } else {
            if (classicEditor) classicEditor.value = activeEl.value;
            renderMarkdown();
          }
          recordHistorySnapshot(true);
        }
        return;
      }

      if (action === 'delete-table') {
        // حذف الجدول كاملاً من الـ markdown بما في ذلك الـ comment
        let matchIdx = 0;
        let newMdText = mdText.replace(
          /<!--\s*vienix-tbl:border=\d+,rounded=(?:true|false)\s*-->\n((?:\|[^\n]+\n)+)\n?/g,
          function (full) {
            if (matchIdx === tableIndex) { matchIdx++; return ''; }
            matchIdx++;
            return full;
          }
        );
        if (newMdText === mdText) {
          // fallback: حذف بدون comment
          matchIdx = 0;
          newMdText = mdText.replace(/((?:\|[^\n]+\n)+)\n?/g, function (full) {
            if (matchIdx === tableIndex) { matchIdx++; return ''; }
            matchIdx++;
            return full;
          });
        }
        if (newMdText !== mdText) {
          recordHistorySnapshot(true);
          activeEl.value = newMdText;
          if (typeof isClassicMode !== 'undefined' && isClassicMode) {
            if (editor) editor.value = activeEl.value;
            if (typeof renderClassicMarkdown === 'function') renderClassicMarkdown();
          } else {
            if (classicEditor) classicEditor.value = activeEl.value;
            renderMarkdown();
          }
          recordHistorySnapshot(true);
          if (typeof showToast === 'function') showToast('تم حذف الجدول ✓', 'success');
        }
        return;
      }

      // عمليات إضافة صفوف وأعمدة — إيجاد الجدول رقم tableIndex في الـ markdown
      const lines = mdText.split('\n');
      let tableStart = -1, tableEnd = -1;
      let tblCount = 0;
      let inTbl = false;

      for (let i = 0; i < lines.length; i++) {
        const isTableLine = /^\s*\|/.test(lines[i]);
        if (isTableLine) {
          if (!inTbl) {
            inTbl = true;
            if (tblCount === tableIndex) tableStart = i;
          }
          if (tblCount === tableIndex) tableEnd = i;
        } else {
          if (inTbl) {
            if (tblCount === tableIndex) break; // وجدنا الجدول المطلوب
            tblCount++;
            inTbl = false;
            tableStart = -1;
            tableEnd = -1;
          }
        }
      }
      // حالة الجدول في نهاية الملف
      if (inTbl && tblCount < tableIndex) { tableStart = -1; tableEnd = -1; }

      if (tableStart !== -1 && tableEnd !== -1) {
        const tableLines = lines.slice(tableStart, tableEnd + 1);
        // البحث عن الـ header line (أول سطر يبدأ بـ |)
        const headerLine = tableLines[0];
        const colCount = (headerLine.match(/\|/g) || []).length - 1;

        if (action === 'add-row-above' || action === 'add-row-below') {
          const newRow = '| ' + Array(colCount).fill('   ').join(' | ') + ' |';
          const mutableLines = tableLines.slice();
          if (action === 'add-row-above') {
            // أضف بعد السطر الثاني (separator)
            mutableLines.splice(2, 0, newRow);
          } else {
            mutableLines.push(newRow);
          }
          const newLines = [...lines.slice(0, tableStart), ...mutableLines, ...lines.slice(tableEnd + 1)];
          recordHistorySnapshot(true);
          activeEl.value = newLines.join('\n');
          if (typeof isClassicMode !== 'undefined' && isClassicMode) {
            if (editor) editor.value = activeEl.value;
            if (typeof renderClassicMarkdown === 'function') renderClassicMarkdown();
          } else {
            if (classicEditor) classicEditor.value = activeEl.value;
            renderMarkdown();
          }
          recordHistorySnapshot(true);
          if (typeof showToast === 'function') showToast('تم إضافة صف ✓', 'success');
        }

        if (action === 'add-col-left' || action === 'add-col-right') {
          const newTableLines = tableLines.map(function (line, lineIdx) {
            if (!line.trim().startsWith('|')) return line;
            const cells = line.split('|');
            // cells[0] فارغ قبل | الأولى، cells[last] فارغ بعد | الأخيرة
            const isSeparatorRow = lineIdx === 1; // السطر الثاني هو separator
            const newCell = isSeparatorRow ? ' :--- ' : '     ';
            if (action === 'add-col-right') {
              cells.splice(cells.length - 1, 0, newCell);
            } else {
              cells.splice(1, 0, newCell);
            }
            return cells.join('|');
          });
          const newLines = [...lines.slice(0, tableStart), ...newTableLines, ...lines.slice(tableEnd + 1)];
          recordHistorySnapshot(true);
          activeEl.value = newLines.join('\n');
          if (typeof isClassicMode !== 'undefined' && isClassicMode) {
            if (editor) editor.value = activeEl.value;
            if (typeof renderClassicMarkdown === 'function') renderClassicMarkdown();
          } else {
            if (classicEditor) classicEditor.value = activeEl.value;
            renderMarkdown();
          }
          recordHistorySnapshot(true);
          if (typeof showToast === 'function') showToast('تم إضافة عمود ✓', 'success');
        }
      }

      // محاذاة (لا تغيير في markdown — تطبيق CSS فقط)
      if (action === 'align-right' || action === 'align-center') {
        const align = action === 'align-right' ? 'right' : 'center';
        table.style.marginInlineStart = align === 'center' ? 'auto' : '0';
        table.style.marginInlineEnd = 'auto';
      }
    }

    // ربط الحدث مع لوحتَي المعاينة
    function attachTableClick(container) {
      if (!container) return;
      container.addEventListener('click', function (e) {
        const tbl = e.target.closest('table');
        if (!tbl) { removeToolbar(); return; }
        if (e.target.closest('[data-vienix-table-toolbar]')) return;
        e.stopPropagation();

        const toolbar = buildToolbar(tbl);
        // position: fixed بالنسبة للـ viewport لتجنب أي مشكلة في الـ overflow
        const tblRect = tbl.getBoundingClientRect();
        const toolbarTop = Math.max(8, tblRect.top - 50);
        toolbar.style.position = 'fixed';
        toolbar.style.top = toolbarTop + 'px';
        // محاذاة يمين الجدول مع إبقائه داخل النافذة
        const rightEdge = window.innerWidth - tblRect.right;
        toolbar.style.right = Math.max(8, rightEdge) + 'px';
        toolbar.style.left = 'auto';
        toolbar.style.zIndex = '9999';
        document.body.appendChild(toolbar);
        activeToolbar = toolbar;
      });
    }

    // إزالة الـ toolbar عند الضغط خارجه
    document.addEventListener('click', function (e) {
      if (activeToolbar && !activeToolbar.contains(e.target)) {
        removeToolbar();
      }
    });

    // انتظر اكتمال DOM
    document.addEventListener('DOMContentLoaded', function () {
      const pc = document.getElementById('preview-content');
      const co = document.getElementById('classic-output');
      attachTableClick(pc);
      attachTableClick(co);
    });
    // أو إذا كان DOM جاهزاً
    if (document.readyState !== 'loading') {
      const pc = document.getElementById('preview-content');
      const co = document.getElementById('classic-output');
      attachTableClick(pc);
      attachTableClick(co);
    }
  })();

  // مزامنة حالة خانة المهمة (Checked / Unchecked) من شاشة المعاينة مباشرة إلى نص الماركداون بالمحرر
  function toggleTaskCheckboxInEditor(taskIndex, isChecked) {
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    const val = activeEl.value;
    const taskRegex = /^(\s*[-*+]|\s*\d+\.)\s+\[([ xX])\]/gm;
    let match;
    let currentIndex = 0;
    let targetMatch = null;

    while ((match = taskRegex.exec(val)) !== null) {
      if (currentIndex === taskIndex) {
        targetMatch = match;
        break;
      }
      currentIndex++;
    }

    if (targetMatch) {
      recordHistorySnapshot(true);
      const bracketPos = targetMatch.index + targetMatch[0].indexOf('[');
      const newChar = isChecked ? 'x' : ' ';
      const newText = val.substring(0, bracketPos + 1) + newChar + val.substring(bracketPos + 2);

      const selStart = activeEl.selectionStart;
      const selEnd = activeEl.selectionEnd;
      activeEl.value = newText;
      try {
        activeEl.setSelectionRange(selStart, selEnd);
      } catch (_) {}

      if (typeof isClassicMode !== 'undefined' && isClassicMode) {
        if (editor) editor.value = activeEl.value;
        renderClassicMarkdown();
      } else {
        if (classicEditor) classicEditor.value = activeEl.value;
        renderMarkdown();
      }
      recordHistorySnapshot(true);
    }
  }

  function handleTaskCheckboxChange(e) {
    if (e.target && e.target.classList.contains('task-checkbox')) {
      const container = e.target.closest('#preview-content') || e.target.closest('#classic-output') || previewContent;
      if (!container) return;
      const allCheckboxes = Array.from(container.querySelectorAll('.task-checkbox'));
      const index = allCheckboxes.indexOf(e.target);
      if (index === -1) return;
      toggleTaskCheckboxInEditor(index, e.target.checked);
    }
  }

  if (previewContent) {
    previewContent.addEventListener('change', handleTaskCheckboxChange);
  }
  if (classicOutput) {
    classicOutput.addEventListener('change', handleTaskCheckboxChange);
  }

  // Safe localStorage & IndexedDB helper to prevent quota exceeded exceptions from interrupting app execution
  function safeSaveToStorage(key, value) {
    if (window.VienixIDB && typeof window.VienixIDB.setSync === 'function') {
      window.VienixIDB.setSync(key, value);
    }
    try {
      localStorage.setItem(key, value);
      if (window.VienixStorage && typeof window.VienixStorage.updateStatusMeterDebounced === 'function') {
        window.VienixStorage.updateStatusMeterDebounced();
      }
    } catch (e) {
      if (!window.VienixIDB || !window.VienixIDB.isReady) {
        console.warn(`تعذر حفظ البيانات في localStorage (${key}):`, e);
        if (window.VienixStorage && typeof window.VienixStorage.handleQuotaExceeded === 'function') {
          window.VienixStorage.handleQuotaExceeded(key, e);
        }
      }
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
        folder: 'book',
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
    const savedActive = getStored('vienix_active_explorer_file');
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
    // مزامنة فورية إذا كان التعديل في حجرات الملفات (8 فما فوق)
    if (chNum >= 8 && typeof syncActiveExplorerFile === 'function') {
      syncActiveExplorerFile(content);
    }
    if (typeof isExplorerOpen !== 'undefined' && isExplorerOpen && typeof renderChambersExplorerTree === 'function') {
      renderChambersExplorerTree();
    }
    if (window.VienixDrive && typeof window.VienixDrive.triggerAutoSync === 'function') {
      window.VienixDrive.triggerAutoSync();
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

  const DEFAULT_INIT_CONTENT = `# مرحباً بك في Vienix Markdown Editor ✨

محرر ماركداون عربي احترافي وفائق السرعة، يدعم الكتابة من اليمين إلى اليسار (RTL)، والمخططات التفاعلية، والتصدير المباشر بصيغ متعددة.

---

## 📊 دعم المخططات والرسوم البيانية (Mermaid Diagrams)

يدعم المحرر مخططات **Mermaid** التفاعلية مباشرة داخل النص:

### 1. مخطط تدفق العمليات (Flowchart):
\`\`\`mermaid
graph TD
    A[بداية الفكرة] --> B{هل تم التخطيط؟}
    B -- نعم --> C[كتابة المحتوى بالماركداون]
    B -- لا --> D[إعداد الأفكار والعناوين]
    D --> C
    C --> E[معاينة المخططات التفاعلية]
    E --> F[تصدير إلى PDF / Word / HTML]
    F --> G[نشر على الموقع بنجاح 🚀]
\`\`\`

### 2. مخطط تسلسل الأحداث (Sequence Diagram):
\`\`\`mermaid
sequenceDiagram
    autonumber
    المستخدم->>المحرر: كتابة نص الماركداون
    المحرر->>المعاينة: تصيير النص في الوقت الفعلي
    المحرر->>Mermaid: تحويل كود المخطط إلى رسم بياني
    المعاينة-->>المستخدم: عرض المستند كاملاً ومنسقاً
    المستخدم->>المحرر: طلب تصدير (PDF / DOCX)
    المحرر-->>المستخدم: تحميل الملف الفوري
\`\`\`

---

## ⚡ الميزات وأزرار التحكم العلوية

- 📋 **أزرار النسخ (Copy)**: نسخ كود الماركداون أو كود HTML بضغطة زر واحدة.
- 📥 **أزرار التصدير (Export)**:
  - تصدير كملف **PDF** عالي الجودة يدعم اللغة العربية والمخططات.
  - تصدير كملف **Word (DOCX)** قابل للتعديل ومنسق من اليمين لليسار.
  - تصدير كصفحة ويب مستقلة **HTML**.
  - تنزيل ملف **Markdown (.md)**.
- 🎨 **المظهر الليلي والنهاري**: تبديل سلس ومريح للعينين.
- 💾 **حفظ تلقائي (Auto-Save)**: لا تفقد أي كلمة كتبتها أبداً.

---

## 📋 جدول مقارنة وخطة العمل

| الخاصية | المحرر القديم | Vienix Markdown Editor |
| :--- | :---: | :---: |
| **دعم المخططات (Mermaid)** | ❌ غير مدعوم | ✅ مدعوم بالكامل |
| **تصدير PDF و DOCX** | ❌ غير متوفر | ✅ نقرة زر واحدة |
| **دعم العمل بدون إنترنت** | ❌ يتطلب اتصال | ✅ يعمل بدون إنترنت 100% |
| **الخطوط والتصميم** | خط قديم وبسيط | ✅ خط تجوال (Tajawal) فاخر |

---

## 💻 تجربة الأكواد البرمجية (Code Highlighting)

\`\`\`javascript
// دالة تصدير المستند
function exportDocument(format) {
    console.log(\`جاري تجهيز المستند بصيغة: \${format}...\`);
    // ميزة التصدير السريعة في Vienix Editor
    return true;
}
\`\`\`

---

## 🔊 مساعد التدرب على نطق اللغات (Pronunciation Assistant)

يمكنك التدرب على نطق الكلمات والعبارات الأجنبية مباشرة من قسم المعاينة الحية. انقر على أي كلمة مفردة لسماع نطقها، أو انقر على أيقونة 🔊 لسماع العبارة كاملة:

- **الألمانية والنمساوية (Deutsch / Österreichisch 🇦🇹):**
  - Servus! Willkommen in Wien.
  - Das Wetter ist heute wunderschön und angenehm.
  - Guten Morgen allerseits! Wie geht es Ihnen?

- **اللغة الإنجليزية (English 🇬🇧 / 🇺🇸):**
  - Practice makes perfect when learning languages.
  - Clear pronunciation and natural speech synthesis.

> 💡 **تلميح**: يمكنك تخصيص لغة التعلم المستهدفة (مثلاً الألمانية النمساوية de-AT)، وتعديل سرعة النطق إلى وضع التدرب (0.75×) لسماع مخارج الحروف بدقة، أو اختيار صوت المتحدث من نافذة **الإعدادات ⚙️**.
`;

  // Load Initial Content
  function loadInitialContent() {
    const finishInit = () => {
      if (classicEditor) classicEditor.value = editor.value;
      initHistoryWithContent(editor.value, false);
      if (isClassicMode) {
        applyUIMode();
      }
      initChambersSystem();
    };

    let saved = getChamberContent(activeChamber);
    
    // تعافي تلقائي وتنظيف أي شوائب قديمة للترجمة من النصوص المحفوظة إن وجدت
    if (saved && (saved.includes('جار استحضار') || saved.includes('جارٍ استحضار'))) {
      saved = saved
        .replace(/<br\s*\/?>\s*<br\s*\/?>\s*جارٍ?\s*استحضار\s*ترجمة\s*العبارة\s*\.\.\.?/gi, '')
        .replace(/جارٍ?\s*استحضار\s*ترجمة\s*العبارة\s*\.\.\.?/gi, '');
      setChamberContent(activeChamber, saved);
    }

    // تنظيف تلقائي فوري لأي أكواد Base64 ضخمة وتحويلها لمرفقات نظيفة في IndexedDB
    if (saved && saved.includes('data:image/') && window.VienixImages) {
      const cleaned = window.VienixImages.cleanseMarkdownImages(saved);
      if (cleaned !== saved) {
        saved = cleaned;
        setChamberContent(activeChamber, saved);
      }
    }

    // التحقق مما إذا كان التطبيق قد تم تشغيله سابقاً لدى الزائر
    const isAppInitialized = getStored('vienix_app_initialized', 'yaser_app_initialized') === 'true';

    // تحميل النموذج التوضيحي يتم حصراً للمستخدم الجديد لأول مرة فقط في الحجرة 1 إذا كانت فارغة تماماً
    if (!isAppInitialized) {
      safeSaveToStorage('vienix_app_initialized', 'true');
      safeSaveToStorage('yaser_app_initialized', 'true');
      if (activeChamber === 1 && (!saved || saved.trim().length === 0)) {
        editor.value = DEFAULT_INIT_CONTENT;
        setChamberContent(1, DEFAULT_INIT_CONTENT);
        renderMarkdown();
        finishInit();
        return;
      }
    }

    // في جميع الحالات الأخرى: محتوى الحجرة المحفوظ يعرض كما هو بالكامل، ولا يتم مسحه أو استبداله أبداً
    editor.value = saved || '';
    renderMarkdown();
    finishInit();
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
    updateActiveChamberDotState();

    if (typeof marked === 'undefined') {
      previewContent.textContent = rawText;
      return;
    }

    // Process Mermaid blocks before marked or parse with marked custom renderer
    const { processedText: textWithoutMermaid, mermaidBlocks } = extractMermaidBlocks(rawText);
    const processedText = preserveBlankLines(textWithoutMermaid);

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

    // حقن data-border و data-rounded في وسوم <table> من HTML comments قبل وضعها في DOM
    html = html.replace(/<!--\s*vienix-tbl:border=(\d+),rounded=(true|false)\s*-->\s*(<table)/gi,
      (full, border, rounded, tblTag) =>
        `<!-- vienix-tbl:border=${border},rounded=${rounded} -->${tblTag} data-border="${border}" data-rounded="${rounded}"`
    );

    previewContent.innerHTML = html;

    // تطبيق CSS classes بعد الرندر على الجداول التي تملك data-border
    applyTableStyles(previewContent);

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
    // تفعيل الأسهم الموجهة التفاعلية مع شريط الأدوات والمقابض
    setupArrowResizers(previewContent);

    // إذا كان وضع التحرير المباشر مفعلاً، نحافظ على خصائص التحرير وحماية العناصر
    if (typeof isWysiwygActive !== 'undefined' && isWysiwygActive) {
      previewContent.setAttribute('contenteditable', 'true');
      previewContent.classList.add('preview-editable');
      protectNonEditableElements();
    }

    // مساعد التدرب على النطق — معالجة النصوص الأجنبية بعد الرندر إذا كان مفعلاً
    if (typeof vienixSettings !== 'undefined' && vienixSettings.pronunciationEnabled === true) {
      processPronunciationInPreview();
    }
  }

  // المحافظة الذكية على الأسطر والفواصل الفارغة في المعاينة كما يكتبها المستخدم في المحرر دون تخريب الأكواد
  function preserveBlankLines(markdown) {
    if (!markdown || typeof markdown !== 'string') return markdown;
    if (typeof vienixSettings !== 'undefined' && vienixSettings.preserveBlankLines === false) {
      return markdown;
    }

    // 1. عزل وحماية كتل الأكواد البرمجية (Code Blocks ``` أو ~~~)
    const codeBlocks = [];
    let text = markdown.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
      codeBlocks.push(match);
      return `%%CODE_BLOCK_PRESERVE_${codeBlocks.length - 1}%%`;
    });

    // 2. عزل وحماية صيغ الرياضيات واللاتكس ($$ ... $$)
    const mathBlocks = [];
    text = text.replace(/(\$\$[\s\S]*?\$\$)/g, (match) => {
      mathBlocks.push(match);
      return `%%MATH_BLOCK_PRESERVE_${mathBlocks.length - 1}%%`;
    });

    // توحيد فواصل الأسطر وتجريد أسطر المسافات البيضاء الخالية
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/^[ \t]+$/gm, '');

    // 3. معالجة الأسطر الفارغة في بداية المستند (إذا بدأ المستند بأسطر فارغة)
    text = text.replace(/^\n+/, (match) => {
      const blankLines = [];
      for (let i = 0; i < match.length; i++) {
        blankLines.push('<p class="md-blank-line">&nbsp;</p>');
      }
      return blankLines.join('\n\n') + '\n\n';
    });

    // 4. معالجة تتابع الأسطر الفارغة بين الفقرات والعناوين والكتل:
    // في الماركداون، \n\n يمثل فاصل فقرة عادي، وكل \n إضافية تمثل ضغطة Enter مقصودة لسطر فارغ
    text = text.replace(/\n{3,}/g, (match) => {
      const extraCount = match.length - 2;
      const blankLines = [];
      for (let i = 0; i < extraCount; i++) {
        blankLines.push('<p class="md-blank-line">&nbsp;</p>');
      }
      return '\n\n' + blankLines.join('\n\n') + '\n\n';
    });

    // 5. معالجة القوائم التي يفصل بين عناصرها سطر فارغ (مثل 1. بند \n\n 2. بند أو - بند \n\n - بند):
    const listItemPattern = /^(\s*(?:[*+-]|\d+[.)])\s+.*)\n\n(\s*(?:[*+-]|\d+[.)])\s+.*)$/gm;
    let prev;
    do {
      prev = text;
      text = text.replace(listItemPattern, (match, p1, p2) => {
        return `${p1}\n\n<p class="md-blank-line">&nbsp;</p>\n\n${p2}`;
      });
    } while (text !== prev);

    // 6. استعادة كتل الرياضيات والأكواد البرمجية سليمة 100%
    text = text.replace(/%%MATH_BLOCK_PRESERVE_(\d+)%%/g, (_, i) => mathBlocks[i]);
    text = text.replace(/%%CODE_BLOCK_PRESERVE_(\d+)%%/g, (_, i) => codeBlocks[i]);

    return text;
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

    const { processedText: textWithoutMermaid, mermaidBlocks } = extractMermaidBlocks(rawText);
    const processedText = preserveBlankLines(textWithoutMermaid);
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
    if (!isSyncScroll || isUpdatingScroll || isPerformingHistory || isRestoringScroll) return;
    isUpdatingScroll = true;

    const editorScrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
    preview.scrollTop = editorScrollRatio * (preview.scrollHeight - preview.clientHeight);

    setTimeout(() => { isUpdatingScroll = false; }, 40);
  }

  function handlePreviewScroll() {
    if (!isSyncScroll || isUpdatingScroll || isPerformingHistory || isRestoringScroll) return;
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

    // Also trigger on keyup & change for maximum reliability
    editor.addEventListener('keyup', () => {
      clearTimeout(renderDebounceTimer);
      renderDebounceTimer = setTimeout(renderMarkdown, 200);
    });

    editor.addEventListener('change', () => {
      renderMarkdown();
    });

    // Save immediate snapshot on blur or enter
    editor.addEventListener('blur', () => {
      renderMarkdown();
      if (!isPerformingHistory) {
        recordHistorySnapshot(true);
        persistDocHistory(getActiveDocumentKey());
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
          persistDocHistory(getActiveDocumentKey());
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
          if (!isClassicMode || activeScroller !== 'editor' || isRestoringScroll || isPerformingHistory) return;
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
          if (!isClassicMode || activeScroller !== 'output' || isRestoringScroll || isPerformingHistory) return;
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

    // Persist current history snapshot when tab closes, reloads, or device sleeps
    const handleAppLeave = () => {
      try {
        const activeDocKey = getActiveDocumentKey();
        recordHistorySnapshot(true);
        persistDocHistory(activeDocKey);
      } catch (e) {}
    };
    window.addEventListener('beforeunload', handleAppLeave);
    window.addEventListener('pagehide', handleAppLeave);

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
        insertFormat('**', '**');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        insertFormat('*', '*');
      }
    });

    // التنقل الذكي بمفتاح Tab داخل حجرات وخلايا الجداول، أو إدراج مسافة Tab عادية
    function handleTableTabNavigation(activeEl, isShift) {
      if (!activeEl) return false;
      const val = activeEl.value;
      const pos = activeEl.selectionStart;
      const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
      const lineEndIdx = val.indexOf('\n', pos);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const line = val.substring(lineStart, lineEnd);

      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith('|') || trimmedLine.indexOf('|', 1) === -1) {
        return false;
      }

      const lines = val.split('\n');
      let currentLineIndex = 0;
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (charCount <= lineStart && lineStart <= charCount + lines[i].length) {
          currentLineIndex = i;
          break;
        }
        charCount += lines[i].length + 1;
      }

      let tableStartLine = currentLineIndex;
      while (tableStartLine > 0 && lines[tableStartLine - 1].trim().startsWith('|')) {
        tableStartLine--;
      }
      let tableEndLine = currentLineIndex;
      while (tableEndLine < lines.length - 1 && lines[tableEndLine + 1].trim().startsWith('|')) {
        tableEndLine++;
      }

      const cells = [];
      let lineOffset = 0;
      for (let i = 0; i < tableStartLine; i++) {
        lineOffset += lines[i].length + 1;
      }

      for (let i = tableStartLine; i <= tableEndLine; i++) {
        const curLine = lines[i];
        const isSep = /^\|\s*([:\s-]+\|)+$/.test(curLine.trim());
        if (!isSep) {
          const pipePositions = [];
          for (let c = 0; c < curLine.length; c++) {
            if (curLine[c] === '|') pipePositions.push(c);
          }
          for (let p = 0; p < pipePositions.length - 1; p++) {
            const colStart = pipePositions[p] + 1;
            const colEnd = pipePositions[p + 1];
            const rawContent = curLine.substring(colStart, colEnd);
            const leadingSpace = (rawContent.match(/^\s*/) || [''])[0].length;
            const trailingSpace = (rawContent.match(/\s*$/) || [''])[0].length;

            let cellSelStart = lineOffset + colStart + leadingSpace;
            let cellSelEnd = lineOffset + colEnd - trailingSpace;
            if (cellSelStart > cellSelEnd) {
              cellSelStart = lineOffset + colStart + (rawContent.length > 0 ? 1 : 0);
              cellSelEnd = cellSelStart;
            }
            cells.push({
              start: cellSelStart,
              end: cellSelEnd,
              colStart: lineOffset + colStart,
              colEnd: lineOffset + colEnd,
              lineIndex: i,
              colIndex: p
            });
          }
        }
        lineOffset += curLine.length + 1;
      }

      if (cells.length === 0) return false;

      let activeCellIdx = -1;
      for (let i = 0; i < cells.length; i++) {
        if (pos >= cells[i].colStart && pos <= cells[i].colEnd) {
          activeCellIdx = i;
          break;
        }
      }

      if (activeCellIdx === -1) {
        for (let i = 0; i < cells.length; i++) {
          if (cells[i].start >= pos) {
            activeCellIdx = i;
            break;
          }
        }
        if (activeCellIdx === -1) activeCellIdx = cells.length - 1;
      }

      if (!isShift) {
        const nextIdx = activeCellIdx + 1;
        if (nextIdx < cells.length) {
          activeEl.focus();
          activeEl.setSelectionRange(cells[nextIdx].start, cells[nextIdx].end);
          return true;
        } else {
          // إضافة صف جديد تلقائياً عند الضغط على Tab في آخر خلية بالجدول
          recordHistorySnapshot(true);
          const firstRowCells = cells.filter(c => c.lineIndex === cells[0].lineIndex);
          const colCount = Math.max(1, firstRowCells.length);
          const newRowText = '| ' + Array(colCount).fill(' ').join(' | ') + ' |\n';

          let endOffset = 0;
          for (let i = 0; i <= tableEndLine; i++) {
            endOffset += lines[i].length + 1;
          }
          if (endOffset > val.length) endOffset = val.length;

          activeEl.setRangeText(newRowText, endOffset, endOffset, 'end');
          const firstNewCell = endOffset + 2;
          activeEl.focus();
          activeEl.setSelectionRange(firstNewCell, firstNewCell);
          if (typeof renderMarkdown === 'function') renderMarkdown();
          recordHistorySnapshot(true);
          return true;
        }
      } else {
        const prevIdx = activeCellIdx - 1;
        if (prevIdx >= 0) {
          activeEl.focus();
          activeEl.setSelectionRange(cells[prevIdx].start, cells[prevIdx].end);
          return true;
        }
      }
      return true;
    }

    function handleEditorTabKey(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const activeEl = e.target;
        if (handleTableTabNavigation(activeEl, e.shiftKey)) {
          if (typeof renderMarkdown === 'function') renderMarkdown();
          return;
        }
        recordHistorySnapshot(true);
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        activeEl.setRangeText('\t', start, end, 'end');
        if (typeof renderMarkdown === 'function') renderMarkdown();
        recordHistorySnapshot(true);
      }
    }

    editor.addEventListener('keydown', handleEditorTabKey);
    if (classicEditor) {
      classicEditor.addEventListener('keydown', handleEditorTabKey);
    }

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
      const dock = document.getElementById('floating-dock-wrapper');
      const panelEditor = document.getElementById('panel-editor');
      if (dock && panelEditor && dock.parentElement !== panelEditor) {
        panelEditor.appendChild(dock);
        dock.classList.remove('in-preview-mode');
      }
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

    // 4. تطهير حاويات الأسهم التفاعلية من الأشرطة والمقابض عند الطباعة والتصدير
    clone.querySelectorAll('.arrow-resizer-wrapper').forEach((wrapper) => {
      wrapper.querySelectorAll('.arrow-resizer-toolbar, .resizer-handle, .resizer-corner-rotate-handle').forEach((el) => el.remove());
      const arrow = wrapper.querySelector('.vienix-arrow');
      if (arrow) {
        wrapper.parentNode.replaceChild(arrow, wrapper);
      } else {
        wrapper.remove();
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
    const exportText = (window.VienixImages && typeof window.VienixImages.prepareForExport === 'function')
      ? window.VienixImages.prepareForExport(text)
      : text;
    const blob = new Blob([exportText], { type: 'text/markdown;charset=utf-8' });
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

  // دالة إنشاء زر حجرة برقمها الترتيبي دائماً
  function createChamberButton(i) {
    const btn = document.createElement('button');
    btn.className = 'chamber-btn';
    btn.id = 'chamber-btn-' + i;
    btn.setAttribute('data-chamber', i);
    btn.setAttribute('type', 'button');
    btn.innerHTML = `<span class="chamber-num">${i}</span><span class="chamber-dot"></span>`;

    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openChamberContextMenu(e, i);
    });

    applyChamberButtonState(btn, i);
    return btn;
  }

  // تطبيق حالة الحجرة (فارغة / ممتلئة / نشطة)
  function applyChamberButtonState(btn, i) {
    if (!btn) return;
    const content = getChamberContent(i).trim();
    const isFilled = content.length > 0;
    const isActive = i === activeChamber;
    const title = getChamberTitle(i);

    btn.classList.toggle('active', isActive);
    btn.classList.toggle('filled', isFilled);
    btn.classList.toggle('empty', !isFilled);

    if (isActive) {
      btn.setAttribute('title', `حجرة ${i} (النشطة حالياً) • ${isFilled ? title : 'جاهزة للكتابة'}`);
    } else if (isFilled) {
      btn.setAttribute('title', `حجرة ${i} (ممتلئة) • ${title} (اضغط للتبديل إليها)`);
    } else {
      btn.setAttribute('title', `حجرة ${i} (فارغة) • اضغط للكتابة هنا دون مسح حجرة ${activeChamber}`);
    }
  }

  // تحديث حالة نقطة الحجرة النشطة فورياً أثناء الكتابة دون مسح عناصر الـ DOM
  function updateActiveChamberDotState() {
    const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
    const isFilled = (currentVal || '').trim().length > 0;
    const activeBtn = document.querySelector(`.chamber-btn[data-chamber="${activeChamber}"]`);
    if (activeBtn) {
      activeBtn.classList.toggle('filled', isFilled);
      activeBtn.classList.toggle('empty', !isFilled);
    }
  }

  // إضافة حجرة جديدة — تنتقل للحجرة 8 (حجرة المستكشف)
  window.addNewChamber = function () {
    window.switchChamber(8);
    showToast('انتقلت لحجرة المستكشف (8) — يمكنك إنشاء ملفات جديدة من المستكشف ✨', 'info', 2000);
  };

  // حذف الحجرة الأخيرة إن كانت زائدة عن 8
  window.removeLastChamber = function () {
    if (TOTAL_CHAMBERS <= MIN_CHAMBERS) {
      showToast('لا يمكن حذف الحجرات الأساسية (الحد الأدنى 8 حجرات)', 'warning', 2000);
      return;
    }
    const lastCh = TOTAL_CHAMBERS;
    const content = getChamberContent(lastCh).trim();
    if (content.length > 0) {
      if (!confirm(`الحجرة ${lastCh} تحتوي على نصوص. هل أنت متأكد من حذفها؟`)) {
        return;
      }
    }
    safeSaveToStorage('vienix_chamber_' + lastCh, '');
    safeSaveToStorage('yaser_chamber_' + lastCh, '');
    safeSaveToStorage('vienix_chamber_meta_' + lastCh, '');
    safeSaveToStorage('yaser_chamber_meta_' + lastCh, '');

    TOTAL_CHAMBERS--;
    safeSaveToStorage('vienix_total_chambers', TOTAL_CHAMBERS);
    safeSaveToStorage('yaser_total_chambers', TOTAL_CHAMBERS);

    if (activeChamber > TOTAL_CHAMBERS) {
      window.switchChamber(TOTAL_CHAMBERS);
    } else {
      updateChambersUI();
    }
    if (typeof renderChambersExplorerTree === 'function') {
      renderChambersExplorerTree();
    }
    showToast(`تم حذف الحجرة ${lastCh}`, 'info', 1500);
  };

  // قائمة الحجرات المتاحة للتنقل بالأسهم (محصورة افتراضياً بملفات المجلد الرئيسي فقط)
  function getCurrentNavigationChambers() {
    // إذا كان المستخدم قد حدد ملفاً صراحة من مجلد آخر (مثل المسودات أو الأرشيف)
    if (activeExplorerFile && activeExplorerFile.folderKey && activeExplorerFile.folderKey !== 'book' && activeChamber >= 8) {
      const folderFiles = getFolderFiles(activeExplorerFile.folderKey);
      const chList = [];
      if (Array.isArray(folderFiles) && folderFiles.length > 0) {
        folderFiles.forEach(f => {
          if (typeof f.num === 'number') chList.push(f.num);
        });
      }
      if (chList.length > 0) {
        chList.sort((a, b) => a - b);
        return chList;
      }
    }

    // افتراضياً: التنقل محصور حصراً بين ملفات المجلد الرئيسي (book)
    const mainChambers = [];
    for (let i = 1; i <= 7; i++) {
      mainChambers.push(i);
    }
    for (let i = 8; i <= TOTAL_CHAMBERS; i++) {
      const meta = getChamberMeta(i);
      const folder = meta.folder || 'book';
      if (folder === 'book') {
        const content = getChamberContent(i);
        const hasCustomTitle = meta.customTitle && meta.customTitle.trim().length > 0;
        if (i === 8 || content.trim().length > 0 || hasCustomTitle) {
          mainChambers.push(i);
        }
      }
    }
    const bookFiles = getFolderFiles('book');
    if (Array.isArray(bookFiles)) {
      bookFiles.forEach(f => {
        if (typeof f.num === 'number' && f.num >= 1 && !mainChambers.includes(f.num)) {
          mainChambers.push(f.num);
        }
      });
    }
    mainChambers.sort((a, b) => a - b);
    return mainChambers;
  }

  // البحث عن ملف المجلد المرتبط برقم الحجرة المعطى
  function findFolderFileByChamberNum(chNum) {
    chNum = parseInt(chNum, 10);
    if (isNaN(chNum)) return null;
    try {
      const preferredKey = (activeExplorerFile && activeExplorerFile.folderKey) ? activeExplorerFile.folderKey : 'book';
      const prefFiles = getFolderFiles(preferredKey);
      if (Array.isArray(prefFiles)) {
        const m = prefFiles.find(f => f.num === chNum || f.linkedChamber === chNum);
        if (m) return { folderKey: preferredKey, file: m };
      }
      const allFolders = getAppFolders();
      for (const folder of allFolders) {
        if (folder.key === preferredKey) continue;
        const files = getFolderFiles(folder.key);
        if (Array.isArray(files)) {
          const match = files.find(f => f.num === chNum || f.linkedChamber === chNum);
          if (match) {
            return { folderKey: folder.key, file: match };
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // تصحيح وتنظيف تكرار ملفات المجلد الرئيسي وترقيمها المتسلسل
  function repairAndDeduplicateBookFiles() {
    try {
      let bookFiles = getFolderFiles('book');
      if (!Array.isArray(bookFiles) || bookFiles.length === 0) return;

      // 1. إزالة الملفات المكررة التي تولدت بالخطأ بسبب التكرار
      const cleanFiles = [];
      const seenSignatures = new Set();
      const seenIds = new Set();

      bookFiles.forEach(f => {
        if (!f || !f.id) return;
        if (seenIds.has(f.id)) return;
        seenIds.add(f.id);

        const contentSig = (f.content || '').trim();
        const titleSig = (f.title || '').trim();
        const key = titleSig + '___' + (contentSig.length > 40 ? contentSig.slice(0, 40) : contentSig);
        if (contentSig.length > 0 && seenSignatures.has(key)) {
          return;
        }
        if (contentSig.length > 0) {
          seenSignatures.add(key);
        }
        cleanFiles.push(f);
      });

      // 2. إعادة ترقيم الملفات بتسلسل تصاعدي دقيق يبدأ من 8
      let curNum = 8;
      cleanFiles.forEach(f => {
        f.num = curNum;
        if (!f.title || f.title.startsWith('ملف ') || f.title.startsWith('ملف #')) {
          f.title = `ملف ${curNum}`;
        }
        curNum++;
      });

      saveFolderFiles('book', cleanFiles);

      // 3. تحديث الحجرة النشطة وبيانات ملف المستكشف إن كان محدداً والحجرة النشطة >= 8
      if (activeChamber >= 8 && activeExplorerFile && activeExplorerFile.folderKey === 'book') {
        const currentFile = cleanFiles.find(f => f.id === activeExplorerFile.fileId);
        if (currentFile) {
          activeExplorerFile.num = currentFile.num;
          activeExplorerFile.title = currentFile.title;
          if (activeChamber >= 8) {
            activeChamber = 8;
            lastActiveOverflowChamber = 8;
          }
        } else if (cleanFiles.length > 0) {
          const lastF = cleanFiles[cleanFiles.length - 1];
          activeExplorerFile = {
            folderKey: 'book',
            fileId: lastF.id,
            title: lastF.title
          };
          if (activeChamber >= 8) {
            activeChamber = 8;
            lastActiveOverflowChamber = 8;
          }
        }
        safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile));
        safeSaveToStorage('vienix_active_chamber', activeChamber);
        safeSaveToStorage('vienix_last_overflow_chamber', lastActiveOverflowChamber);
      }
    } catch (e) {
      console.warn('repairAndDeduplicateBookFiles error:', e);
    }
  }

  // تنظيف الحجرات الزائدة الفارغة وضمان أن المسودات فارغة افتراضياً
  function cleanupDraftsAndExcessChambers() {
    try {
      repairAndDeduplicateBookFiles();

      // 1. أعلى رقم ملف في المجلد الرئيسي
      const bookFiles = getFolderFiles('book');
      let maxMainChamber = 8;
      if (Array.isArray(bookFiles)) {
        bookFiles.forEach(f => {
          if (typeof f.num === 'number' && f.num > maxMainChamber) {
            maxMainChamber = f.num;
          }
        });
      }
      for (let ch = 1; ch <= TOTAL_CHAMBERS; ch++) {
        const content = getChamberContent(ch).trim();
        const meta = getChamberMeta(ch);
        if (content.length > 0 && (meta.folder === 'book' || !meta.folder) && ch > maxMainChamber) {
          maxMainChamber = ch;
        }
      }

      TOTAL_CHAMBERS = Math.max(TOTAL_CHAMBERS, maxMainChamber);
      safeSaveToStorage('vienix_total_chambers', TOTAL_CHAMBERS);
      safeSaveToStorage('yaser_total_chambers', TOTAL_CHAMBERS);

      // 2. إزالة أي ملفات فارغة في drafts وُضعت تلقائياً
      const draftFiles = getFolderFiles('drafts');
      if (Array.isArray(draftFiles) && draftFiles.length > 0) {
        const filledDrafts = draftFiles.filter(f => f.content && f.content.trim().length > 0);
        saveFolderFiles('drafts', filledDrafts);
      }

      // 3. ضبط الحجرة النشطة إن كانت تتجاوز المسموح
      if (activeChamber > TOTAL_CHAMBERS) {
        activeChamber = TOTAL_CHAMBERS;
        safeSaveToStorage('vienix_active_chamber', activeChamber);
        safeSaveToStorage('yaser_active_chamber', activeChamber);
      }
      if (lastActiveOverflowChamber > TOTAL_CHAMBERS) {
        lastActiveOverflowChamber = TOTAL_CHAMBERS;
        safeSaveToStorage('vienix_last_overflow_chamber', lastActiveOverflowChamber);
      }
    } catch (e) {
      console.warn('cleanupDraftsAndExcessChambers failed:', e);
    }
  }

  // معالج النقر على الحجرة المتقطعة الفارغة
  window.handleDashedSlotClick = function () {
    const nextCh = (lastActiveOverflowChamber || 8);
    window.switchChamber(nextCh);
  };

  // معالج سهم العودة (>) للرجوع للحجرة السابقة أو الملف السابق
  window.handleChamberNavPrev = function () {
    if (activeChamber === 8 && activeExplorerFile) {
      const folderKey = activeExplorerFile.folderKey || 'book';
      const files = getFolderFiles(folderKey);
      const curIdx = files.findIndex(f => f.id === activeExplorerFile.fileId);
      if (curIdx > 0) {
        window.handleFolderFileClick(folderKey, files[curIdx - 1].id);
        return;
      } else {
        // عند الوصول لأول ملف في المجلد، نرجع للحجرة 7
        window.switchChamber(7);
        return;
      }
    }
    if (activeChamber > 1 && activeChamber <= 7) {
      window.switchChamber(activeChamber - 1);
    }
  };

  // معالج سهم التقدم (<) للانتقال للحجرة التالية أو الملف التالي
  window.handleChamberNavNext = function () {
    if (activeChamber < 7) {
      window.switchChamber(activeChamber + 1);
      return;
    }
    if (activeChamber === 7) {
      // الانتقال من الحجرة 7 لأول ملف في المجلد الرئيسي إن وُجد
      const bookFiles = getFolderFiles('book');
      if (bookFiles && bookFiles.length > 0) {
        window.handleFolderFileClick('book', bookFiles[0].id);
        return;
      } else {
        window.switchChamber(8);
        return;
      }
    }
    if (activeChamber === 8 && activeExplorerFile) {
      const folderKey = activeExplorerFile.folderKey || 'book';
      const files = getFolderFiles(folderKey);
      const curIdx = files.findIndex(f => f.id === activeExplorerFile.fileId);
      if (curIdx >= 0 && curIdx < files.length - 1) {
        window.handleFolderFileClick(folderKey, files[curIdx + 1].id);
        return;
      }
    }
  };

  // بناء عناصر شريط الحجرات وتفعيل التفويض بالنقرة الواحدة
  function initChambersSystem() {
    const wrapper = document.getElementById('chambers-slider-wrapper');
    if (wrapper && !wrapper.dataset.listenerAttached) {
      wrapper.dataset.listenerAttached = 'true';
      wrapper.addEventListener('click', (e) => {
        const btn = e.target.closest('.chamber-btn');
        if (!btn) return;
        if (btn.id === 'chamber-dashed-slot') {
          window.handleDashedSlotClick();
          return;
        }
        const ch = parseInt(btn.getAttribute('data-chamber'), 10);
        if (!isNaN(ch) && ch >= 1 && ch <= TOTAL_CHAMBERS) {
          window.switchChamber(ch);
        }
      });
    }

    cleanupDraftsAndExcessChambers();
    updateChambersUI();
    setupChamberContextMenu();
  }

  // تحديث حالة شريط الحجرات وتطبيق قالب الحجرات المتناسق
  function updateChambersUI() {
    const listEl = document.getElementById('chambers-list');
    const navPrevBtn = document.getElementById('chamber-nav-prev');
    const overflowSlot = document.getElementById('chamber-active-overflow-slot');
    const dashedSlot = document.getElementById('chamber-dashed-slot');
    const navNextBtn = document.getElementById('chamber-nav-next');

    if (!listEl) return;

    // ══════════════════════════════════════════════════════════════
    // القالب الثابت دائماً: [1][2][3][4][5][6][7] [>] [8] [<]
    // الحجرة 8 = الحجرة المخصصة لعرض ملفات المستكشف فقط
    // ══════════════════════════════════════════════════════════════

    // 1. رندرة الحجرات 1 إلى 7 بالترتيب الصحيح
    listEl.innerHTML = '';
    for (let i = 1; i <= 7; i++) {
      const btn = createChamberButton(i);
      listEl.appendChild(btn);
    }

    // 2. سهم العودة (>) — للرجوع للحجرة السابقة
    if (navPrevBtn) {
      navPrevBtn.style.display = 'inline-flex';
      navPrevBtn.title = 'الرجوع للحجرة أو الملف السابق';
    }

    // 3. الحجرة 8: تظهر برقم الملف الفعلي فقط عندما يوجد ملف نشط فيها
    const hasActiveFileInChamber8 = (activeChamber === 8 && activeExplorerFile);
    if (overflowSlot) {
      if (hasActiveFileInChamber8) {
        overflowSlot.style.display = 'inline-flex';
        overflowSlot.innerHTML = '';
        const dynamicBtn = createChamberButton(8);
        dynamicBtn.classList.add('chamber-file-dedicated');
        // عرض رقم الملف الفعلي (8، 9، 10...) بدلاً من 8 الثابت
        const numSpan = dynamicBtn.querySelector('.chamber-num');
        if (numSpan && activeExplorerFile.num) {
          numSpan.textContent = activeExplorerFile.num;
        }
        dynamicBtn.setAttribute('title', `عارض الملفات (ملف: ${activeExplorerFile.title}) 🟢`);
        overflowSlot.appendChild(dynamicBtn);
      } else {
        overflowSlot.style.display = 'none';
        overflowSlot.innerHTML = '';
      }
    }

    // 4. عرض الحجرة المتقطعة الفارغة (dashed) عندما لا يوجد ملف نشط في الحجرة 8
    if (dashedSlot) {
      dashedSlot.style.display = hasActiveFileInChamber8 ? 'none' : 'inline-flex';
    }

    // 5. سهم التقدم (<) — للانتقال للحجرة أو الملف التالي
    if (navNextBtn) {
      navNextBtn.style.display = 'inline-flex';
      navNextBtn.title = 'الانتقال للحجرة أو الملف التالي';
    }

    updateBookChambersList();
    if (typeof isExplorerOpen !== 'undefined' && isExplorerOpen && typeof renderChambersExplorerTree === 'function') {
      renderChambersExplorerTree();
    }
  }

  // التبديل بين الحجرات بسلاسة وحفظ فوري
  window.switchChamber = function (targetChamber) {
    targetChamber = parseInt(targetChamber, 10);
    if (!ensureChamberExists(targetChamber)) return;
    if (targetChamber === activeChamber) return;

    // 0. تصفير مؤقت التسجيل وحفظ لقطة فورية للحجرة المغادرة وحفظ سجلها دائمياً قبل التبديل
    const leavingDocKey = getActiveDocumentKey();
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = null;
    }
    recordHistorySnapshot(true);
    persistDocHistory(leavingDocKey);
    saveCurrentDocScroll();

    // 1. حفظ المحتوى الحالي في الحجرة المغادرة
    const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
    setChamberContent(activeChamber, currentVal);

    // 2. تحديث الحجرة النشطة وحفظها فورياً في الذاكرة لضمان ثباتها بعد إعادة التحميل
    activeChamber = targetChamber;
    safeSaveToStorage('vienix_active_chamber', activeChamber);
    safeSaveToStorage('yaser_active_chamber', activeChamber);

    if (activeChamber >= 8) {
      lastActiveOverflowChamber = activeChamber;
      safeSaveToStorage('vienix_last_overflow_chamber', lastActiveOverflowChamber);
    }
    // إذا كانت الحجرة ضمن 1 إلى 7، نلغي الملف النشط لعدم تداخل ملفات المستكشف مع الحجرات الأساسية
    if (activeChamber <= 7) {
      activeExplorerFile = null;
      try { localStorage.removeItem('vienix_active_explorer_file'); } catch (e) {}
      if (window.VienixIDB && typeof window.VienixIDB.remove === 'function') {
        window.VienixIDB.remove('vienix_active_explorer_file');
      }
    }

    // إذا كانت الحجرة >= 8، نتحقق إن كان هناك ملف مطابق في المجلدات لمزامنته
    if (activeChamber >= 8 && typeof findFolderFileByChamberNum === 'function') {
      const matched = findFolderFileByChamberNum(activeChamber);
      if (matched && matched.file) {
        activeExplorerFile = {
          folderKey: matched.folderKey,
          fileId: matched.file.id,
          title: matched.file.title
        };
        try {
          safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile));
        } catch (e) {}
        const curChContent = getChamberContent(activeChamber);
        if ((!curChContent || curChContent.trim().length === 0) && matched.file.content) {
          setChamberContent(activeChamber, matched.file.content);
        }
        if (matched.file.title) {
          setChamberCustomTitle(activeChamber, matched.file.title);
        }
      }
    }

    // 3. جلب محتوى الحجرة الهدف وتحميله في المحرر
    let targetVal = getChamberContent(targetChamber);
    if (targetVal && targetVal.includes('data:image/') && window.VienixImages) {
      const cleaned = window.VienixImages.cleanseMarkdownImages(targetVal);
      if (cleaned !== targetVal) {
        targetVal = cleaned;
        setChamberContent(targetChamber, targetVal);
      }
    }
    editor.value = targetVal;
    if (classicEditor) classicEditor.value = targetVal;

    // استعادة فورية متزامنة لسكرول المحرر لمنع رسم الإطار عند الصفر
    const targetDocKey = getActiveDocumentKey();
    const earlySaved = documentScrollPositions[targetDocKey];
    if (earlySaved && typeof earlySaved.editorScroll === 'number') {
      editor.scrollTop = earlySaved.editorScroll;
      if (classicEditor) classicEditor.scrollTop = earlySaved.editorScroll;
    }

    // 4. استعادة لقطات التراجع للحجرة الهدف
    initHistoryWithContent(targetVal);

    // 5. التصيير
    if (isClassicMode) {
      renderClassicMarkdown();
    } else {
      renderMarkdown();
    }

    // استعادة موضع السكرول والمؤشر الخاص بالحجرة الهدف فورياً
    restoreDocScroll();

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
    const fallbackFolder = curMeta.folder || 'book';
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
          const assigned = meta.folder || 'book';
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
        const curAssigned = curMeta.folder || 'book';
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
      const saved = getStored('vienix_folder_name_overrides');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  }

  function saveFolderOverrides(overrides) {
    try {
      safeSaveToStorage('vienix_folder_name_overrides', JSON.stringify(overrides));
    } catch (e) {}
  }

  // ==========================================
  // نظام ملفات المجلدات وتكرار/نقل الحجرات (Chambers Copy & Move System)
  // ==========================================

  function getFolderFiles(folderKey) {
    try {
      const saved = getStored('vienix_folder_files_' + folderKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  function saveFolderFiles(folderKey, files) {
    try {
      safeSaveToStorage('vienix_folder_files_' + folderKey, JSON.stringify(files));
    } catch (e) {}
  }

  // الحصول على الرقم التسلسلي التصاعدي التالي لملفات المجلد (ليأتي بعد الحجرات وأعلى ملف)
  function getNextFolderFileNum(folderKey) {
    const files = getFolderFiles(folderKey);
    let maxNum = 0;
    // الحجرات 1 إلى 7 هي حجرات النظام الأساسية المخصصة للمجلد الرئيسي book
    if (folderKey === 'book') {
      maxNum = 7;
    }
    if (Array.isArray(files)) {
      files.forEach(f => {
        if (typeof f.num === 'number' && f.num > maxNum) {
          maxNum = f.num;
        }
      });
    }
    return maxNum + 1;
  }

  // إعادة ترقيم ملفات المجلد بتسلسل تصاعدي دقيق يبدأ بعد أعلى حجرة في هذا المجلد
  function resequenceFolderFiles(folderKey, files) {
    if (!files || !Array.isArray(files) || files.length === 0) return files;
    let startNum = folderKey === 'book' ? 8 : 1;
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
      setChamberContent(activeChamber, currentVal);
      updateChamberMetaStats(activeChamber, currentVal);

      // إذا كانت الحجرة النشطة الحالية فارغة تماماً، نلصق المحتوى فيها مباشرة دون الحاجة للقفز
      if ((currentVal || '').trim().length === 0) {
        setChamberContent(activeChamber, text);
        updateChamberMetaStats(activeChamber, text);
        if (editor) editor.value = text;
        if (classicEditor) classicEditor.value = text;
        if (isClassicMode) renderClassicMarkdown(); else renderMarkdown();
        initHistoryWithContent(text);
        updateChambersUI();
        if (typeof renderChambersExplorerTree === 'function') {
          renderChambersExplorerTree();
        }
        showToast(`تم لصق المحتوى في الحجرة الحالية (${activeChamber}) بنجاح! 📋✨`, 'success', 1600);
        return;
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

        window.switchChamber(targetChamber);
        if (typeof renderChambersExplorerTree === 'function') {
          renderChambersExplorerTree();
        }

        showToast(`تم لصق المحتوى في الحجرة #${targetChamber} بنجاح! 📋✨`, 'success', 1600);
        return;
      }

      // 4. الحالة الثانية: الحجرات من 1 إلى 7 كلها ممتلئة
      // إنشاء ملف جديد حقيقي برقم تسلسلي تصاعدي بعد كل الملفات والحجرات الحالية
      // مع الحفاظ الكامل على الملف رقم 8 وكافة الملفات والحجرات الأخرى دون أي مساس بها
      const targetFolderKey = (activeExplorerFile && activeExplorerFile.folderKey) ? activeExplorerFile.folderKey : 'book';
      const files = getFolderFiles(targetFolderKey);
      const nextNum = getNextFolderFileNum(targetFolderKey);

      // استخراج العنوان الذكي من أول سطر في المحتوى (مثل سلوك الملفات 1 إلى 7)
      let fileTitle = `ملف ${nextNum}`;
      const titleLines = text.trim().split('\n');
      for (let tl of titleLines) {
        tl = tl.trim();
        if (!tl) continue;
        const cleanTitle = tl.replace(/^[#\-*>]+\s*/, '').replace(/[*_~`]/g, '').trim();
        if (cleanTitle) {
          fileTitle = cleanTitle.length > 25 ? cleanTitle.substring(0, 25) + '...' : cleanTitle;
          break;
        }
      }

      const textWithoutDataUrls = text.replace(/data:image\/[^"')\s]+/g, '[صورة]');
      const trimmed = textWithoutDataUrls.trim();
      const wordsCount = trimmed ? (trimmed.match(/[\w\u0600-\u06FF]+/g) || []).length : 0;

      const fileRecord = {
        id: 'file_' + targetFolderKey + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
        num: nextNum,
        title: fileTitle,
        content: text,
        words: wordsCount,
        chars: trimmed.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        linkedChamber: null
      };

      files.push(fileRecord);
      saveFolderFiles(targetFolderKey, files);

      // نضمن فتح المجلد ليظهر الملف الجديد في الشجرة فوراً
      collapsedFolders[targetFolderKey] = false;

      // فتح وعرض الملف الجديد عبر handleFolderFileClick الموحدة برقم حجرته الحقيقي (nextNum)
      window.handleFolderFileClick(targetFolderKey, fileRecord.id);

      if (typeof renderChambersExplorerTree === 'function') {
        renderChambersExplorerTree();
      }

      showToast(`تم إنشاء "${fileTitle}" بنجاح وعرضه في الحجرة 8! 📄✨`, 'success', 1800);

    } catch (err) {
      showToast('تعذر الوصول إلى الحافظة، يرجى السماح بصلاحيات المتصفح', 'error', 2000);
    }
  };

  // تفاعل النقر على ملف داخل مجلد: عرضه في الحجرة رقم 8 المخصصة لعرض ملفات المستكشف
  window.handleFolderFileClick = function (folderKey, fileId) {
    const files = getFolderFiles(folderKey);
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    // 0. تصفير مؤقت التسجيل وحفظ لقطة فورية للمستند المغادر وحفظ سجله دائمياً قبل التبديل
    const leavingDocKey = getActiveDocumentKey();
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = null;
    }
    recordHistorySnapshot(true);
    persistDocHistory(leavingDocKey);
    saveCurrentDocScroll();

    // 1. حفظ المحتوى الحالي في الحجرة المغادرة أولاً قبل تبديل activeExplorerFile
    const currentVal = isClassicMode ? (classicEditor?.value || editor.value) : editor.value;
    if (activeChamber <= 7) {
      setChamberContent(activeChamber, currentVal);
    } else if (activeChamber === 8 && activeExplorerFile) {
      syncActiveExplorerFile(currentVal);
      safeSaveToStorage('vienix_chamber_8', currentVal);
    }

    // 2. تعيين بيانات الملف المعروض حالياً
    activeExplorerFile = {
      folderKey: folderKey,
      fileId: file.id,
      title: file.title,
      num: file.num
    };
    try {
      safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile));
    } catch (e) {}

    // 3. تحميل محتوى الملف في الحجرة 8 دائماً (الحجرة المخصصة لعرض ملفات المستكشف)
    activeChamber = 8;
    lastActiveOverflowChamber = 8;
    safeSaveToStorage('vienix_active_chamber', 8);
    safeSaveToStorage('yaser_active_chamber', 8);

    const fileContent = file.content || '';
    setChamberContent(8, fileContent);
    setChamberCustomTitle(8, file.title || ('ملف ' + (file.num || '8')));

    // 4. تحميل النص في المحرر وتحديث الواجهة
    if (editor) editor.value = fileContent;
    if (classicEditor) classicEditor.value = fileContent;

    // استعادة فورية متزامنة لسكرول المحرر لمنع رسم الإطار عند الصفر
    const targetDocKey8 = getActiveDocumentKey();
    const earlySaved8 = documentScrollPositions[targetDocKey8];
    if (earlySaved8 && typeof earlySaved8.editorScroll === 'number') {
      if (editor) editor.scrollTop = earlySaved8.editorScroll;
      if (classicEditor) classicEditor.scrollTop = earlySaved8.editorScroll;
    }

    initHistoryWithContent(fileContent);
    if (isClassicMode) renderClassicMarkdown(); else renderMarkdown();
    updateChambersUI();

    // استعادة موضع السكرول والمؤشر الخاص بالملف الهدف كما تركه المستخدم فورياً
    restoreDocScroll();

    if (typeof renderChambersExplorerTree === 'function') {
      renderChambersExplorerTree();
    }
    showToast(`تم عرض "${file.title}" في حجرة الملفات 🟢`, 'info', 1400);
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
        try { safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
        if (activeChamber >= 8) {
          setChamberCustomTitle(activeChamber, file.title);
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
        if (activeChamber >= 8) {
          setChamberContent(activeChamber, file.content);
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

      // تنظيف سجل تراجع وموضع سكرول الملف المحذوف من الذاكرة ومن IndexedDB
      try {
        const deletedKey = 'file_' + folderKey + '_' + fileId;
        delete documentHistories[deletedKey];
        delete documentScrollPositions[deletedKey];
        if (window.VienixIDB && typeof window.VienixIDB.remove === 'function') {
          window.VienixIDB.remove('vienix_history_' + deletedKey);
        }
      } catch (e) {}

      // إذا كان الملف المحذوف هو المعروض حالياً في حجرة 8، نفرغها
      if (activeExplorerFile && activeExplorerFile.folderKey === folderKey && activeExplorerFile.fileId === fileId) {
        activeExplorerFile = null;
        try { localStorage.removeItem('vienix_active_explorer_file'); } catch (err) {}
        if (activeChamber >= 8) {
          setChamberContent(activeChamber, '');
          setChamberCustomTitle(activeChamber, '');
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
        // 1. حذف ملفات المجلد من التخزين وتنظيف سجلات التراجع ومواضع السكرول
        try {
          localStorage.removeItem('vienix_folder_files_' + folderKey);
          Object.keys(documentHistories).forEach(k => {
            if (k.startsWith('file_' + folderKey + '_')) {
              delete documentHistories[k];
              if (window.VienixIDB && typeof window.VienixIDB.remove === 'function') {
                window.VienixIDB.remove('vienix_history_' + k);
              }
            }
          });
          Object.keys(documentScrollPositions).forEach(k => {
            if (k.startsWith('file_' + folderKey + '_')) {
              delete documentScrollPositions[k];
            }
          });
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
          const assigned = meta.folder || 'book';
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
      const saved = getStored('vienix_chambers_order');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length > 0) {
          // إضافة الحجرات الجديدة التي لم تكن في الترتيب المحفوظ
          for (let i = 1; i <= TOTAL_CHAMBERS; i++) {
            if (!arr.includes(i)) arr.push(i);
          }
          // إزالة الحجرات المحذوفة التي تتجاوز النطاق
          const filtered = arr.filter(n => n >= 1 && n <= TOTAL_CHAMBERS);
          if (filtered.length === TOTAL_CHAMBERS) return filtered;
        }
      }
    } catch (e) {}
    const defOrder = [];
    for (let i = 1; i <= TOTAL_CHAMBERS; i++) defOrder.push(i);
    return defOrder;
  }

  function saveChambersOrder(order) {
    try {
      safeSaveToStorage('vienix_chambers_order', JSON.stringify(order));
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
            try { safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
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
    const prevFolder = meta.folder || 'book';
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
      const prevFolder = meta.folder || 'book';
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
        try { safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
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
        try { safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
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
    const prevFolder = meta.folder || 'book';
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
    const currentFolderKey = meta.folder || 'book';

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
        try { safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (err) {}
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
      const curFolder = meta.folder || 'book';
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

    // إزالة علامة المربع (#) إن وجدت
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
        if (changed) saveFolderFiles(folder.key, folderFiles);
      });
      if (activeExplorerFile && activeExplorerFile.title && activeExplorerFile.title.includes('ملف #')) {
        activeExplorerFile.title = activeExplorerFile.title.replace(/ملف\s*#(\d+)/g, 'ملف $1');
        try { safeSaveToStorage('vienix_active_explorer_file', JSON.stringify(activeExplorerFile)); } catch (e) {}
        if (activeChamber >= 8) {
          setChamberCustomTitle(activeChamber, activeExplorerFile.title);
        }
      }
    } catch (e) {}

    let totalProjectWords = 0;
    let filledChambersCount = 0;
    const folderBuckets = {};
    foldersDef.forEach(f => { folderBuckets[f.key] = []; });

    // الحجرات الشجرية هي الحجرات الأساسية من 1 إلى 7 فقط (أي ملفات إضافية هي ملفات مجلدات وليست حجرات)
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

      let assignedFolder = meta.folder || 'book';
      if (!folderBuckets[assignedFolder]) assignedFolder = 'book';
      if (assignedFolder === 'drafts' && !isFilled && !(meta.customTitle && meta.customTitle.trim())) {
        assignedFolder = 'book';
      }

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
    if (activeNumEl) activeNumEl.textContent = activeChamber >= 8 ? (activeExplorerFile ? `المستعرض: 🟢 ملف ${activeExplorerFile.num}` : 'المستعرض: 🟢 ملف 8') : `النشطة: #${activeChamber}`;

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

    // رندرة عنصر الملف في الشجرة (الملفات 1 إلى 7 المعروضة في الحجرات 1 إلى 7)
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
          <span class="obsidian-item-num" title="ملف رقم ${item.num}">${formattedNum}</span>
          <span class="obsidian-dot ${item.isFilled ? 'filled' : 'empty'}" title="${item.isFilled ? 'محتوى مكتوب' : 'فارغ'}"></span>
          <div class="obsidian-item-title-row" id="tree-title-row-${item.num}">
            <span class="obsidian-item-title" id="tree-title-${item.num}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            ${item.isActive ? '<span class="obsidian-active-indicator" title="الملف النشط"></span>' : ''}
          </div>
          <div class="obsidian-item-actions">
            <button type="button" class="obsidian-action-btn" onclick="startTreeInlineRename(event, ${item.num})" title="إعادة تسمية الملف">
              ${editIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="openMoveFolderModal(${item.num}, event)" title="نقل لمجلد">
              ${moveIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="copyChamberFromTree(event, ${item.num})" title="نسخ المحتوى">
              ${copyIcon}
            </button>
            <button type="button" class="obsidian-action-btn" onclick="pasteToChamberFromTree(event, ${item.num})" title="لصق المحتوى للملف">
              ${pasteIcon}
            </button>
            <button type="button" class="obsidian-action-btn danger" onclick="clearChamberFromTree(event, ${item.num})" title="حذف الملف">
              ${clearIcon}
            </button>
          </div>
        </div>
      `;
    }

    // رندرة ملفات المجلد المستنسخة أو المنقولة أو المنشأة (نمط الفهرس العصري: سطر واحد مدمج بدون # وبدون أسطر ثانوية)
    function renderFolderFileHTML(file, parentFolderKey) {
      const isViewingInChamber = (activeExplorerFile && activeExplorerFile.folderKey === parentFolderKey && activeExplorerFile.fileId === file.id && activeChamber >= 8);
      const isFilled = !!(file.content && file.content.trim().length > 0);

      const editIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      const moveIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
      const copyIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      const pasteIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`;
      const clearIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

      const formattedNum = String(file.num).padStart(2, '0');

      return `
        <div class="obsidian-tree-item is-folder-file ${isViewingInChamber ? 'active' : ''}"
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
            ${isViewingInChamber ? '<span class="obsidian-active-indicator" title="قيد العرض"></span>' : ''}
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

      const applyPaste = (finalContent) => {
        setChamberContent(chNum, finalContent);
        updateChamberMetaStats(chNum);
        updateChambersUI();
        if (typeof renderChambersExplorerTree === 'function') {
          renderChambersExplorerTree();
        }
        if (chNum === activeChamber) {
          if (typeof editor !== 'undefined' && editor) editor.value = finalContent;
          if (typeof classicEditor !== 'undefined' && classicEditor) classicEditor.value = finalContent;
          if (isClassicMode) { if (typeof renderClassicMarkdown === 'function') renderClassicMarkdown(); }
          else { if (typeof renderMarkdown === 'function') renderMarkdown(); }
        }
        showToast(`تم لصق المحتوى في الحجرة ${chNum} بنجاح! 📋`, 'success', 1600);
      };

      const existing = getChamberContent(chNum).trim();
      if (existing.length > 0) {
        // الحجرة ممتلئة — نسأل المستخدم: استبدال أم إلحاق؟
        const title = getChamberTitle(chNum);
        const replace = confirm(`الحجرة ${chNum} (${title}) تحتوي على نص بالفعل.\n\n• اضغط "موافق" لاستبدال المحتوى بالكامل\n• اضغط "إلغاء" لإلحاق النص الجديد في النهاية`);
        if (replace) {
          applyPaste(text);
        } else {
          applyPaste(getChamberContent(chNum) + '\n\n' + text);
        }
      } else {
        // الحجرة فارغة — لصق مباشر
        applyPaste(text);
      }
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
      showToast(`الملف ${chNum} فارغ بالفعل! ✨`, 'info', 1400);
      return;
    }

    const title = getChamberTitle(chNum);
    const confirmMsg = `هل أنت متأكد تماماً من حذف محتوى الملف ${chNum} (${escapeHtml(title)})؟`;

    const doClear = () => {
      if (typeof detachChamberFromLinkedFiles === 'function') {
        detachChamberFromLinkedFiles(chNum);
      }

      setChamberContent(chNum, '');
      const curMeta = getChamberMeta(chNum);
      curMeta.customTitle = '';
      curMeta.folder = 'book';
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
      showToast(`تم حذف محتوى الملف ${chNum} 🗑️`, 'info', 1500);
    };

    if (typeof window.openActionConfirmModal === 'function') {
      window.openActionConfirmModal(
        '⚠️ تأكيد حذف الملف',
        `هل أنت متأكد تماماً من حذف الملف ${chNum} <strong>"${escapeHtml(title)}"</strong> وتفريغ محتواه؟`,
        'نعم، احذف الملف',
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
          const chParsed = typeof marked !== 'undefined' ? marked.parse(preserveBlankLines(chText)) : escapeHtml(chText);

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

    const history = getActiveDocHistory();
    const canUndo = history && history.undoStack && history.undoStack.length > 1;
    const canRedo = history && history.redoStack && history.redoStack.length > 0;

    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnClassicUndo) btnClassicUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
    if (btnClassicRedo) btnClassicRedo.disabled = !canRedo;
  }

  function initHistoryWithContent(text, forceReset = false, docKey = getActiveDocumentKey()) {
    const history = getActiveDocHistory(docKey);
    // إذا كان السجل موجوداً مسبقاً وغير فارغ ولم يُطلب تصفير قسري، نحافظ عليه ونحدث أزراره فقط
    if (!forceReset && history.undoStack && history.undoStack.length > 0) {
      const top = history.undoStack[history.undoStack.length - 1];
      if (top && top.value !== text && typeof text === 'string') {
        history.undoStack.push({
          value: text,
          start: (editor && editor.selectionStart) || 0,
          end: (editor && editor.selectionEnd) || 0
        });
        if (history.undoStack.length > MAX_HISTORY) {
          history.undoStack.shift();
        }
        schedulePersistHistory(docKey);
      }
      updateHistoryButtonStates();
      return;
    }
    history.undoStack.length = 0;
    history.redoStack.length = 0;
    history.undoStack.push({
      value: text || '',
      start: (editor && editor.selectionStart) || 0,
      end: (editor && editor.selectionEnd) || 0
    });
    updateHistoryButtonStates();
    if (forceReset) {
      persistDocHistory(docKey);
    } else {
      schedulePersistHistory(docKey);
    }
  }

  function recordHistorySnapshot(immediate = false) {
    if (isPerformingHistory) return;

    const docKey = getActiveDocumentKey();
    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEl) return;
    const currentVal = activeEl.value;
    const currentStart = activeEl.selectionStart;
    const currentEnd = activeEl.selectionEnd;

    const saveState = () => {
      const history = getActiveDocHistory(docKey);
      const top = history.undoStack[history.undoStack.length - 1];
      if (top && top.value === currentVal) {
        top.start = currentStart;
        top.end = currentEnd;
        return;
      }

      history.undoStack.push({
        value: currentVal,
        start: currentStart,
        end: currentEnd
      });

      if (history.undoStack.length > MAX_HISTORY) {
        history.undoStack.shift();
      }

      history.redoStack.length = 0;
      if (docKey === getActiveDocumentKey()) {
        updateHistoryButtonStates();
      }
      schedulePersistHistory(docKey);
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
    const docKey = getActiveDocumentKey();
    const history = getActiveDocHistory(docKey);
    if (!history.redoStack || history.redoStack.length === 0) {
      showToast('لا توجد خطوات تالية للإعادة', 'info', 1200);
      return;
    }

    const nextState = history.redoStack.pop();
    history.undoStack.push(nextState);

    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    const outputEl = isClassicMode ? classicOutput : preview;
    const savedEditorScroll = activeEl ? activeEl.scrollTop : 0;
    const savedOutputScroll = outputEl ? outputEl.scrollTop : 0;

    isPerformingHistory = true;
    isRestoringScroll = true;

    if (editor) editor.value = nextState.value;
    if (classicEditor) classicEditor.value = nextState.value;

    if (isClassicMode) {
      if (classicEditor) {
        try { classicEditor.focus({ preventScroll: true }); } catch (e) { classicEditor.focus(); }
        if (typeof nextState.start === 'number' && typeof nextState.end === 'number') {
          try { classicEditor.setSelectionRange(nextState.start, nextState.end); } catch (e) {}
        }
      }
      renderClassicMarkdown();
    } else {
      if (editor) {
        try { editor.focus({ preventScroll: true }); } catch (e) { editor.focus(); }
        if (typeof nextState.start === 'number' && typeof nextState.end === 'number') {
          try { editor.setSelectionRange(nextState.start, nextState.end); } catch (e) {}
        }
      }
      renderMarkdown();
    }

    // تثبيت السكرول فوراً ومنع القفز
    if (activeEl) {
      try { activeEl.scrollTo({ top: savedEditorScroll, behavior: 'instant' }); } catch (e) {}
      activeEl.scrollTop = savedEditorScroll;
    }
    if (outputEl) {
      try { outputEl.scrollTo({ top: savedOutputScroll, behavior: 'instant' }); } catch (e) {}
      outputEl.scrollTop = savedOutputScroll;
    }

    requestAnimationFrame(() => {
      if (activeEl) {
        try { activeEl.scrollTo({ top: savedEditorScroll, behavior: 'instant' }); } catch (e) {}
        activeEl.scrollTop = savedEditorScroll;
      }
      if (outputEl) {
        try { outputEl.scrollTo({ top: savedOutputScroll, behavior: 'instant' }); } catch (e) {}
        outputEl.scrollTop = savedOutputScroll;
      }
      setTimeout(() => {
        isPerformingHistory = false;
        isRestoringScroll = false;
      }, 50);
    });

    updateHistoryButtonStates();
    schedulePersistHistory(docKey);
    showToast('التالي ↻ (إعادة الخطوة)', 'info', 1000);
  };

  // 2. السابق (Undo)
  window.undoAction = function () {
    const docKey = getActiveDocumentKey();
    const history = getActiveDocHistory(docKey);
    if (!history.undoStack || history.undoStack.length <= 1) {
      showToast('لا توجد خطوات سابقة للتراجع عنها', 'info', 1200);
      return;
    }

    const currentState = history.undoStack.pop();
    history.redoStack.push(currentState);

    const prevState = history.undoStack[history.undoStack.length - 1];

    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    const outputEl = isClassicMode ? classicOutput : preview;
    const savedEditorScroll = activeEl ? activeEl.scrollTop : 0;
    const savedOutputScroll = outputEl ? outputEl.scrollTop : 0;

    isPerformingHistory = true;
    isRestoringScroll = true;

    if (editor) editor.value = prevState.value;
    if (classicEditor) classicEditor.value = prevState.value;

    if (isClassicMode) {
      if (classicEditor) {
        try { classicEditor.focus({ preventScroll: true }); } catch (e) { classicEditor.focus(); }
        if (typeof prevState.start === 'number' && typeof prevState.end === 'number') {
          try { classicEditor.setSelectionRange(prevState.start, prevState.end); } catch (e) {}
        }
      }
      renderClassicMarkdown();
    } else {
      if (editor) {
        try { editor.focus({ preventScroll: true }); } catch (e) { editor.focus(); }
        if (typeof prevState.start === 'number' && typeof prevState.end === 'number') {
          try { editor.setSelectionRange(prevState.start, prevState.end); } catch (e) {}
        }
      }
      renderMarkdown();
    }

    // تثبيت السكرول فوراً ومنع القفز
    if (activeEl) {
      try { activeEl.scrollTo({ top: savedEditorScroll, behavior: 'instant' }); } catch (e) {}
      activeEl.scrollTop = savedEditorScroll;
    }
    if (outputEl) {
      try { outputEl.scrollTo({ top: savedOutputScroll, behavior: 'instant' }); } catch (e) {}
      outputEl.scrollTop = savedOutputScroll;
    }

    requestAnimationFrame(() => {
      if (activeEl) {
        try { activeEl.scrollTo({ top: savedEditorScroll, behavior: 'instant' }); } catch (e) {}
        activeEl.scrollTop = savedEditorScroll;
      }
      if (outputEl) {
        try { outputEl.scrollTo({ top: savedOutputScroll, behavior: 'instant' }); } catch (e) {}
        outputEl.scrollTop = savedOutputScroll;
      }
      setTimeout(() => {
        isPerformingHistory = false;
        isRestoringScroll = false;
      }, 50);
    });

    updateHistoryButtonStates();
    schedulePersistHistory(docKey);
    showToast('السابق ↺ (تراجع)', 'info', 1000);
  };

  // 3. تصفير (مسح المحتوى الحالي للحجرة النشطة)
  window.clearWorkspaceContent = function () {
    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEl || !activeEl.value || activeEl.value.trim() === '') {
      return;
    }

    if (typeof detachChamberFromLinkedFiles === 'function') {
      detachChamberFromLinkedFiles(activeChamber);
    }

    // حفظ النص الحالي أولاً في undoStack حتى يتمكن المستخدم من التراجع فوراً
    recordHistorySnapshot(true);

    const docKey = getActiveDocumentKey();
    const history = getActiveDocHistory(docKey);
    history.undoStack.push({
      value: '',
      start: 0,
      end: 0
    });
    history.redoStack.length = 0;

    // تصفير موضع السكرول للمستند المفرغ
    documentScrollPositions[docKey] = { editorScroll: 0, outputScroll: 0 };

    isPerformingHistory = true;
    if (editor) editor.value = '';
    if (classicEditor) classicEditor.value = '';

    setChamberContent(activeChamber, '');

    if (isClassicMode) {
      if (classicEditor) classicEditor.focus();
      renderClassicMarkdown();
    } else {
      if (editor) editor.focus();
      renderMarkdown();
    }
    isPerformingHistory = false;

    updateHistoryButtonStates();
    updateChambersUI();
    schedulePersistHistory(docKey);
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
      let cHtml = marked.parse(preserveBlankLines(rawText));
      // حقن data-border و data-rounded في الجداول كما في renderMarkdown
      cHtml = cHtml.replace(/<!--\s*vienix-tbl:border=(\d+),rounded=(true|false)\s*-->\s*(<table)/gi,
        function (full, border, rounded, tblTag) {
          return '<!-- vienix-tbl:border=' + border + ',rounded=' + rounded + ' -->' + tblTag + ' data-border="' + border + '" data-rounded="' + rounded + '"';
        }
      );
      classicOutput.innerHTML = cHtml;
      applyTableStyles(classicOutput);
    } else {
      classicOutput.textContent = rawText;
    }
    setupImageResizers(classicOutput);
    setupArrowResizers(classicOutput);
    setChamberContent(activeChamber, rawText);
    updateActiveChamberDotState();
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
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    const val = activeEl.value;
    const selected = val.substring(start, end);

    if (selected.length > 0) {
      const replacement = prefix + selected + (suffix || '');
      activeEl.setRangeText(replacement, start, end, 'end');
      const innerStart = start + prefix.length;
      const innerEnd = innerStart + selected.length;
      activeEl.setSelectionRange(innerStart, innerEnd);
    } else {
      const replacement = prefix + (defaultText || '') + (suffix || '');
      if (defaultText) {
        activeEl.setRangeText(replacement, start, end, 'select');
      } else {
        activeEl.setRangeText(replacement, start, end, 'end');
        const midPos = start + prefix.length;
        activeEl.setSelectionRange(midPos, midPos);
      }
    }

    activeEl.focus();
    if (typeof isClassicMode !== 'undefined' && isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }
    recordHistorySnapshot(true);
  };

  window.insertHeading = function (level) {
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const hashes = '#'.repeat(level) + ' ';
    const start = activeEl.selectionStart;
    const val = activeEl.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const effectiveLineEnd = lineEnd === -1 ? val.length : lineEnd;
    const lineText = val.substring(lineStart, effectiveLineEnd);

    const match = lineText.match(/^(#{1,6}\s*)/);
    if (match) {
      const matchLen = match[0].length;
      activeEl.setRangeText(hashes, lineStart, lineStart + matchLen, 'end');
      const diff = hashes.length - matchLen;
      const newPos = Math.max(lineStart + hashes.length, start + diff);
      activeEl.setSelectionRange(newPos, newPos);
    } else {
      activeEl.setRangeText(hashes, lineStart, lineStart, 'end');
      const newPos = start + hashes.length;
      activeEl.setSelectionRange(newPos, newPos);
    }

    activeEl.focus();
    if (typeof isClassicMode !== 'undefined' && isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }
    recordHistorySnapshot(true);
  };

  window.insertList = function (ordered) {
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    const val = activeEl.value;

    if (start !== end) {
      const selected = val.substring(start, end);
      const lines = selected.split('\n');
      const formatted = lines.map((line, idx) => {
        const bullet = ordered ? `${idx + 1}. ` : '- ';
        return line.trim().length > 0 ? `${bullet}${line}` : line;
      }).join('\n');
      activeEl.setRangeText(formatted, start, end, 'select');
    } else {
      const prevChar = start > 0 ? val[start - 1] : '\n';
      const bullet = ordered ? '1. ' : '- ';
      const prefix = prevChar === '\n' ? bullet : `\n${bullet}`;
      activeEl.setRangeText(prefix, start, end, 'end');
      const newPos = start + prefix.length;
      activeEl.setSelectionRange(newPos, newPos);
    }

    activeEl.focus();
    if (typeof isClassicMode !== 'undefined' && isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }
    recordHistorySnapshot(true);
  };

  window.insertTask = function () {
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    const val = activeEl.value;

    if (start !== end) {
      const selected = val.substring(start, end);
      const lines = selected.split('\n');
      const formatted = lines.map(line => line.trim().length > 0 ? `- [ ] ${line}` : line).join('\n');
      activeEl.setRangeText(formatted, start, end, 'select');
    } else {
      const prevChar = start > 0 ? val[start - 1] : '\n';
      const prefix = prevChar === '\n' ? '- [ ] ' : '\n- [ ] ';
      activeEl.setRangeText(prefix, start, end, 'end');
      const newPos = start + prefix.length;
      activeEl.setSelectionRange(newPos, newPos);
    }

    activeEl.focus();
    if (typeof isClassicMode !== 'undefined' && isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }
    recordHistorySnapshot(true);
  };

  window.insertQuote = function () {
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    const val = activeEl.value;

    if (start !== end) {
      const selected = val.substring(start, end);
      const lines = selected.split('\n');
      const quoted = lines.map(line => line.startsWith('> ') ? line : `> ${line}`).join('\n');
      activeEl.setRangeText(quoted, start, end, 'select');
    } else {
      const prevChar = start > 0 ? val[start - 1] : '\n';
      const prefix = prevChar === '\n' ? '> ' : '\n> ';
      activeEl.setRangeText(prefix, start, end, 'end');
      const newPos = start + prefix.length;
      activeEl.setSelectionRange(newPos, newPos);
    }

    activeEl.focus();
    if (typeof isClassicMode !== 'undefined' && isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }
    recordHistorySnapshot(true);
  };

  // فتح نافذة إدراج جدول احترافي ومخصص بعدد أعمدة وصفوف محدد
  window.insertTable = function () {
    const modal = document.getElementById('insert-table-modal');
    if (modal) {
      modal.style.display = 'flex';
      const colsInput = document.getElementById('table-cols-input');
      if (colsInput) {
        setTimeout(() => {
          colsInput.focus();
          colsInput.select();
        }, 50);
      }
    } else {
      const colsStr = prompt('كم عدد الأعمدة المطلوبة؟', '3');
      if (!colsStr) return;
      const rowsStr = prompt('كم عدد الصفوف المطلوبة؟', '3');
      if (!rowsStr) return;
      window.generateAndInsertMarkdownTable(parseInt(colsStr, 10) || 3, parseInt(rowsStr, 10) || 3);
    }
  };

  window.closeInsertTableModal = function (e) {
    if (e && e.target && e.target !== e.currentTarget && !e.target.classList.contains('diff-modal-close')) {
      return;
    }
    const modal = document.getElementById('insert-table-modal');
    if (modal) modal.style.display = 'none';
  };

  window.confirmInsertTable = function () {
    const colsInput = document.getElementById('table-cols-input');
    const rowsInput = document.getElementById('table-rows-input');
    const borderInput = document.getElementById('table-border-input');
    const roundedInput = document.getElementById('table-rounded-input');
    const cols = Math.max(1, Math.min(20, parseInt(colsInput ? colsInput.value : '3', 10) || 3));
    const rows = Math.max(1, Math.min(50, parseInt(rowsInput ? rowsInput.value : '3', 10) || 3));
    const borderRaw = borderInput ? parseInt(borderInput.value, 10) : 1;
    const border = isNaN(borderRaw) ? 1 : borderRaw;
    const rounded = roundedInput ? roundedInput.checked : true;

    const modal = document.getElementById('insert-table-modal');
    if (modal) modal.style.display = 'none';

    window.generateAndInsertMarkdownTable(cols, rows, border, rounded);
  };

  window.generateAndInsertMarkdownTable = function (cols, rows, border, rounded) {
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    // القيم الافتراضية
    if (border === undefined || border === null) border = 1;
    if (rounded === undefined || rounded === null) rounded = true;

    recordHistorySnapshot(true);
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    const val = activeEl.value;

    let prefix = '';
    if (start > 0) {
      if (val[start - 1] !== '\n') {
        prefix = '\n\n';
      } else if (start > 1 && val[start - 2] !== '\n') {
        prefix = '\n';
      }
    }

    const headers = [];
    const separators = [];
    for (let c = 1; c <= cols; c++) {
      headers.push(`العمود ${c}`);
      separators.push(':---');
    }

    // تضمين إعدادات الإطار والزوايا كـ HTML comment محمي قبل الجدول
    const tblMeta = `<!-- vienix-tbl:border=${border},rounded=${rounded} -->\n`;
    let tableMarkdown = `${prefix}${tblMeta}| ${headers.join(' | ')} |\n| ${separators.join(' | ')} |\n`;

    let cellCounter = 1;
    for (let r = 1; r <= rows; r++) {
      const rowCells = [];
      for (let c = 1; c <= cols; c++) {
        rowCells.push(cellCounter++);
      }
      tableMarkdown += `| ${rowCells.join(' | ')} |\n`;
    }
    tableMarkdown += '\n';

    activeEl.setRangeText(tableMarkdown, start, end, 'end');

    const firstCellText = 'العمود 1';
    const firstCellStart = start + prefix.length + 2;
    const firstCellEnd = firstCellStart + firstCellText.length;
    activeEl.focus();
    activeEl.setSelectionRange(firstCellStart, firstCellEnd);

    if (typeof isClassicMode !== 'undefined' && isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }
    recordHistorySnapshot(true);
    showToast(`تم إدراج جدول بنجاح (${cols} أعمدة × ${rows} صفوف) ✓`, 'success');
  };

  window.insertLink = function () {
    window.insertFormat('[', '](https://example.com)', 'عنوان الرابط');
  };

  // إدراج صورة مدمجة ونظيفة عبر منظومة VienixImages في موضع المؤشر بالمحرر
  window.insertImageIntoEditor = function (dataUrl, altText = 'صورة') {
    const activeEl = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const start = typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : activeEl.value.length;
    const end = typeof activeEl.selectionEnd === 'number' ? activeEl.selectionEnd : activeEl.value.length;
    const val = activeEl.value;

    let imgTarget = dataUrl;
    if (dataUrl && dataUrl.startsWith('data:image/') && window.VienixImages) {
      const imgId = window.VienixImages.saveImage(dataUrl);
      if (imgId) {
        imgTarget = `vienix-img://${imgId}`;
      }
    }

    const imgMarkdown = `\n![${altText}](${imgTarget})\n\n`;
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
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    const val = activeEl.value;

    let prefix = '';
    if (start > 0) {
      if (val[start - 1] !== '\n') {
        prefix = '\n\n';
      } else if (start > 1 && val[start - 2] !== '\n') {
        prefix = '\n';
      }
    }
    const hrText = `${prefix}---\n\n`;
    activeEl.setRangeText(hrText, start, end, 'end');
    const newPos = start + hrText.length;
    activeEl.setSelectionRange(newPos, newPos);

    activeEl.focus();
    if (typeof isClassicMode !== 'undefined' && isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }
    recordHistorySnapshot(true);
  };

  window.insertCodeBlock = function () {
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : editor;
    if (!activeEl) return;

    recordHistorySnapshot(true);
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    const val = activeEl.value;
    const selected = val.substring(start, end);

    let prefix = '';
    if (start > 0 && val[start - 1] !== '\n') {
      prefix = '\n';
    }

    if (selected.length > 0) {
      const codeBlock = `${prefix}\`\`\`javascript\n${selected}\n\`\`\`\n`;
      activeEl.setRangeText(codeBlock, start, end, 'select');
    } else {
      const codeBlock = `${prefix}\`\`\`javascript\n\n\`\`\`\n`;
      activeEl.setRangeText(codeBlock, start, end, 'end');
      const insidePos = start + prefix.length + '```javascript\n'.length;
      activeEl.setSelectionRange(insidePos, insidePos);
    }

    activeEl.focus();
    if (typeof isClassicMode !== 'undefined' && isClassicMode) {
      if (editor) editor.value = activeEl.value;
      renderClassicMarkdown();
    } else {
      if (classicEditor) classicEditor.value = activeEl.value;
      renderMarkdown();
    }
    recordHistorySnapshot(true);
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
      const applyData = (data) => {
        recordHistorySnapshot(true);
        editor.value = data;
        setChamberContent(activeChamber, data);
        renderMarkdown();
        recordHistorySnapshot(true);
        showToast('تمت استعادة النموذج التجريبي الافتراضي ✨', 'info');
      };

      fetch('initcontent.md')
        .then((res) => {
          if (!res.ok) throw new Error('Network error');
          return res.text();
        })
        .then((data) => {
          applyData(data);
        })
        .catch(() => {
          applyData(DEFAULT_INIT_CONTENT);
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

    const images = container.querySelectorAll('img');

    images.forEach((img) => {
      // استثناء مخططات mermaid وأزرار التكبير فقط
      if (img.closest('.mermaid') || img.closest('.diagram-zoom-controls')) {
        return;
      }
      if (img.parentElement && img.parentElement.classList.contains('image-resizer-wrapper')) {
        return;
      }

      const isEmojiOrSticker =
        img.classList.contains('inline-emoji') ||
        (img.getAttribute('src') || '').includes('assets/icons/emojis/') ||
        (img.getAttribute('src') || '').includes('assets/icons/twemoji/');

      const originalWidth = img.getAttribute('width') || (img.style.width ? img.style.width : (isEmojiOrSticker ? '28px' : ''));
      const wrapper = document.createElement('div');
      wrapper.className = isEmojiOrSticker ? 'image-resizer-wrapper is-emoji-wrapper' : 'image-resizer-wrapper';
      wrapper.setAttribute('data-align', isEmojiOrSticker ? 'inline' : 'center');

      if (originalWidth) {
        wrapper.style.width = originalWidth.endsWith('%') || originalWidth.endsWith('px') ? originalWidth : `${originalWidth}px`;
      }

      // Quick Floating Toolbar
      const toolbar = document.createElement('div');
      toolbar.className = 'image-resizer-toolbar';
      toolbar.setAttribute('contenteditable', 'false');

      if (isEmojiOrSticker) {
        toolbar.innerHTML = `
          <button type="button" class="resizer-btn" data-preset="24px" title="أيقونة نصية (24px)">24px</button>
          <button type="button" class="resizer-btn" data-preset="48px" title="ستيكر متوسط (48px)">48px</button>
          <button type="button" class="resizer-btn" data-preset="80px" title="ستيكر كبير بارز (80px)">80px</button>
          <span class="resizer-divider"></span>
          <button type="button" class="resizer-btn" data-preset="25%" title="25% من عرض السطر">25%</button>
          <button type="button" class="resizer-btn" data-preset="50%" title="50% من عرض السطر">50%</button>
          <button type="button" class="resizer-btn" data-preset="100%" title="100% عرض كامل">100%</button>
          <span class="resizer-divider"></span>
          <!-- محاذاة -->
          <button type="button" class="resizer-btn active" data-align="inline" title="محاذاة مع النص (Inline)">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="14" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
          </button>
          <button type="button" class="resizer-btn" data-align="right" title="محاذاة لليمين">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="12" x2="9" y2="12"></line><line x1="21" y1="18" x2="5" y2="18"></line></svg>
          </button>
          <button type="button" class="resizer-btn" data-align="center" title="توسيط مستقل">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="6"></line><line x1="21" y1="12" x2="3" y2="12"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>
          </button>
          <button type="button" class="resizer-btn" data-align="left" title="محاذاة لليسار">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="15" y1="12" x2="3" y2="12"></line><line x1="19" y1="18" x2="3" y2="18"></line></svg>
          </button>
          <span class="resizer-divider"></span>
          <!-- ميزة التحريك الحر فوق العناصر (Free Floating Move) -->
          <button type="button" class="resizer-btn btn-float-toggle" data-action="toggle-float" title="تحريك حر فوق العناصر (انقر ثم اسحب الإيموجي بالماوس في أي مكان فوق النص)">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>
            <span>حر</span>
          </button>
          <!-- ميزات التدوير (Rotation) -->
          <button type="button" class="resizer-btn btn-rotate-ccw" data-action="rotate-ccw" title="تدوير 90° عكس عقارب الساعة">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
          </button>
          <button type="button" class="resizer-btn btn-rotate-cw" data-action="rotate-cw" title="تدوير 90° مع عقارب الساعة">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
          </button>
          <span class="resizer-divider"></span>
          <span class="resizer-size-badge"></span>
        `;
      } else {
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
          <!-- ميزة التحريك الحر فوق العناصر (Free Floating Move) -->
          <button type="button" class="resizer-btn btn-float-toggle" data-action="toggle-float" title="تحريك حر فوق العناصر (انقر ثم اسحب الصورة بالماوس أو اللمس في أي مكان فوق النص)">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>
            <span>حر</span>
          </button>
          <!-- ميزات التدوير (Rotation) -->
          <button type="button" class="resizer-btn btn-rotate-ccw" data-action="rotate-ccw" title="تدوير 90° عكس عقارب الساعة">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
          </button>
          <button type="button" class="resizer-btn btn-rotate-cw" data-action="rotate-cw" title="تدوير 90° مع عقارب الساعة">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
          </button>
          <span class="resizer-divider"></span>
          <span class="resizer-size-badge"></span>
        `;
      }

      // Handles (يشمل مقبض التدوير بجانب الزاوية لتدوير يدوي حر)
      const handlesHtml = `
        <div class="resizer-corner-rotate-handle" title="مقبض التدوير اليدوي: اسحب للتدوير والالتفاف الحر بأي زاوية">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
        </div>
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
      let currentRotation = parseInt(wrapper.getAttribute('data-rotation') || '0', 10);

      // دالة التموضع الذكي لشريط الأدوات لمنع خروجه أو اقتطاعه عند الخط الفاصل بين المحرر والمعاينة
      const clampToolbar = () => {
        if (!wrapper.classList.contains('active')) return;
        const previewContainer = document.getElementById('preview-output') || document.getElementById('panel-preview') || document.body;
        const containerRect = previewContainer.getBoundingClientRect();

        // إعادة التعيين للحساب بدقة
        toolbar.style.left = '50%';
        toolbar.style.transform = 'translateX(-50%)';

        const minPadding = 8;
        if (window.innerWidth <= 768) {
          const maxAvailWidth = Math.max(200, Math.min(window.innerWidth - 16, containerRect.width - (minPadding * 2)));
          toolbar.style.maxWidth = `${maxAvailWidth}px`;
        } else {
          toolbar.style.maxWidth = '';
        }

        const tbRect = toolbar.getBoundingClientRect();

        // فحص وحساب الإزاحة الأفقية لضمان بقاء الشريط كاملاً داخل الحاوية والشاشة
        let shiftX = 0;
        if (tbRect.left < containerRect.left + minPadding) {
          shiftX = Math.round((containerRect.left + minPadding) - tbRect.left);
        } else if (tbRect.right > containerRect.right - minPadding) {
          shiftX = -Math.round(tbRect.right - (containerRect.right - minPadding));
        }

        if (tbRect.left + shiftX < containerRect.left + minPadding) {
          shiftX = Math.round((containerRect.left + minPadding) - tbRect.left);
        } else if (tbRect.right + shiftX > containerRect.right - minPadding) {
          shiftX = -Math.round(tbRect.right - (containerRect.right - minPadding));
        }

        toolbar.style.transform = shiftX !== 0 ? `translateX(calc(-50% + ${shiftX}px))` : 'translateX(-50%)';

        // فحص الطرف العلوي (إذا كان العنصر في أعلى الصفحة، تظهر الفقاعة بالأسفل لتظل مرئية بالكامل)
        if (tbRect.top < containerRect.top + 8) {
          toolbar.style.bottom = 'auto';
          toolbar.style.top = 'calc(100% + 8px)';
        } else {
          toolbar.style.bottom = 'calc(100% + 8px)';
          toolbar.style.top = 'auto';
        }
      };

      const updateBadge = () => {
        const currentW = Math.round(wrapper.getBoundingClientRect().width);
        const parentW = wrapper.parentElement ? wrapper.parentElement.clientWidth : 800;
        const pct = Math.round((currentW / (parentW || 1)) * 100);
        const rotStr = currentRotation !== 0 ? ` • ${currentRotation}°` : '';
        sizeBadge.textContent = `${currentW}px (${pct}%)${rotStr}`;
        setTimeout(clampToolbar, 10);
      };

      setTimeout(updateBadge, 50);

      // Presets
      toolbar.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const preset = btn.getAttribute('data-preset');
          wrapper.style.width = preset;
          if (preset.endsWith('%')) {
            img.style.width = preset;
            img.setAttribute('width', preset);
          } else {
            const cleanNum = preset.replace('px', '');
            img.style.width = `${cleanNum}px`;
            img.setAttribute('width', cleanNum);
          }
          img.style.height = 'auto';
          updateBadge();
          updateImageWidthInMarkdown(img.getAttribute('data-attachment-url') || img.getAttribute('src'), preset);
          if (typeof isWysiwygActive !== 'undefined' && isWysiwygActive) {
            syncPreviewToMarkdown(true);
          }
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
          if (typeof isWysiwygActive !== 'undefined' && isWysiwygActive) {
            syncPreviewToMarkdown(true);
          }
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

      // 1. ميزة التحريك الحر فوق العناصر (Free Float Dragging)
      let isFloatingMode = false;
      let floatOffsetX = 0;
      let floatOffsetY = 0;

      const floatBtn = toolbar.querySelector('.btn-float-toggle');
      if (floatBtn) {
        floatBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          isFloatingMode = !isFloatingMode;
          wrapper.classList.toggle('is-floating', isFloatingMode);
          floatBtn.classList.toggle('active-tool', isFloatingMode);
          const entityName = isEmojiOrSticker ? 'الإيموجي' : 'الصورة';
          if (isFloatingMode) {
            showToast(`تم تفعيل التحريك الحر ✥ — اسحب ${entityName} بالماوس أو اللمس في أي مكان فوق العناصر`, 'info', 2500);
          } else {
            wrapper.style.left = '0px';
            wrapper.style.top = '0px';
            floatOffsetX = 0;
            floatOffsetY = 0;
            showToast(`تم إرجاع ${entityName} للمحاذاة المنسابة مع النص ✓`, 'info', 2000);
          }
          updateBadge();
        });
      }

      // سحب الصورة أو الإيموجي بالماوس واللمس عندما يكون التحريك الحر مفعلاً
      const startFloatDrag = (e) => {
        if (!isFloatingMode) return;
        if (e.target.closest('.image-resizer-toolbar, .resizer-handle, .resizer-rotate-handle, .resizer-corner-rotate-handle')) return;
        e.preventDefault();
        e.stopPropagation();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const startMouseX = clientX;
        const startMouseY = clientY;
        const initialLeft = floatOffsetX;
        const initialTop = floatOffsetY;

        const onDragMove = (moveEvt) => {
          const curX = moveEvt.touches ? moveEvt.touches[0].clientX : moveEvt.clientX;
          const curY = moveEvt.touches ? moveEvt.touches[0].clientY : moveEvt.clientY;
          floatOffsetX = initialLeft + (curX - startMouseX);
          floatOffsetY = initialTop + (curY - startMouseY);
          wrapper.style.left = `${floatOffsetX}px`;
          wrapper.style.top = `${floatOffsetY}px`;
          clampToolbar();
        };

        const onDragEnd = () => {
          document.removeEventListener('mousemove', onDragMove);
          document.removeEventListener('mouseup', onDragEnd);
          document.removeEventListener('touchmove', onDragMove);
          document.removeEventListener('touchend', onDragEnd);
        };

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
      };

      wrapper.addEventListener('mousedown', startFloatDrag);
      wrapper.addEventListener('touchstart', startFloatDrag, { passive: false });

      // 2. ميزات التدوير بأزرار الزوايا (Rotate Buttons)
      const applyRotation = (deg) => {
        currentRotation = ((deg % 360) + 360) % 360;
        img.style.transform = `rotate(${currentRotation}deg)`;
        wrapper.setAttribute('data-rotation', currentRotation);
        updateBadge();
      };

      const btnCcw = toolbar.querySelector('.btn-rotate-ccw');
      if (btnCcw) {
        btnCcw.addEventListener('click', (e) => {
          e.stopPropagation();
          applyRotation(currentRotation - 90);
        });
      }

      const btnCw = toolbar.querySelector('.btn-rotate-cw');
      if (btnCw) {
        btnCw.addEventListener('click', (e) => {
          e.stopPropagation();
          applyRotation(currentRotation + 90);
        });
      }

      // 3. مقبض التدوير اليدوي بجانب الزاوية (Corner Rotate Handle)
      const cornerRotateHandle = wrapper.querySelector('.resizer-corner-rotate-handle');
      if (cornerRotateHandle) {
        const startRotateDrag = (startX, startY) => {
          const rect = wrapper.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          const startMouseAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);
          const initialRotation = currentRotation;

          const onRotateMove = (moveEvt) => {
            const currentX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0].clientX);
            const currentY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0].clientY);
            const currentMouseAngle = Math.atan2(currentY - centerY, currentX - centerX) * (180 / Math.PI);
            const angleDiff = currentMouseAngle - startMouseAngle;
            let newDeg = Math.round(initialRotation + angleDiff);
            newDeg = ((newDeg % 360) + 360) % 360;
            applyRotation(newDeg);
          };

          const onRotateEnd = () => {
            document.removeEventListener('mousemove', onRotateMove);
            document.removeEventListener('mouseup', onRotateEnd);
            document.removeEventListener('touchmove', onRotateMove);
            document.removeEventListener('touchend', onRotateEnd);
          };

          document.addEventListener('mousemove', onRotateMove);
          document.addEventListener('mouseup', onRotateEnd);
          document.addEventListener('touchmove', onRotateMove, { passive: false });
          document.addEventListener('touchend', onRotateEnd);
        };

        cornerRotateHandle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          startRotateDrag(e.clientX, e.clientY);
        });

        cornerRotateHandle.addEventListener('touchstart', (e) => {
          if (e.touches && e.touches.length === 1) {
            e.preventDefault();
            e.stopPropagation();
            startRotateDrag(e.touches[0].clientX, e.touches[0].clientY);
          }
        }, { passive: false });
      }

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

            const minW = isEmojiOrSticker ? 16 : 80;
            newWidth = Math.max(minW, Math.min(newWidth, containerWidth));
            wrapper.style.width = `${Math.round(newWidth)}px`;
            img.setAttribute('width', Math.round(newWidth));
            img.style.width = `${Math.round(newWidth)}px`;
            updateBadge();
          };

          const onPointerUp = () => {
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);

            const finalWidth = Math.round(wrapper.getBoundingClientRect().width);
            const wVal = `${finalWidth}px`;
            img.setAttribute('width', finalWidth);
            img.style.width = wVal;
            img.style.height = 'auto';
            updateImageWidthInMarkdown(img.getAttribute('data-attachment-url') || img.getAttribute('src'), wVal);
            if (typeof isWysiwygActive !== 'undefined' && isWysiwygActive) {
              syncPreviewToMarkdown(true);
            }
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
    if (!e.target.closest('.image-resizer-wrapper, .arrow-resizer-wrapper')) {
      document.querySelectorAll('.image-resizer-wrapper.active, .arrow-resizer-wrapper.active').forEach((w) => w.classList.remove('active'));
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
        let res = match;
        if (/width=["'][^"']*["']/i.test(res)) {
          res = res.replace(/width=["'][^"']*["']/i, `width="${newWidthVal}"`);
        } else {
          res = res.replace(/\/?>$/, ` width="${newWidthVal}" />`);
        }
        if (/height=["'][^"']*["']/i.test(res)) {
          res = res.replace(/height=["'][^"']*["']/i, `height="${newWidthVal}"`);
        }
        return res;
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
      setChamberContent(activeChamber, updatedText);
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
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
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
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
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
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22"><line x1="3" y1="21" x2="21" y2="21"></line><line x1="3" y1="10" x2="21" y2="10"></line><polyline points="12 3 3 10 21 10 12 3"></polyline><line x1="5" y1="10" x2="5" y2="21"></line><line x1="9" y1="10" x2="9" y2="21"></line><line x1="15" y1="10" x2="15" y2="21"></line><line x1="19" y1="10" x2="19" y2="21"></line></svg>',
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
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>',
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
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
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
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5Z"></path><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"></circle><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"></circle></svg>',
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
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
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
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
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
    if (icon) icon.innerHTML = doc.icon;
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

    // قاعدة تجريد عناصر واجهة المستخدم الداخلية (أزرار الزوم، أزرار النسخ، ومقابض التحجيم، وكروت النطق والترجمة)
    turndownService.addRule('stripInternalUIElements', {
      filter: function (node) {
        return (
          node.classList &&
          (node.classList.contains('diagram-zoom-controls') ||
           node.classList.contains('code-copy-btn') ||
           node.classList.contains('img-resize-handle') ||
           node.classList.contains('image-action-overlay') ||
           node.classList.contains('pronunciation-speaker-btn') ||
           node.classList.contains('pronunciation-trans-btn') ||
           node.classList.contains('inline-translation-box') ||
           node.classList.contains('pronunciation-floating-pill') ||
           node.classList.contains('word-trans-bubble') ||
           node.classList.contains('itb-loading') ||
           node.classList.contains('itb-text') ||
           node.classList.contains('bilingual-trans-tag'))
        );
      },
      replacement: function () {
        return '';
      }
    });

    // قاعدة تفكيك وسوم النطق والترجمة لاسترجاع النص الصافي بدون أي وسوم
    turndownService.addRule('unwrapPronunciation', {
      filter: function (node) {
        return (
          node.nodeName === 'SPAN' &&
          node.classList &&
          (node.classList.contains('pronunciation-phrase') || node.classList.contains('pronunciation-word'))
        );
      },
      replacement: function (content) {
        return content;
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
          (node.classList.contains('inline-emoji') ||
           (node.getAttribute('src') || '').includes('assets/icons/emojis/') ||
           (node.getAttribute('src') || '').includes('assets/icons/twemoji/'))
        );
      },
      replacement: function (content, node) {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || 'emoji';
        const title = node.getAttribute('title') || '';
        let w = node.getAttribute('width') || (node.style && node.style.width ? node.style.width : '');
        if (!w && node.parentElement && node.parentElement.classList.contains('image-resizer-wrapper')) {
          w = node.parentElement.style.width;
        }
        w = w ? w.toString().trim() : '24';
        return `<img src="${src}" width="${w}" height="${w}" class="inline-emoji" alt="${alt}" title="${title}">`;
      }
    });

    // قاعدة الحفاظ على الأسهم الموجهة التفاعلية بصيغة مختصرة شبيهة بالصور
    turndownService.addRule('preserveVienixArrows', {
      filter: function (node) {
        return (
          node.nodeName === 'SPAN' &&
          (node.classList.contains('vienix-arrow') ||
           node.classList.contains('arrow-anchor') ||
           node.hasAttribute('data-arrow-id') ||
           node.hasAttribute('data-arrow-model'))
        );
      },
      replacement: function (content, node) {
        const arrowSpan = node.classList.contains('vienix-arrow') ? node : (node.querySelector('.vienix-arrow') || node);
        const model = arrowSpan.getAttribute('data-arrow-model') || '1';
        const dir = arrowSpan.getAttribute('data-arrow-dir') || 'right';
        const color = arrowSpan.getAttribute('data-arrow-color') || arrowSpan.style.color || '#2563eb';
        const size = arrowSpan.getAttribute('data-arrow-size') || arrowSpan.style.fontSize || '28px';
        const rot = parseInt(arrowSpan.getAttribute('data-arrow-rotation') || '0', 10);
        const align = arrowSpan.getAttribute('data-arrow-align') || 'inline';
        const char = arrowSpan.getAttribute('data-arrow-char') || arrowSpan.textContent || '→';
        const isFloat = arrowSpan.getAttribute('data-is-floating') === 'true';
        const floatX = parseFloat(arrowSpan.getAttribute('data-float-x')) || 0;
        const floatY = parseFloat(arrowSpan.getAttribute('data-float-y')) || 0;

        return formatArrowToMarkdown({
          modelId: model,
          dir,
          size,
          color,
          rotation: rot,
          align,
          char,
          isFloating: isFloat,
          floatX,
          floatY
        });
      }
    });

    // قاعدة الحفاظ على مرفقات صور فينيكس النظيفة ومنع تحويلها إلى شفرات Base64 ضخمة في المحرر
    turndownService.addRule('preserveVienixImages', {
      filter: function (node) {
        return (
          node.nodeName === 'IMG' &&
          (node.hasAttribute('data-attachment-url') ||
           node.hasAttribute('data-attachment-id') ||
           (node.getAttribute('src') || '').startsWith('data:image/'))
        );
      },
      replacement: function (content, node) {
        let attachmentUrl = node.getAttribute('data-attachment-url');
        if (!attachmentUrl && node.hasAttribute('data-attachment-id')) {
          attachmentUrl = `vienix-img://${node.getAttribute('data-attachment-id')}`;
        }
        const alt = node.getAttribute('alt') || 'صورة';
        let w = node.getAttribute('width') || (node.style && node.style.width ? node.style.width : '');
        if (!w && node.parentElement && node.parentElement.classList.contains('image-resizer-wrapper')) {
          w = node.parentElement.style.width;
        }
        w = w ? w.toString().trim() : '';
        if (w && !w.endsWith('%') && !w.endsWith('px')) w += 'px';

        // إذا كانت صورة جديدة تم لصقها مباشرة في المعاينة
        if (!attachmentUrl) {
          const src = node.getAttribute('src') || '';
          if (src.startsWith('data:image/') && window.VienixImages) {
            const id = window.VienixImages.saveImage(src);
            attachmentUrl = `vienix-img://${id}`;
          } else {
            attachmentUrl = src;
          }
        }

        if (w) {
          return `![${alt}|${w}](${attachmentUrl})`;
        }
        return `![${alt}](${attachmentUrl})`;
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

        // إزالة أزرار الزوم والنسخ ومقابض التحجيم وكافة كروت وملحقات الترجمة والنطق
        clone.querySelectorAll(
          '.diagram-zoom-controls, .code-copy-btn, .img-resize-handle, .image-action-overlay, ' +
          '.pronunciation-speaker-btn, .pronunciation-trans-btn, .inline-translation-box, ' +
          '.pronunciation-floating-pill, .word-trans-bubble, .itb-loading, .itb-text, .bilingual-trans-tag'
        ).forEach(el => el.remove());

        // تفكيك واستخراج النصوص الصافية من وسوم النطق لضمان عدم تسرب أي وسوم أو أكواد للماركداون
        clone.querySelectorAll('.pronunciation-phrase, .pronunciation-word').forEach(span => {
          const parent = span.parentNode;
          if (!parent) return;
          while (span.firstChild) {
            parent.insertBefore(span.firstChild, span);
          }
          parent.removeChild(span);
        });

        // تحويل شجرة HTML إلى نصوص ماركداون دقيقة
        let md = turndownService.turndown(clone.innerHTML);

        // تنظيف أي شوائب قديمة للترجمة أو فواصل زائدة
        md = md.replace(/<br\s*\/?>\s*<br\s*\/?>\s*جارٍ?\s*استحضار\s*ترجمة\s*العبارة\s*\.\.\.?/gi, '')
               .replace(/جارٍ?\s*استحضار\s*ترجمة\s*العبارة\s*\.\.\.?/gi, '')
               .replace(/\r\n/g, '\n');

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

      // تحديد الحد الأقصى للعرض ليتناسب مع شاشات الموبايل فقط دون التأثير على سطح المكتب
      if (window.innerWidth <= 768) {
        toolbar.style.maxWidth = `${Math.min(window.innerWidth - 16, 350)}px`;
      } else {
        toolbar.style.maxWidth = '';
      }

      const toolbarWidth = toolbar.offsetWidth || 320;
      const toolbarHeight = toolbar.offsetHeight || 40;

      let left = rect.left + rect.width / 2;
      const margin = 8;
      const minLeft = toolbarWidth / 2 + margin;
      const maxLeft = window.innerWidth - toolbarWidth / 2 - margin;
      if (minLeft >= maxLeft) {
        left = window.innerWidth / 2;
      } else {
        left = Math.max(minLeft, Math.min(left, maxLeft));
      }

      let top = rect.top - toolbarHeight - 8;
      if (top < 12) {
        // إذا كان قريباً جداً من الحافة العلوية، يظهر أسفل النص المحدد
        top = rect.bottom + 8;
      }
      if (top + toolbarHeight > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - toolbarHeight - 12);
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
    const previewHeaderBtn = document.getElementById('btn-preview-header-edit');
    const dock = document.getElementById('floating-dock-wrapper');
    const panelPreview = document.getElementById('panel-preview');
    const panelEditor = document.getElementById('panel-editor');

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

      // نقل الكونتينر الأصلي نفسه إلى شاشة المعاينة
      if (dock && panelPreview) {
        panelPreview.appendChild(dock);
        dock.classList.add('in-preview-mode');
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

      // إعادة الكونتينر الأصلي نفسه إلى محرر النصوص
      if (dock && panelEditor) {
        panelEditor.appendChild(dock);
        dock.classList.remove('in-preview-mode');
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
    const arrowPop = document.getElementById('arrow-picker-popover');
    if (arrowPop && arrowPop.style.display !== 'none') {
      if (!arrowPop.contains(e.target) && !e.target.closest('#btn-insert-arrow') && !e.target.closest('#wysiwyg-btn-arrow')) {
        window.closeArrowPicker();
      }
    }
    if (!e.target.closest('.arrow-resizer-wrapper')) {
      document.querySelectorAll('.arrow-resizer-wrapper.active').forEach((w) => w.classList.remove('active'));
    }
  });

  // =========================================================================
  // نظام منتقي الأيقونات والإيموجي الملونة الفلات (Rich Flat Emoji & Badges)
  // =========================================================================
  // =========================================================================
  // نظام منتقي الأيقونات والإيموجي الملونة الفلات (Flaticon 24 + Twemoji 3,689 SVG)
  // =========================================================================
  const FLATICON_EMOJIS = [
    // وجوه ومشاعر (Smileys)
    { id: 'cool', file: 'cool.svg', path: 'assets/icons/emojis/', name: 'نظارة شمسية كول', cat: 'smileys', isFlaticon: true, tags: 'cool sunglasses shade وجه نظارة كول فخم أصفر ستيكر flaticon' },
    { id: 'heart-eyes', file: 'heart-eyes.svg', path: 'assets/icons/emojis/', name: 'عيون قلوب حب', cat: 'smileys', isFlaticon: true, tags: 'love heart eyes عيون قلوب حب إعجاب رائع ستيكر flaticon' },
    { id: 'star-eyes', file: 'star-eyes.svg', path: 'assets/icons/emojis/', name: 'عيون نجوم مبهر', cat: 'smileys', isFlaticon: true, tags: 'star eyes excited نجوم حماس إبهار مذهل ستيكر flaticon' },
    { id: 'laughing', file: 'laughing.svg', path: 'assets/icons/emojis/', name: 'ضحك دموع فرح', cat: 'smileys', isFlaticon: true, tags: 'laugh joy tears ضحك دموع وناسة فرح ستيكر flaticon' },
    { id: 'grin', file: 'grin.svg', path: 'assets/icons/emojis/', name: 'ابتسامة عريضة', cat: 'smileys', isFlaticon: true, tags: 'grin smile happy ابتسامة سعادة مرح ستيكر flaticon' },
    { id: 'thinking', file: 'thinking.svg', path: 'assets/icons/emojis/', name: 'تفكير وتحليل', cat: 'smileys', isFlaticon: true, tags: 'think thinking idea تفكير ذكاء فكرة تأمل ستيكر flaticon' },
    { id: 'wink', file: 'wink.svg', path: 'assets/icons/emojis/', name: 'غمزة ثقة', cat: 'smileys', isFlaticon: true, tags: 'wink confidence غمزة ثقة سر ستيكر flaticon' },
    { id: 'sad-blue', file: 'sad-blue.svg', path: 'assets/icons/emojis/', name: 'حزن أزرق', cat: 'smileys', isFlaticon: true, tags: 'sad blue crying حزن زعل بكاء ستيكر flaticon' },

    // شارات وتوثيق ورموز (Symbols & Badges)
    { id: 'verified-blue', file: 'verified-blue.svg', path: 'assets/icons/emojis/', name: 'توثيق أزرق معتمد', cat: 'symbols', isFlaticon: true, tags: 'verified blue check badge توثيق أزرق صح علامة صح معتمد رسمي ستيكر flaticon' },
    { id: 'verified-black', file: 'verified-black.svg', path: 'assets/icons/emojis/', name: 'توثيق داكن ملكي', cat: 'symbols', isFlaticon: true, tags: 'verified black dark badge توثيق أسود داكن رسمي ستيكر flaticon' },
    { id: 'check-circle-blue', file: 'check-circle-blue.svg', path: 'assets/icons/emojis/', name: 'دائرة صح زرقاء', cat: 'symbols', isFlaticon: true, tags: 'check circle blue صح دائرة أزرق تأكيد نجاح تم ستيكر flaticon' },
    { id: 'check-circle-green', file: 'check-circle-green.svg', path: 'assets/icons/emojis/', name: 'دائرة صح خضراء', cat: 'symbols', isFlaticon: true, tags: 'check circle green صح دائرة أخضر تم قبول موافق ستيكر flaticon' },
    { id: 'star-gold', file: 'star-gold.svg', path: 'assets/icons/emojis/', name: 'نجمة ذهبية مميزة', cat: 'symbols', isFlaticon: true, tags: 'star gold favorite نجمة ذهبي مميز مفضلة ستيكر flaticon' },
    { id: 'crown', file: 'crown.svg', path: 'assets/icons/emojis/', name: 'تاج ذهبي ملكي', cat: 'symbols', isFlaticon: true, tags: 'crown gold king vip تاج ملك فخم ذهبي ستيكر flaticon' },
    { id: 'target', file: 'target.svg', path: 'assets/icons/emojis/', name: 'هدف وإنجاز', cat: 'symbols', isFlaticon: true, tags: 'target goal bullseye هدف إنجاز دقة وصول ستيكر flaticon' },
    { id: 'gem', file: 'gem.svg', path: 'assets/icons/emojis/', name: 'جوهرة ألماسة نادرة', cat: 'symbols', isFlaticon: true, tags: 'gem diamond جوهرة ألماس قيمة ثمين جوهرة ستيكر flaticon' },
    { id: 'warning', file: 'warning.svg', path: 'assets/icons/emojis/', name: 'تنبيه وتحذير', cat: 'symbols', isFlaticon: true, tags: 'warning alert تنبيه تحذير انتباه هام خطر ستيكر flaticon' },
    { id: 'heart-red', file: 'heart-red.svg', path: 'assets/icons/emojis/', name: 'قلب أحمر نقي', cat: 'symbols', isFlaticon: true, tags: 'heart red love قلب أحمر حب إعجاب شغف ستيكر flaticon' },
    { id: 'fire', file: 'fire.svg', path: 'assets/icons/emojis/', name: 'شعلة نار حماس', cat: 'symbols', isFlaticon: true, tags: 'fire hot lit شعلة نار ترند حماس قوي اشتعال ستيكر flaticon' },
    { id: 'sparkles', file: 'sparkles.svg', path: 'assets/icons/emojis/', name: 'بريق ولمعان سحري', cat: 'symbols', isFlaticon: true, tags: 'sparkles magic star بريق لمعان سحر جديد إشراق ستيكر flaticon' },

    // أشخاص وأدوات (People & Objects & Activities)
    { id: 'thumbs-up', file: 'thumbs-up.svg', path: 'assets/icons/emojis/', name: 'إعجاب ممتاز', cat: 'people', isFlaticon: true, tags: 'thumbs up like approve إعجاب موافق ممتاز تم تمام ستيكر flaticon' },
    { id: 'rocket', file: 'rocket.svg', path: 'assets/icons/emojis/', name: 'صاروخ انطلاق وسرعة', cat: 'objects', isFlaticon: true, tags: 'rocket launch fast صاروخ انطلاق سرعة تطور قفزة ستيكر flaticon' },
    { id: 'idea', file: 'idea.svg', path: 'assets/icons/emojis/', name: 'مصباح فكرة وإلهام', cat: 'objects', isFlaticon: true, tags: 'idea bulb light مصباح فكرة ذكاء إلهام اقتراح ستيكر flaticon' },
    { id: 'party', file: 'party.svg', path: 'assets/icons/emojis/', name: 'احتفال ومفرقعات', cat: 'activities', isFlaticon: true, tags: 'party celebration احتفال نجاح مبروك فرح عيد ستيكر flaticon' }
  ];

  let ALL_EMOJI_ITEMS = [];

  function getAllEmojiItems() {
    if (ALL_EMOJI_ITEMS.length > 0) return ALL_EMOJI_ITEMS;
    const twemojiList = (window.TWEMOJI_DATA || []).map(item => ({
      ...item,
      path: 'assets/icons/twemoji/'
    }));
    ALL_EMOJI_ITEMS = [...FLATICON_EMOJIS, ...twemojiList];
    return ALL_EMOJI_ITEMS;
  }

  let currentEmojiCategory = 'flaticon';
  let filteredEmojiCache = [];
  let renderedEmojiCount = 0;
  const EMOJI_CHUNK_SIZE = 140;

  function renderNextEmojiChunk() {
    const grid = document.getElementById('emoji-picker-grid');
    if (!grid) return;

    const nextBatch = filteredEmojiCache.slice(renderedEmojiCount, renderedEmojiCount + EMOJI_CHUNK_SIZE);
    if (nextBatch.length === 0) return;

    const fragment = document.createDocumentFragment();
    nextBatch.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-grid-item';
      if (item.isFlaticon) {
        btn.classList.add('is-flaticon-item');
      }
      const tooltipName = item.name + (item.ar ? ` • ${item.ar.split(' ').slice(0, 3).join(' ')}` : '');
      btn.title = tooltipName;
      const basePath = item.path || 'assets/icons/twemoji/';
      btn.innerHTML = `<img src="${basePath}${item.file}" alt="${item.id}" loading="lazy">`;
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.insertEmojiIcon(item);
      };
      fragment.appendChild(btn);
    });

    grid.appendChild(fragment);
    renderedEmojiCount += nextBatch.length;
  }

  window.renderEmojiGrid = function (filterQuery = '') {
    const grid = document.getElementById('emoji-picker-grid');
    if (!grid) return;
    grid.innerHTML = '';
    renderedEmojiCount = 0;

    const allItems = getAllEmojiItems();
    const query = (filterQuery || '').trim().toLowerCase();

    filteredEmojiCache = allItems.filter(item => {
      let matchCat = false;
      if (currentEmojiCategory === 'flaticon') {
        matchCat = item.isFlaticon === true;
      } else if (currentEmojiCategory === 'all') {
        matchCat = true;
      } else {
        matchCat = item.cat === currentEmojiCategory;
      }
      if (!matchCat) return false;
      if (!query) return true;

      const nameMatch = item.name && item.name.toLowerCase().includes(query);
      const arMatch = item.ar && item.ar.toLowerCase().includes(query);
      const tagsMatch = item.tags && item.tags.toLowerCase().includes(query);
      const idMatch = item.id && item.id.toLowerCase().includes(query);
      return nameMatch || arMatch || tagsMatch || idMatch;
    });

    if (filteredEmojiCache.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; font-size: 0.78rem; padding: 30px 0;">لا توجد أيقونة مطابقة لهذا البحث</div>';
      return;
    }

    renderNextEmojiChunk();

    // ربط التمرير اللانهائي
    if (!grid._scrollBound) {
      grid._scrollBound = true;
      grid.addEventListener('scroll', () => {
        if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 80) {
          renderNextEmojiChunk();
        }
      });
    }
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

    currentEmojiCategory = 'flaticon';
    document.querySelectorAll('.emoji-cat-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-cat') === 'flaticon');
    });

    const searchInput = document.getElementById('emoji-search-input');
    if (searchInput) searchInput.value = '';

    window.renderEmojiGrid('');
    popover.style.display = 'flex';

    // تموضع اللوحة المنبثقة
    const btnRect = (triggerBtn || document.getElementById('btn-insert-emoji')).getBoundingClientRect();
    const popWidth = popover.offsetWidth || 350;
    const popHeight = popover.offsetHeight || 380;

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
    const basePath = iconItem.path || 'assets/icons/twemoji/';
    const imgHtml = `<img src="${basePath}${iconItem.file}" width="24" height="24" class="inline-emoji" alt="${iconItem.id}" title="${iconItem.name}">`;

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

  // =========================================================================
  // نظام الأسهم الموجهة التفاعلية (36 سهم - 9 موديلات × 4 اتجاهات)
  // =========================================================================
  const ARROW_MODELS = [
    {
      id: 1,
      name: 'سهم خطي بسيط',
      sample: '↓',
      dirs: {
        up: { char: '↑', rot: 0, name: 'أعلى' },
        down: { char: '↓', rot: 0, name: 'أسفل' },
        left: { char: '←', rot: 0, name: 'يسار' },
        right: { char: '→', rot: 0, name: 'يمين' }
      }
    },
    {
      id: 2,
      name: 'سهم مزدوج مجوف',
      sample: '⇐',
      dirs: {
        up: { char: '⇑', rot: 0, name: 'أعلى' },
        down: { char: '⇓', rot: 0, name: 'أسفل' },
        left: { char: '⇐', rot: 0, name: 'يسار' },
        right: { char: '⇒', rot: 0, name: 'يمين' }
      }
    },
    {
      id: 3,
      name: 'سهم عريض سميك',
      sample: '➔',
      dirs: {
        up: { char: '➔', rot: 270, name: 'أعلى' },
        down: { char: '➔', rot: 90, name: 'أسفل' },
        left: { char: '➔', rot: 180, name: 'يسار' },
        right: { char: '➔', rot: 0, name: 'يمين' }
      }
    },
    {
      id: 4,
      name: 'سهم رأس دائري سميك',
      sample: '➜',
      dirs: {
        up: { char: '➜', rot: 270, name: 'أعلى' },
        down: { char: '➜', rot: 90, name: 'أسفل' },
        left: { char: '➜', rot: 180, name: 'يسار' },
        right: { char: '➜', rot: 0, name: 'يمين' }
      }
    },
    {
      id: 5,
      name: 'سهم مدبب هندسي',
      sample: '➛',
      dirs: {
        up: { char: '➛', rot: 270, name: 'أعلى' },
        down: { char: '➛', rot: 90, name: 'أسفل' },
        left: { char: '➛', rot: 180, name: 'يسار' },
        right: { char: '➛', rot: 0, name: 'يمين' }
      }
    },
    {
      id: 6,
      name: 'سهم مؤشر صاعد',
      sample: '➚',
      dirs: {
        up: { char: '➚', rot: -45, name: 'أعلى' },
        down: { char: '➚', rot: 135, name: 'أسفل' },
        left: { char: '➚', rot: 225, name: 'يسار' },
        right: { char: '➚', rot: 0, name: 'يمين / أعلى يمين' }
      }
    },
    {
      id: 7,
      name: 'سهم رأس المثلث الأنيق',
      sample: '➤',
      dirs: {
        up: { char: '➤', rot: 270, name: 'أعلى' },
        down: { char: '➤', rot: 90, name: 'أسفل' },
        left: { char: '➤', rot: 180, name: 'يسار' },
        right: { char: '➤', rot: 0, name: 'يمين' }
      }
    },
    {
      id: 8,
      name: 'سهم عريض معبأ',
      sample: '⬅',
      dirs: {
        up: { char: '⬆\uFE0E', rot: 0, name: 'أعلى' },
        down: { char: '⬇\uFE0E', rot: 0, name: 'أسفل' },
        left: { char: '⬅\uFE0E', rot: 0, name: 'يسار' },
        right: { char: '➡\uFE0E', rot: 0, name: 'يمين' }
      }
    },
    {
      id: 9,
      name: 'سهم مجوف عريض',
      sample: '⇨',
      dirs: {
        up: { char: '⇧', rot: 0, name: 'أعلى' },
        down: { char: '⇩', rot: 0, name: 'أسفل' },
        left: { char: '⇦', rot: 0, name: 'يسار' },
        right: { char: '⇨', rot: 0, name: 'يمين' }
      }
    },
    {
      id: 10,
      name: 'مربع معبأ مصمت',
      sample: '■',
      isShape: true,
      dirs: {
        up: { char: '■', rot: 0, name: 'مربع معبأ' },
        down: { char: '■', rot: 0, name: 'مربع معبأ' },
        left: { char: '■', rot: 0, name: 'مربع معبأ' },
        right: { char: '■', rot: 0, name: 'مربع معبأ' }
      }
    },
    {
      id: 11,
      name: 'مربع هندسي مفرغ',
      sample: '□',
      isShape: true,
      dirs: {
        up: { char: '□', rot: 0, name: 'مربع مفرغ' },
        down: { char: '□', rot: 0, name: 'مربع مفرغ' },
        left: { char: '□', rot: 0, name: 'مربع مفرغ' },
        right: { char: '□', rot: 0, name: 'مربع مفرغ' }
      }
    },
    {
      id: 12,
      name: 'مربع دائري الزوايا',
      sample: '▢',
      isShape: true,
      dirs: {
        up: { char: '▢', rot: 0, name: 'مربع دائري' },
        down: { char: '▢', rot: 0, name: 'مربع دائري' },
        left: { char: '▢', rot: 0, name: 'مربع دائري' },
        right: { char: '▢', rot: 0, name: 'مربع دائري' }
      }
    },
    {
      id: 13,
      name: 'مربع بنواة مركزية',
      sample: '▣',
      isShape: true,
      dirs: {
        up: { char: '▣', rot: 0, name: 'مربع بنواة' },
        down: { char: '▣', rot: 0, name: 'مربع بنواة' },
        left: { char: '▣', rot: 0, name: 'مربع بنواة' },
        right: { char: '▣', rot: 0, name: 'مربع بنواة' }
      }
    },
    {
      id: 14,
      name: 'دائرة هندسية مفرغة',
      sample: '◯',
      isShape: true,
      dirs: {
        up: { char: '◯', rot: 0, name: 'دائرة مفرغة' },
        down: { char: '◯', rot: 0, name: 'دائرة مفرغة' },
        left: { char: '◯', rot: 0, name: 'دائرة مفرغة' },
        right: { char: '◯', rot: 0, name: 'دائرة مفرغة' }
      }
    }
  ];

  const ALL_ARROW_CHARS_MAP = {};
  ARROW_MODELS.forEach((m) => {
    Object.keys(m.dirs).forEach((dirKey) => {
      const d = m.dirs[dirKey];
      ALL_ARROW_CHARS_MAP[d.char] = { modelId: m.id, dir: dirKey, rot: d.rot || 0, char: d.char, name: m.name };
      const cleanChar = d.char.replace(/\uFE0E/g, '');
      if (cleanChar !== d.char) {
        ALL_ARROW_CHARS_MAP[cleanChar] = { modelId: m.id, dir: dirKey, rot: d.rot || 0, char: d.char, name: m.name };
      }
    });
  });

  let currentArrowCategory = 'all';
  let currentArrowPickerColor = '#2563eb';
  let isArrowTextMode = localStorage.getItem('vienix_arrow_text_mode') === 'true';

  window.toggleArrowTextMode = function () {
    isArrowTextMode = !isArrowTextMode;
    localStorage.setItem('vienix_arrow_text_mode', isArrowTextMode ? 'true' : 'false');
    window.updateArrowModeUI();
    showToast(
      isArrowTextMode
        ? 'تم تفعيل وضع الرموز النصية العادية 🔤 — تُدرج الرموز كنص عادي منساب ومباشر بدون تعقيدات'
        : 'تم تفعيل وضع الرموز التفاعلية ⚡ — إدراج رموز حرة وقابلة للتلوين والتحجيم',
      'info',
      2500
    );
  };

  window.updateArrowModeUI = function () {
    const btn = document.getElementById('arrow-mode-toggle-btn');
    const colorPalette = document.querySelector('.arrow-quick-color-palette');
    if (btn) {
      btn.classList.toggle('active', isArrowTextMode);
      const textSpan = btn.querySelector('.mode-text');
      if (textSpan) {
        textSpan.textContent = isArrowTextMode ? '✓ رمز نصي عادي (Text)' : 'نص عادي 🔤';
      }
    }
    if (colorPalette) {
      colorPalette.classList.toggle('is-disabled', isArrowTextMode);
      colorPalette.title = isArrowTextMode ? 'في وضع النص العادي يتلون الرمز بلون النص المحيط تلقائياً' : 'اختر لون السهم أو الشكل';
    }
    window.renderArrowGrid(currentArrowCategory || 'all');
  };

  window.setArrowPickerColor = function (color, dotEl) {
    currentArrowPickerColor = color || '#2563eb';
    document.querySelectorAll('.arrow-quick-color-palette .arrow-color-dot').forEach((d) => {
      d.classList.toggle('active', d === dotEl);
    });
    const customInp = document.getElementById('arrow-picker-custom-color');
    if (customInp && customInp.value !== currentArrowPickerColor) {
      customInp.value = currentArrowPickerColor;
    }
    if (!isArrowTextMode) {
      document.querySelectorAll('.arrow-grid-char').forEach((el) => {
        el.style.color = currentArrowPickerColor;
      });
    }
  };

  window.selectArrowCategory = function (cat) {
    currentArrowCategory = cat;
    document.querySelectorAll('.arrow-direction-tabs .emoji-cat-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-cat') === cat);
    });
    window.renderArrowGrid(cat);
  };

  window.renderArrowGrid = function (filterCat = 'all') {
    const grid = document.getElementById('arrow-picker-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const fragment = document.createDocumentFragment();
    const charColor = isArrowTextMode ? 'var(--text-color, #e2e8f0)' : currentArrowPickerColor;

    ARROW_MODELS.forEach((model) => {
      // الأشكال الهندسية (Models 10-14)
      if (model.isShape) {
        if (filterCat !== 'all' && filterCat !== 'shapes') return;
        const dirData = model.dirs.right || model.dirs.up;
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'arrow-grid-item';
        itemBtn.title = `${model.name}${isArrowTextMode ? ' (رمز نصي عادي)' : ''}`;

        itemBtn.innerHTML = `
          <span class="arrow-grid-char" style="color: ${charColor};">${dirData.char}</span>
          <span class="arrow-grid-label">${dirData.name}</span>
        `;

        itemBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.insertArrowIcon(model.id, 'right', dirData.char, 0);
        };

        fragment.appendChild(itemBtn);
        return;
      }

      // الأسهم الموجهة (Models 1-9)
      if (filterCat === 'shapes') return;

      const dirKeys = ['up', 'down', 'right', 'left'];
      dirKeys.forEach((dirKey) => {
        if (filterCat !== 'all' && filterCat !== dirKey) return;
        const dirData = model.dirs[dirKey];
        if (!dirData) return;

        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'arrow-grid-item';
        itemBtn.title = `${model.name} (${dirData.name})${isArrowTextMode ? ' (رمز نصي عادي)' : ''}`;

        const rot = isArrowTextMode ? 0 : (dirData.rot || 0);
        const transformStyle = rot !== 0 ? `transform: rotate(${rot}deg);` : '';

        itemBtn.innerHTML = `
          <span class="arrow-grid-char" style="color: ${charColor}; ${transformStyle}">${dirData.char}</span>
          <span class="arrow-grid-label">${dirData.name}</span>
        `;

        itemBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.insertArrowIcon(model.id, dirKey, dirData.char, dirData.rot || 0);
        };

        fragment.appendChild(itemBtn);
      });
    });

    grid.appendChild(fragment);
  };

  window.toggleArrowPicker = function (triggerBtn, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const popover = document.getElementById('arrow-picker-popover');
    if (!popover) return;

    if (popover.style.display !== 'none') {
      window.closeArrowPicker();
      return;
    }

    if (typeof window.closeEmojiPicker === 'function') {
      window.closeEmojiPicker();
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedWysiwygSelectionRange = sel.getRangeAt(0).cloneRange();
    }

    currentArrowCategory = 'all';
    document.querySelectorAll('.arrow-direction-tabs .emoji-cat-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-cat') === 'all');
    });

    window.updateArrowModeUI();
    popover.style.display = 'flex';

    const btnRect = (triggerBtn || document.getElementById('btn-insert-arrow')).getBoundingClientRect();
    const popWidth = popover.offsetWidth || 380;
    const popHeight = popover.offsetHeight || 420;

    let left = btnRect.left + btnRect.width / 2 - popWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - popWidth - 12));

    let top = btnRect.bottom + 8;
    if (top + popHeight > window.innerHeight - 10) {
      top = btnRect.top - popHeight - 8;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  };

  window.closeArrowPicker = function () {
    const popover = document.getElementById('arrow-picker-popover');
    if (popover) popover.style.display = 'none';
  };

  window.insertArrowIcon = function (modelId, dirKey, arrowChar, baseRot = 0) {
    const model = ARROW_MODELS.find((m) => m.id === modelId) || ARROW_MODELS[0];
    const dirData = (model.dirs && model.dirs[dirKey]) || { char: arrowChar, rot: baseRot, name: dirKey };
    const charToInsert = dirData.char || arrowChar;

    // 1. الوضع النصي العادي (Plain Text Mode) - إدراج رمز نصي مباشر وسلس بدون أي تعقيدات
    if (isArrowTextMode) {
      if (isWysiwygActive && previewContent) {
        if (savedWysiwygSelectionRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedWysiwygSelectionRange);
        }
        try {
          document.execCommand('insertText', false, charToInsert + ' ');
        } catch (_) {
          const textNode = document.createTextNode(charToInsert + ' ');
          if (savedWysiwygSelectionRange) {
            savedWysiwygSelectionRange.insertNode(textNode);
          } else {
            previewContent.appendChild(textNode);
          }
        }
        syncPreviewToMarkdown(true);
      } else {
        window.insertFormat('', '', charToInsert + ' ');
      }
      window.closeArrowPicker();
      showToast(`تم إدراج رمز نصي: ${charToInsert} ✓`, 'success');
      return;
    }

    // 2. الوضع التفاعلي المتقدم (Interactive Mode)
    const color = currentArrowPickerColor || '#2563eb';
    const rot = typeof baseRot === 'number' ? baseRot : (dirData.rot || 0);
    const arrowId = `a${Date.now().toString().slice(-6)}`;

    const arrowMarkdown = formatArrowToMarkdown({
      arrowId,
      modelId,
      dir: dirKey,
      char: charToInsert,
      size: '28px',
      color,
      rotation: rot,
      align: 'inline',
      isFloating: false
    });

    if (isWysiwygActive && previewContent) {
      const rotStyle = rot !== 0 ? ` transform: rotate(${rot}deg);` : '';
      const arrowHtml = `<span class="arrow-anchor" data-arrow-id="${arrowId}"><span class="vienix-arrow" data-arrow-id="${arrowId}" data-arrow-model="${modelId}" data-arrow-dir="${dirKey}" data-arrow-color="${color}" data-arrow-size="28px" data-arrow-rotation="${rot}" data-arrow-align="inline" style="font-size: 28px; color: ${color};${rotStyle}">${charToInsert}</span></span>`;

      if (savedWysiwygSelectionRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedWysiwygSelectionRange);
      }
      try {
        document.execCommand('insertHTML', false, arrowHtml + '&nbsp;');
      } catch (_) {
        const span = document.createElement('span');
        span.innerHTML = arrowHtml + '&nbsp;';
        if (savedWysiwygSelectionRange) {
          savedWysiwygSelectionRange.insertNode(span);
        } else {
          previewContent.appendChild(span);
        }
      }
      syncPreviewToMarkdown(true);
    } else {
      // إدراج صيغة الماركداون المختصرة التي تشبه الصور
      window.insertFormat('', '', arrowMarkdown + ' ');
    }

    window.closeArrowPicker();
    showToast(`تم إدراج ${model.name} (${dirData.name || ''}) ✓`, 'success');
  };

  // =========================================================================
  // شريط التحكم التفاعلي بالأسهم في شاشة العرض (Setup Arrow Resizers)
  // =========================================================================
  function setupArrowResizers(container) {
    if (!container) return;

    // تغليف عناصر الأسهم والأشكال التفاعلية فقط (.vienix-arrow)
    // بينما تبقى الرموز النصية العادية المكتوبة في النص نصاً عادياً 100% بدون أي تعقيدات
    const arrows = container.querySelectorAll('.vienix-arrow');

    arrows.forEach((arrowEl) => {
      if (arrowEl.parentElement && arrowEl.parentElement.classList.contains('arrow-resizer-wrapper')) {
        return;
      }

      let arrowId = arrowEl.getAttribute('data-arrow-id') || `arrow-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      arrowEl.setAttribute('data-arrow-id', arrowId);

      let currentModelId = parseInt(arrowEl.getAttribute('data-arrow-model') || '1', 10);
      let currentDir = arrowEl.getAttribute('data-arrow-dir') || 'right';
      let currentColor = arrowEl.getAttribute('data-arrow-color') || arrowEl.style.color || '#2563eb';
      let currentSize = arrowEl.getAttribute('data-arrow-size') || arrowEl.style.fontSize || '28px';
      let currentRotation = parseInt(arrowEl.getAttribute('data-arrow-rotation') || '0', 10);
      let currentAlign = arrowEl.getAttribute('data-arrow-align') || 'inline';
      const originalRawChar = arrowEl.getAttribute('data-raw-char') || '';
      const isFloatingInit = arrowEl.getAttribute('data-is-floating') === 'true';

      // التحقق من الحاوية المرجعية .arrow-anchor لمنع أي تشويه لتدفق النص
      let anchor = arrowEl.closest('.arrow-anchor');
      if (!anchor) {
        anchor = document.createElement('span');
        anchor.className = 'arrow-anchor' + (isFloatingInit ? ' is-floating' : '');
        anchor.setAttribute('data-arrow-id', arrowId);
        arrowEl.parentNode.insertBefore(anchor, arrowEl);
      } else {
        anchor.className = 'arrow-anchor' + (isFloatingInit ? ' is-floating' : '');
      }

      if (isFloatingInit) {
        anchor.style.cssText = 'display: inline-block !important; position: relative !important; width: 0 !important; height: 0 !important; line-height: 0 !important; font-size: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; vertical-align: baseline !important; overflow: visible !important;';
      } else {
        anchor.style.cssText = 'display: inline !important; width: auto !important; height: auto !important; line-height: inherit !important; font-size: inherit !important; margin: 0 !important; padding: 0 !important; border: 0 !important;';
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'arrow-resizer-wrapper';
      wrapper.setAttribute('data-arrow-id', arrowId);
      wrapper.setAttribute('data-align', currentAlign);
      if (isFloatingInit) {
        wrapper.classList.add('is-floating');
        wrapper.style.left = `${arrowEl.getAttribute('data-float-x') || 0}px`;
        wrapper.style.top = `${arrowEl.getAttribute('data-float-y') || 0}px`;
      }

      // شريط الأدوات العائم المتكامل
      const toolbar = document.createElement('div');
      toolbar.className = 'arrow-resizer-toolbar';
      toolbar.setAttribute('contenteditable', 'false');

      toolbar.innerHTML = `
        <!-- تغيير الاتجاه (4 اتجاهات) -->
        <button type="button" class="resizer-btn btn-dir-up ${currentDir === 'up' ? 'active' : ''}" data-dir="up" title="للأعلى ⬆">⬆</button>
        <button type="button" class="resizer-btn btn-dir-down ${currentDir === 'down' ? 'active' : ''}" data-dir="down" title="للأسفل ⬇">⬇</button>
        <button type="button" class="resizer-btn btn-dir-right ${currentDir === 'right' ? 'active' : ''}" data-dir="right" title="لليمين ➡">➡</button>
        <button type="button" class="resizer-btn btn-dir-left ${currentDir === 'left' ? 'active' : ''}" data-dir="left" title="لليسار ⬅">⬅</button>
        <span class="resizer-divider"></span>

        <!-- تبديل موديل السهم أو الشكل (1-14) -->
        <button type="button" class="resizer-btn btn-prev-model" title="الموديل السابق">⟨</button>
        <span class="resizer-btn model-badge-indicator" title="رقم موديل السهم أو الشكل الحالي" style="pointer-events:none; font-size:0.68rem;">م${currentModelId}</span>
        <button type="button" class="resizer-btn btn-next-model" title="الموديل التالي">⟩</button>
        <span class="resizer-divider"></span>

        <!-- تغيير اللون (لوحة سريعة + محدد ألوان مخصص) -->
        <div class="arrow-tb-colors">
          <button type="button" class="arrow-tb-color-dot" data-color="#2563eb" style="background:#2563eb;" title="أزرق ملكي"></button>
          <button type="button" class="arrow-tb-color-dot" data-color="#ef4444" style="background:#ef4444;" title="أحمر قرمزي"></button>
          <button type="button" class="arrow-tb-color-dot" data-color="#10b981" style="background:#10b981;" title="أخضر زمردي"></button>
          <button type="button" class="arrow-tb-color-dot" data-color="#f59e0b" style="background:#f59e0b;" title="ذهبي"></button>
          <button type="button" class="arrow-tb-color-dot" data-color="#8b5cf6" style="background:#8b5cf6;" title="بنفسجي"></button>
          <button type="button" class="arrow-tb-color-dot" data-color="#f97316" style="background:#f97316;" title="برتقالي"></button>
          <label class="arrow-tb-custom-color" title="لون مخصص حر">
            <input type="color" class="arrow-tb-color-picker-input" value="${currentColor.startsWith('#') ? currentColor : '#2563eb'}" />
            <span>🎨</span>
          </label>
        </div>
        <span class="resizer-divider"></span>

        <!-- تغيير الحجم -->
        <button type="button" class="resizer-btn btn-size-preset" data-size="20px" title="حجم صغير (20px)">20</button>
        <button type="button" class="resizer-btn btn-size-preset" data-size="28px" title="حجم عادي (28px)">28</button>
        <button type="button" class="resizer-btn btn-size-preset" data-size="40px" title="حجم كبير (40px)">40</button>
        <button type="button" class="resizer-btn btn-size-preset" data-size="60px" title="حجم بارز (60px)">60</button>
        <span class="resizer-divider"></span>

        <!-- التدوير -->
        <button type="button" class="resizer-btn btn-rotate-ccw" title="تدوير 90° عكس عقارب الساعة">↺</button>
        <button type="button" class="resizer-btn btn-rotate-cw" title="تدوير 90° مع عقارب الساعة">↻</button>
        <span class="resizer-divider"></span>

        <!-- التحريك الحر فوق العناصر (Zero Footprint Floating) -->
        <button type="button" class="resizer-btn btn-float-toggle" title="تحريك حر فوق العناصر: عند تفعيله لا يؤثر حجمه أو تموضعه إطلاقاً على الأسطر والنصوص المحيطة">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>
          <span>حر</span>
        </button>
        <span class="resizer-divider"></span>

        <!-- المحاذاة -->
        <button type="button" class="resizer-btn ${currentAlign === 'inline' ? 'active' : ''}" data-align="inline" title="محاذاة منسابة مع السطر (Inline)">▤</button>
        <button type="button" class="resizer-btn ${currentAlign === 'right' ? 'active' : ''}" data-align="right" title="محاذاة لليمين">▶</button>
        <button type="button" class="resizer-btn ${currentAlign === 'center' ? 'active' : ''}" data-align="center" title="توسيط">■</button>
        <button type="button" class="resizer-btn ${currentAlign === 'left' ? 'active' : ''}" data-align="left" title="محاذاة لليسار">◀</button>
        <span class="resizer-divider"></span>

        <!-- تحويل لنص عادي مجرد بدون تعقيدات -->
        <button type="button" class="resizer-btn btn-convert-to-text" title="تحويل هذا السهم إلى رمز نصي عادي (Text) في المحرر بدون تعقيدات">🔤</button>
        <span class="resizer-divider"></span>

        <!-- حذف السهم -->
        <button type="button" class="resizer-btn btn-arrow-delete" title="حذف هذا السهم" style="color:#ef4444;">🗑️</button>
        <span class="resizer-divider"></span>

        <!-- شارة الحجم والمعلومات -->
        <span class="resizer-size-badge" style="font-size:0.65rem; color:#94a3b8; font-family:monospace;">${currentSize}</span>
      `;

      // مقابض التحجيم والتدوير اليدوي
      const handlesHtml = `
        <div class="resizer-corner-rotate-handle" title="مقبض التدوير الحر: اسحب بالماوس للالتفاف بأي زاوية">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
        </div>
        <div class="resizer-handle handle-nw" data-dir="nw" title="اسحب للتكبير والتصغير"></div>
        <div class="resizer-handle handle-ne" data-dir="ne" title="اسحب للتكبير والتصغير"></div>
        <div class="resizer-handle handle-sw" data-dir="sw" title="اسحب للتكبير والتصغير"></div>
        <div class="resizer-handle handle-se" data-dir="se" title="اسحب للتكبير والتصغير"></div>
      `;

      wrapper.appendChild(toolbar);
      wrapper.appendChild(arrowEl);
      wrapper.insertAdjacentHTML('beforeend', handlesHtml);
      anchor.appendChild(wrapper);

      // دالة التموضع الذكي لشريط الأدوات لمنع خروجه خارج الشاشة
      const clampToolbar = () => {
        if (!wrapper.classList.contains('active')) return;
        const containerRect = container.getBoundingClientRect();
        toolbar.style.left = '50%';
        toolbar.style.transform = 'translateX(-50%)';

        const minPadding = 8;
        if (window.innerWidth <= 768) {
          const maxAvailWidth = Math.max(200, Math.min(window.innerWidth - 16, containerRect.width - (minPadding * 2)));
          toolbar.style.maxWidth = `${maxAvailWidth}px`;
        } else {
          toolbar.style.maxWidth = '';
        }

        const tbRect = toolbar.getBoundingClientRect();
        let shiftX = 0;
        if (tbRect.left < containerRect.left + minPadding) {
          shiftX = Math.round((containerRect.left + minPadding) - tbRect.left);
        } else if (tbRect.right > containerRect.right - minPadding) {
          shiftX = -Math.round(tbRect.right - (containerRect.right - minPadding));
        }

        if (tbRect.left + shiftX < containerRect.left + minPadding) {
          shiftX = Math.round((containerRect.left + minPadding) - tbRect.left);
        } else if (tbRect.right + shiftX > containerRect.right - minPadding) {
          shiftX = -Math.round(tbRect.right - (containerRect.right - minPadding));
        }

        toolbar.style.transform = shiftX !== 0 ? `translateX(calc(-50% + ${shiftX}px))` : 'translateX(-50%)';

        if (tbRect.top < containerRect.top + 8) {
          toolbar.style.bottom = 'auto';
          toolbar.style.top = 'calc(100% + 8px)';
        } else {
          toolbar.style.bottom = 'calc(100% + 8px)';
          toolbar.style.top = 'auto';
        }
      };

      const sizeBadge = toolbar.querySelector('.resizer-size-badge');
      const modelBadge = toolbar.querySelector('.model-badge-indicator');

      // دالة الحفظ والتزامن الفوري مع محرر الماركداون
      const syncChangesToMarkdown = () => {
        const model = ARROW_MODELS.find((m) => m.id === currentModelId) || ARROW_MODELS[0];
        const dirData = (model.dirs && model.dirs[currentDir]) || { char: arrowEl.textContent, rot: 0, name: currentDir };
        const baseRot = dirData.rot || 0;
        const totalRot = ((baseRot + currentRotation) % 360 + 360) % 360;

        arrowEl.textContent = dirData.char;
        arrowEl.style.color = currentColor;
        arrowEl.style.fontSize = currentSize;
        arrowEl.style.transform = totalRot !== 0 ? `rotate(${totalRot}deg)` : '';

        arrowEl.setAttribute('data-arrow-model', currentModelId);
        arrowEl.setAttribute('data-arrow-dir', currentDir);
        arrowEl.setAttribute('data-arrow-color', currentColor);
        arrowEl.setAttribute('data-arrow-size', currentSize);
        arrowEl.setAttribute('data-arrow-rotation', totalRot);
        arrowEl.setAttribute('data-arrow-align', currentAlign);

        if (sizeBadge) {
          sizeBadge.textContent = `${currentSize}${totalRot !== 0 ? ` • ${totalRot}°` : ''}`;
        }
        if (modelBadge) {
          modelBadge.textContent = `م${currentModelId}`;
        }

        updateArrowInMarkdown(arrowId, {
          modelId: currentModelId,
          dir: currentDir,
          color: currentColor,
          size: currentSize,
          rotation: totalRot,
          align: currentAlign,
          char: dirData.char,
          isFloating: wrapper.classList.contains('is-floating'),
          floatX: floatOffsetX,
          floatY: floatOffsetY,
          originalChar: originalRawChar
        });

        if (typeof isWysiwygActive !== 'undefined' && isWysiwygActive) {
          syncPreviewToMarkdown(true);
        }
        setTimeout(clampToolbar, 10);
      };

      // تفعيل السهم عند النقر عليه
      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.arrow-resizer-wrapper.active, .image-resizer-wrapper.active').forEach((w) => {
          if (w !== wrapper) w.classList.remove('active');
        });
        wrapper.classList.add('active');
        clampToolbar();
      });

      // 1. تغيير الاتجاه (Direction Buttons)
      toolbar.querySelectorAll('[data-dir]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          toolbar.querySelectorAll('[data-dir]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentDir = btn.getAttribute('data-dir');
          currentRotation = 0; // إعادة ضبط التدوير الحر عند تغيير الاتجاه
          syncChangesToMarkdown();
        });
      });

      // 2. تبديل موديل السهم أو الشكل (Model Switcher 1-14)
      const btnPrev = toolbar.querySelector('.btn-prev-model');
      if (btnPrev) {
        btnPrev.addEventListener('click', (e) => {
          e.stopPropagation();
          currentModelId = currentModelId > 1 ? currentModelId - 1 : ARROW_MODELS.length;
          syncChangesToMarkdown();
        });
      }

      const btnNext = toolbar.querySelector('.btn-next-model');
      if (btnNext) {
        btnNext.addEventListener('click', (e) => {
          e.stopPropagation();
          currentModelId = currentModelId < ARROW_MODELS.length ? currentModelId + 1 : 1;
          syncChangesToMarkdown();
        });
      }

      // 3. تغيير اللون (Color Selector)
      toolbar.querySelectorAll('.arrow-tb-color-dot').forEach((dot) => {
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          toolbar.querySelectorAll('.arrow-tb-color-dot').forEach((d) => d.classList.remove('active'));
          dot.classList.add('active');
          currentColor = dot.getAttribute('data-color');
          syncChangesToMarkdown();
        });
      });

      const customColorPicker = toolbar.querySelector('.arrow-tb-color-picker-input');
      if (customColorPicker) {
        customColorPicker.addEventListener('input', (e) => {
          currentColor = e.target.value;
          toolbar.querySelectorAll('.arrow-tb-color-dot').forEach((d) => d.classList.remove('active'));
          syncChangesToMarkdown();
        });
      }

      // 4. تغيير الحجم بالقيم المسبقة (Size Presets)
      toolbar.querySelectorAll('.btn-size-preset').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          toolbar.querySelectorAll('.btn-size-preset').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentSize = btn.getAttribute('data-size');
          syncChangesToMarkdown();
        });
      });

      // 5. ميزات التدوير (Rotation Buttons)
      const btnCcw = toolbar.querySelector('.btn-rotate-ccw');
      if (btnCcw) {
        btnCcw.addEventListener('click', (e) => {
          e.stopPropagation();
          currentRotation = ((currentRotation - 90) % 360 + 360) % 360;
          syncChangesToMarkdown();
        });
      }

      const btnCw = toolbar.querySelector('.btn-rotate-cw');
      if (btnCw) {
        btnCw.addEventListener('click', (e) => {
          e.stopPropagation();
          currentRotation = ((currentRotation + 90) % 360 + 360) % 360;
          syncChangesToMarkdown();
        });
      }

      // 6. مقبض التدوير الحر بالماوس واللمس (Corner Rotate Drag Handle)
      const cornerRotateHandle = wrapper.querySelector('.resizer-corner-rotate-handle');
      if (cornerRotateHandle) {
        const startRotateDrag = (startX, startY) => {
          const rect = wrapper.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          const startMouseAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);
          const initialRotation = currentRotation;

          const onRotateMove = (moveEvt) => {
            const currentX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0].clientX);
            const currentY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0].clientY);
            const currentMouseAngle = Math.atan2(currentY - centerY, currentX - centerX) * (180 / Math.PI);
            const angleDiff = currentMouseAngle - startMouseAngle;
            let newDeg = Math.round(initialRotation + angleDiff);
            currentRotation = ((newDeg % 360) + 360) % 360;
            syncChangesToMarkdown();
          };

          const onRotateEnd = () => {
            document.removeEventListener('mousemove', onRotateMove);
            document.removeEventListener('mouseup', onRotateEnd);
            document.removeEventListener('touchmove', onRotateMove);
            document.removeEventListener('touchend', onRotateEnd);
          };

          document.addEventListener('mousemove', onRotateMove);
          document.addEventListener('mouseup', onRotateEnd);
          document.addEventListener('touchmove', onRotateMove, { passive: false });
          document.addEventListener('touchend', onRotateEnd);
        };

        cornerRotateHandle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          startRotateDrag(e.clientX, e.clientY);
        });

        cornerRotateHandle.addEventListener('touchstart', (e) => {
          if (e.touches && e.touches.length === 1) {
            e.preventDefault();
            e.stopPropagation();
            startRotateDrag(e.touches[0].clientX, e.touches[0].clientY);
          }
        }, { passive: false });
      }

      // 7. ميزة التحريك الحر فوق العناصر (Zero-Footprint Free Floating Drag)
      let isFloatingMode = wrapper.classList.contains('is-floating');
      let floatOffsetX = parseFloat(wrapper.style.left) || 0;
      let floatOffsetY = parseFloat(wrapper.style.top) || 0;

      const floatBtn = toolbar.querySelector('.btn-float-toggle');
      if (floatBtn) {
        floatBtn.classList.toggle('active', isFloatingMode);
        floatBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          isFloatingMode = !isFloatingMode;
          wrapper.classList.toggle('is-floating', isFloatingMode);
          floatBtn.classList.toggle('active', isFloatingMode);
          if (anchor) {
            anchor.classList.toggle('is-floating', isFloatingMode);
            if (isFloatingMode) {
              anchor.style.cssText = 'display: inline-block !important; position: relative !important; width: 0 !important; height: 0 !important; line-height: 0 !important; font-size: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; vertical-align: baseline !important; overflow: visible !important;';
              showToast('تم تفعيل التحريك الحر للسهم ✥ — تموضع حر لا يؤثر إطلاقاً على النص المحيط', 'info', 2500);
            } else {
              anchor.style.cssText = 'display: inline !important; width: auto !important; height: auto !important; line-height: inherit !important; font-size: inherit !important; margin: 0 !important; padding: 0 !important; border: 0 !important;';
              wrapper.style.left = '0px';
              wrapper.style.top = '0px';
              floatOffsetX = 0;
              floatOffsetY = 0;
              showToast('تم إرجاع السهم للمحاذاة المنسابة مع النص ✓', 'info', 2000);
            }
          }
          syncChangesToMarkdown();
        });
      }

      const startFloatDrag = (e) => {
        if (!wrapper.classList.contains('is-floating')) return;
        if (e.target.closest('.arrow-resizer-toolbar, .resizer-handle, .resizer-corner-rotate-handle')) return;
        e.preventDefault();
        e.stopPropagation();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const startMouseX = clientX;
        const startMouseY = clientY;
        const initialLeft = floatOffsetX;
        const initialTop = floatOffsetY;

        const onDragMove = (moveEvt) => {
          const curX = moveEvt.touches ? moveEvt.touches[0].clientX : moveEvt.clientX;
          const curY = moveEvt.touches ? moveEvt.touches[0].clientY : moveEvt.clientY;
          floatOffsetX = Math.round(initialLeft + (curX - startMouseX));
          floatOffsetY = Math.round(initialTop + (curY - startMouseY));
          wrapper.style.left = `${floatOffsetX}px`;
          wrapper.style.top = `${floatOffsetY}px`;
          clampToolbar();
        };

        const onDragEnd = () => {
          document.removeEventListener('mousemove', onDragMove);
          document.removeEventListener('mouseup', onDragEnd);
          document.removeEventListener('touchmove', onDragMove);
          document.removeEventListener('touchend', onDragEnd);
          syncChangesToMarkdown();
        };

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
      };

      wrapper.addEventListener('mousedown', startFloatDrag);
      wrapper.addEventListener('touchstart', startFloatDrag, { passive: false });

      // 8. المحاذاة (Alignment)
      toolbar.querySelectorAll('[data-align]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          toolbar.querySelectorAll('[data-align]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentAlign = btn.getAttribute('data-align');
          wrapper.setAttribute('data-align', currentAlign);
          syncChangesToMarkdown();
        });
      });

      // 9. مقابض التحجيم بالسحب (Resize Handles)
      const handles = wrapper.querySelectorAll('.resizer-handle');
      handles.forEach((handle) => {
        const dir = handle.getAttribute('data-dir');
        const onPointerDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          wrapper.classList.add('active');

          const startX = e.clientX || (e.touches && e.touches[0].clientX);
          const startSizeNum = parseInt(currentSize, 10) || 28;

          const onPointerMove = (moveEvt) => {
            const currentX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0].clientX);
            const deltaX = currentX - startX;
            let newSize = startSizeNum;
            if (dir === 'se' || dir === 'ne') {
              newSize = startSizeNum + Math.round(deltaX / 2);
            } else if (dir === 'sw' || dir === 'nw') {
              newSize = startSizeNum - Math.round(deltaX / 2);
            }
            newSize = Math.max(16, Math.min(newSize, 120));
            currentSize = `${newSize}px`;
            arrowEl.style.fontSize = currentSize;
            if (sizeBadge) sizeBadge.textContent = currentSize;
          };

          const onPointerUp = () => {
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);
            syncChangesToMarkdown();
          };

          document.addEventListener('mousemove', onPointerMove);
          document.addEventListener('mouseup', onPointerUp);
          document.addEventListener('touchmove', onPointerMove);
          document.addEventListener('touchend', onPointerUp);
        };

        handle.addEventListener('mousedown', onPointerDown);
        handle.addEventListener('touchstart', onPointerDown, { passive: false });
      });

      // تحويل السهم التفاعلي إلى رمز نصي عادي (Text) في المحرر والمعاينة
      const btnConvertToText = toolbar.querySelector('.btn-convert-to-text');
      if (btnConvertToText) {
        btnConvertToText.addEventListener('click', (e) => {
          e.stopPropagation();
          const char = arrowEl.textContent || '→';
          replaceArrowWithPlainText(arrowId, char, currentModelId);
          if (anchor) {
            const textNode = document.createTextNode(char + ' ');
            anchor.parentNode.replaceChild(textNode, anchor);
          } else {
            wrapper.remove();
          }
          showToast(`تم تحويل السهم إلى رمز نصي عادي: ${char} ✓`, 'success', 2000);
        });
      }

      // 10. حذف السهم (Delete)
      const btnDelete = toolbar.querySelector('.btn-arrow-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteArrowInMarkdown(arrowId, originalRawChar, currentModelId);
          if (anchor) anchor.remove();
          else wrapper.remove();
          showToast('تم حذف السهم ✓', 'info', 1500);
        });
      }
    });
  }

  // تحديث كود السهم داخل نص الماركداون بالمحرر بصيغة مختصرة تشبه الصور
  function updateArrowInMarkdown(arrowId, attrs) {
    if (!arrowId) return;
    const activeEditor = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEditor) return;

    const currentText = activeEditor.value;
    attrs.arrowId = arrowId;
    const newMarkdown = formatArrowToMarkdown(attrs);

    let updatedText = currentText;

    // 1. استبدال وسم HTML القديم <span class="vienix-arrow" ...>
    const regexById = new RegExp(`<span\\s+[^>]*data-arrow-id=["']${arrowId}["'][^>]*>[\\s\\S]*?<\\/span>`, 'i');
    // 2. استبدال صيغة الماركداون التي تحتوي على نفس المعرف
    const mdRegexWithId = new RegExp(`!\\[[^\\]]*\\]\\((?:vienix-)?arrow:[^\\)]*[?&]id=${arrowId}[^\\)]*\\)`, 'i');
    // 3. استبدال صيغة الماركداون المطابقة للموديل
    const mdRegex = new RegExp(`!\\[[^\\]]*\\]\\((?:vienix-)?arrow:${attrs.modelId}\\/[^\\)]*\\)`, 'i');

    if (regexById.test(currentText)) {
      updatedText = currentText.replace(regexById, newMarkdown);
    } else if (mdRegexWithId.test(currentText)) {
      updatedText = currentText.replace(mdRegexWithId, newMarkdown);
    } else if (mdRegex.test(currentText)) {
      updatedText = currentText.replace(mdRegex, newMarkdown);
    } else if (attrs.originalChar && currentText.includes(attrs.originalChar)) {
      updatedText = currentText.replace(attrs.originalChar, newMarkdown);
    }

    if (updatedText !== currentText) {
      recordHistorySnapshot(true);
      editor.value = updatedText;
      if (classicEditor) classicEditor.value = updatedText;
      setChamberContent(activeChamber, updatedText);
      recordHistorySnapshot(true);
    }
  }

  // تحويل السهم التفاعلي في المحرر إلى رمز نصي عادي مجرد
  function replaceArrowWithPlainText(arrowId, char, modelId) {
    const activeEditor = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEditor) return;

    const currentText = activeEditor.value;
    let updatedText = currentText;
    const replacement = (char || '→') + ' ';

    if (arrowId) {
      const regexById = new RegExp(`<span\\s+[^>]*data-arrow-id=["']${arrowId}["'][^>]*>[\\s\\S]*?<\\/span>`, 'i');
      if (regexById.test(currentText)) {
        updatedText = currentText.replace(regexById, replacement);
      }
      const mdRegexWithId = new RegExp(`!\\[[^\\]]*\\]\\((?:vienix-)?arrow:[^\\)]*[?&]id=${arrowId}[^\\)]*\\)`, 'i');
      if (mdRegexWithId.test(currentText)) {
        updatedText = currentText.replace(mdRegexWithId, replacement);
      }
    }
    if (updatedText === currentText && modelId) {
      const mdRegex = new RegExp(`!\\[[^\\]]*\\]\\((?:vienix-)?arrow:${modelId}\\/[^\\)]*\\)`, 'i');
      if (mdRegex.test(currentText)) {
        updatedText = currentText.replace(mdRegex, replacement);
      }
    }

    if (updatedText !== currentText) {
      recordHistorySnapshot(true);
      editor.value = updatedText;
      if (classicEditor) classicEditor.value = updatedText;
      setChamberContent(activeChamber, updatedText);
      recordHistorySnapshot(true);
    }
  }

  // حذف السهم من نص الماركداون بالمحرر
  function deleteArrowInMarkdown(arrowId, originalChar, modelId) {
    const activeEditor = isClassicMode ? (classicEditor || editor) : editor;
    if (!activeEditor) return;

    const currentText = activeEditor.value;
    let updatedText = currentText;

    if (arrowId) {
      const regexById = new RegExp(`\\s*<span\\s+[^>]*data-arrow-id=["']${arrowId}["'][^>]*>[\\s\\S]*?<\\/span>\\s*`, 'i');
      if (regexById.test(currentText)) {
        updatedText = currentText.replace(regexById, ' ');
      }
      const mdRegexWithId = new RegExp(`\\s*!\\[[^\\]]*\\]\\((?:vienix-)?arrow:[^\\)]*[?&]id=${arrowId}[^\\)]*\\)\\s*`, 'i');
      if (mdRegexWithId.test(currentText)) {
        updatedText = currentText.replace(mdRegexWithId, ' ');
      }
    }
    if (updatedText === currentText && modelId) {
      const mdRegex = new RegExp(`\\s*!\\[[^\\]]*\\]\\((?:vienix-)?arrow:${modelId}\\/[^\\)]*\\)\\s*`, 'i');
      if (mdRegex.test(currentText)) {
        updatedText = currentText.replace(mdRegex, ' ');
      }
    }
    if (updatedText === currentText && originalChar && currentText.includes(originalChar)) {
      updatedText = currentText.replace(originalChar, '');
    }

    if (updatedText !== currentText) {
      recordHistorySnapshot(true);
      editor.value = updatedText;
      if (classicEditor) classicEditor.value = updatedText;
      setChamberContent(activeChamber, updatedText);
      recordHistorySnapshot(true);
    }
  }

  // ==========================================================================
  // INJECTED INSIDE MAIN IIFE: PRONUNCIATION & SETTINGS CONTROLLERS
  // ==========================================================================

// ==========================================================================
  // SETTINGS MODAL UI CONTROLLERS
  // ==========================================================================

  // ==========================================================================
  // SETTINGS MODAL UI CONTROLLERS
  // ==========================================================================

  window.openSettingsModal = function () {
    loadSettings();
    syncSettingsUI();
    populateVoicesList();
    calculateStorageUsage();
    if (window.VienixDrive && typeof window.VienixDrive.updateUI === 'function') {
      window.VienixDrive.updateUI();
    }
    const overlay = document.getElementById('settings-modal-overlay');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.closeSettingsModal = function (event) {
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('settings-modal-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  window.switchSettingsTab = function (tabId) {
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.settings-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'settings-panel-' + tabId);
    });
  };

  window.togglePronunciationSubSettings = function (enabled) {
    const sub = document.getElementById('pronunciation-sub-settings');
    if (sub) sub.style.display = enabled ? 'block' : 'none';
  };

  window.setSpeedPreset = function (rate) {
    const slider = document.getElementById('s-speech-rate');
    const label = document.getElementById('s-speech-rate-val');
    if (slider) slider.value = rate;
    if (label) label.textContent = rate + '×';
    window.applySetting('speechRate', String(rate));
    showToast(`تم ضبط سرعة النطق على ${rate}×`, 'info');
  };

  window.updateTargetLangVoiceHint = function (targetLang) {
    populateVoicesList(targetLang);
    const hint = document.getElementById('s-target-lang-hint');
    if (!hint) return;
    if (targetLang === 'auto') {
      hint.textContent = 'الوضع التلقائي: يحاول المتصفح استنتاج لغة كل عبارة تلقائياً بناءً على خصائص الحروف.';
    } else if (targetLang.startsWith('de')) {
      hint.textContent = 'تم اختيار الألمانية: سيتم نطق النصوص والكلمات بصوت ألماني عالي الدقة (Österreichisch/Deutsch).';
    } else {
      hint.textContent = 'تم اختيار ' + targetLang + ': يتم البحث عن أفضل صوت متوافق مثبت بنظامك.';
    }
  };

  function getSystemVoices() {
    if (typeof speechSynthesis === 'undefined') return [];
    return speechSynthesis.getVoices() || [];
  }

  function pickBestVoice(targetLangCode) {
    const voices = getSystemVoices();
    if (!voices || voices.length === 0) return null;

    // 1. Explicit user selection
    if (vienixSettings.voiceName) {
      const userVoice = voices.find(v => v.name === vienixSettings.voiceName);
      if (userVoice) return userVoice;
    }

    if (!targetLangCode) return null;
    const normalized = targetLangCode.toLowerCase().replace('_', '-');
    const prefix = normalized.split('-')[0];

    // 2. Exact match (e.g. 'de-at' === 'de-at')
    let match = voices.find(v => v.lang.toLowerCase().replace('_', '-') === normalized);
    if (match) return match;

    // 3. Language family match (e.g. any 'de-*')
    match = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
    if (match) return match;

    return null;
  }

  function populateVoicesList(optionalLang) {
    const select = document.getElementById('s-voice-select');
    if (!select || typeof speechSynthesis === 'undefined') return;

    const currentTarget = optionalLang || vienixSettings.targetLanguage || 'de-AT';
    const prefix = currentTarget !== 'auto' ? currentTarget.split('-')[0].toLowerCase() : '';

    function fill() {
      const voices = getSystemVoices();
      select.innerHTML = '<option value="">تحديد الصوت تلقائياً حسب اللغة (موصى به)</option>';

      if (voices.length === 0) return;

      // Group: matching target language first, then other voices
      const matching = [];
      const others = [];

      voices.forEach(v => {
        const langLower = (v.lang || '').toLowerCase();
        if (prefix && langLower.startsWith(prefix)) {
          matching.push(v);
        } else {
          others.push(v);
        }
      });

      if (matching.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = `⭐ أصوات متوافقة مع لغة التعلم (${currentTarget})`;
        matching.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = `${v.name} (${v.lang})${v.localService ? ' — محلي' : ''}`;
          optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
      }

      if (others.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'أصوات اللغات الأخرى';
        others.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = `${v.name} (${v.lang})`;
          optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
      }

      if (vienixSettings.voiceName) {
        select.value = vienixSettings.voiceName;
      }
    }

    fill();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = fill;
    }
  }

  function calculateStorageUsage() {
    if (window.VienixStorage && typeof window.VienixStorage.updateSettingsUI === 'function') {
      window.VienixStorage.updateSettingsUI();
      return;
    }
    const el = document.getElementById('s-storage-used');
    if (!el) return;
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        total += (key.length + (localStorage.getItem(key) || '').length) * 2;
      }
    } catch (e) {}
    const kb = (total / 1024).toFixed(1);
    el.textContent = `${kb} KB مستخدم`;
  }

  function syncSettingsUI() {
    const s = vienixSettings;

    // Comfort reading mode
    const comfortChk = document.getElementById('s-comfort-reading-mode');
    if (comfortChk) comfortChk.checked = s.comfortReadingMode !== false;

    // Theme
    const themeRadio = document.querySelector(`input[name="s-theme"][value="${s.theme}"]`);
    if (themeRadio) themeRadio.checked = true;

    // Font sizes and font selector
    const previewFontSlider = document.getElementById('s-preview-font-size');
    if (previewFontSlider) previewFontSlider.value = s.previewFontSize || '16';
    const previewFontVal = document.getElementById('s-preview-font-size-val');
    if (previewFontVal) previewFontVal.textContent = (s.previewFontSize || '16') + 'px';

    const previewFontSelect = document.getElementById('s-preview-font');
    if (previewFontSelect) previewFontSelect.value = s.previewFont || 'system';

    const editorFontSlider = document.getElementById('s-editor-font-size');
    if (editorFontSlider) editorFontSlider.value = s.editorFontSize || '15';
    const editorFontVal = document.getElementById('s-editor-font-size-val');
    if (editorFontVal) editorFontVal.textContent = (s.editorFontSize || '15') + 'px';

    // Accent color
    const accentPicker = document.getElementById('s-accent-color');
    if (accentPicker) accentPicker.value = s.accentColor || '#6366f1';
    const accentLabel = document.getElementById('s-accent-color-label');
    if (accentLabel) accentLabel.textContent = s.accentColor || '#6366f1';

    // Editor settings
    const wordWrap = document.getElementById('s-word-wrap');
    if (wordWrap) wordWrap.checked = s.wordWrap !== false;
    const preserveBlankLines = document.getElementById('s-preserve-blank-lines');
    if (preserveBlankLines) preserveBlankLines.checked = s.preserveBlankLines !== false;
    const autoBrackets = document.getElementById('s-auto-brackets');
    if (autoBrackets) autoBrackets.checked = s.autoBrackets !== false;
    const editorFont = document.getElementById('s-editor-font');
    if (editorFont) editorFont.value = s.editorFont || "'Fira Code', monospace";
    const textDirRadio = document.querySelector(`input[name="s-text-dir"][value="${s.textDirection || 'rtl'}"]`);
    if (textDirRadio) textDirRadio.checked = true;
    const autoSave = document.getElementById('s-auto-save-interval');
    if (autoSave) autoSave.value = s.autoSaveInterval || '5000';

    // Pronunciation settings (معطل افتراضياً للزائر لأول مرة إلا إذا قام بتفعيله)
    const pronEnabled = document.getElementById('s-pronunciation-enabled');
    const isPronOn = s.pronunciationEnabled === true;
    if (pronEnabled) pronEnabled.checked = isPronOn;
    togglePronunciationSubSettings(isPronOn);

    const targetLang = document.getElementById('s-target-lang');
    if (targetLang) targetLang.value = s.targetLanguage || 'auto';

    const rateSlider = document.getElementById('s-speech-rate');
    if (rateSlider) rateSlider.value = s.speechRate || '0.8';
    const rateVal = document.getElementById('s-speech-rate-val');
    if (rateVal) rateVal.textContent = (s.speechRate || '0.8') + '×';

    const pitchSlider = document.getElementById('s-speech-pitch');
    if (pitchSlider) pitchSlider.value = s.speechPitch || '1.0';
    const pitchVal = document.getElementById('s-speech-pitch-val');
    if (pitchVal) pitchVal.textContent = s.speechPitch || '1.0';

    const volSlider = document.getElementById('s-speech-volume');
    if (volSlider) volSlider.value = s.speechVolume || '1.0';
    const volVal = document.getElementById('s-speech-volume-val');
    if (volVal) volVal.textContent = Math.round((s.speechVolume || 1) * 100) + '%';

    const interactRadio = document.querySelector(`input[name="s-interact-mode"][value="${s.interactionMode || 'mixed'}"]`);
    if (interactRadio) interactRadio.checked = true;

    const dotted = document.getElementById('s-dotted-underline');
    if (dotted) dotted.checked = s.dottedUnderline !== false;

    const keepSpeaking = document.getElementById('s-keep-speaking-on-click');
    if (keepSpeaking) keepSpeaking.checked = !!s.keepSpeakingOnClick;

    const wordBubble = document.getElementById('s-word-translation-bubble');
    if (wordBubble) wordBubble.checked = s.wordTranslationBubble !== false;

    const inlineTrans = document.getElementById('s-inline-phrase-trans');
    if (inlineTrans) inlineTrans.checked = s.inlinePhraseTranslation !== false;

    const globalTrans = document.getElementById('s-global-bilingual-trans');
    if (globalTrans) globalTrans.checked = s.globalBilingualTranslation !== false;

    const ql1 = document.getElementById('s-quick-lang-1');
    if (ql1) ql1.value = s.quickLang1 || 'de-AT';
    const ql2 = document.getElementById('s-quick-lang-2');
    if (ql2) ql2.value = s.quickLang2 || 'en-US';

    const syncWords = document.getElementById('s-sync-word-highlight');
    if (syncWords) syncWords.checked = !!s.syncWordHighlight;

    // API keys
    const googleKey = document.getElementById('s-google-tts-key');
    if (googleKey) googleKey.value = s.googleTtsKey || '';
    const groqKey = document.getElementById('s-groq-key');
    if (groqKey) groqKey.value = s.groqKey || '';
  }

  window.exportSettings = function () {
    const blob = new Blob([JSON.stringify(vienixSettings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vienix-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم تصدير الإعدادات بنجاح ✅', 'info');
  };

  window.resetAllSettings = function () {
    if (!confirm('هل أنت متأكد؟ سيتم مسح جميع الإعدادات المحفوظة وإعادتها للقيم الافتراضية.')) return;
    vienixSettings = Object.assign({}, SETTINGS_DEFAULTS);
    saveSettings();
    syncSettingsUI();
    applyAllSettings();
    renderMarkdown();
    showToast('تم إعادة ضبط جميع الإعدادات ✅', 'info');
  };

  // ==========================================================================
  // PRONUNCIATION ENGINE (محرك النطق الصوتي الفائق)
  // ==========================================================================

  function detectLanguage(text) {
    if (!text || text.trim().length === 0) return null;
    const cleaned = text.replace(/[\d\s\p{P}\p{S}]/gu, '');
    if (cleaned.length === 0) return null;

    // Arabic check
    const arabicChars = (cleaned.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    if (arabicChars / cleaned.length > 0.3) return 'ar-SA';

    // Distinct non-Latin alphabets
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(cleaned)) return 'ja-JP';
    if (/[\uAC00-\uD7AF]/.test(cleaned)) return 'ko-KR';
    if (/[\u4E00-\u9FFF]/.test(cleaned)) return 'zh-CN';
    if (/[\u0400-\u04FF]/.test(cleaned)) return 'ru-RU';
    if (/[\u0370-\u03FF]/.test(cleaned)) return 'el-GR';

    // If target language is explicitly set (e.g. de-AT), prioritize it for Latin words
    if (vienixSettings.targetLanguage && vienixSettings.targetLanguage !== 'auto') {
      return vienixSettings.targetLanguage;
    }

    // Smart heuristic patterns for Latin scripts
    const lower = text.toLowerCase();
    if (/[äöüß]/.test(lower) || /\b(und|der|die|das|ist|ein|eine|einer|für|mit|auf|nicht|ich|wir|sie|auch|haben|werden|kann|bitte|danke|guten|morgen|tag|abend|hallo|tschüss|ja|nein|sehr|gut|wie|geht|zeit|deutsch|deutschland|österreich|wien)\b/i.test(lower)) {
      return 'de-AT';
    }
    if (/[éèêëàâçôùûïî]/.test(lower) || /\b(le|la|les|des|est|une|pour|avec|dans|sur|que|pas|sont|cette|nous|vous|ils|elle|bonjour|merci|oui|non)\b/i.test(lower)) {
      return 'fr-FR';
    }
    if (/[ñ¿¡áéíóú]/.test(lower) || /\b(el|los|las|una|del|por|con|para|como|pero|todo|esta|más|sin|muy|entre|hola|gracias|buenos|días)\b/i.test(lower)) {
      return 'es-ES';
    }
    if (/[àèìòùé]/.test(lower) || /\b(il|gli|una|del|per|con|che|non|sono|come|anche|questo|della|nella|tutto|ciao|grazie)\b/i.test(lower)) {
      return 'it-IT';
    }
    if (/[ãõçáéíóú]/.test(lower) || /\b(que|não|com|para|uma|dos|por|mais|como|sua|ele|tem|ser|está|foi|olá|obrigado)\b/i.test(lower)) {
      return 'pt-BR';
    }
    if (/[çşğıöü]/.test(lower) && /[ıİğĞ]/.test(text)) {
      return 'tr-TR';
    }

    return 'en-US';
  }

  function showSpeechWarningToast(msg) {
    let existing = document.getElementById('vienix-speech-alert');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'vienix-speech-alert';
    toast.className = 'speech-alert-toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <span>${msg}</span>
      <button type="button" class="speech-alert-close" onclick="this.parentElement.remove()" title="إغلاق">✕</button>
    `;
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

    const cleanSpeech = text.replace(/[*_#`~[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanSpeech) return null;

    window._isPronunciationSpeaking = true;

    try {
      // Direct cancel of previous speech
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(cleanSpeech);
      utterance.lang = lang;
      utterance.rate = Math.max(0.5, Math.min(2.0, parseFloat(callbacks.rateOverride || vienixSettings.speechRate) || 0.8));
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
  }

  function stopAllPronunciationSpeech() {
    let wasSpeaking = false;
    if (window._isPronunciationSpeaking) wasSpeaking = true;
    window._isPronunciationSpeaking = false;
    if (typeof speechSynthesis !== 'undefined') {
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        wasSpeaking = true;
      }
      speechSynthesis.cancel();
    }
    if (window._activeUtterances && window._activeUtterances.length > 0) {
      wasSpeaking = true;
      window._activeUtterances = [];
    }
    const speakingEls = document.querySelectorAll('.pronunciation-speaker-btn.speaking, .pronunciation-word.speaking, #s-btn-test-pron.speaking');
    if (speakingEls.length > 0) {
      wasSpeaking = true;
      speakingEls.forEach(el => el.classList.remove('speaking'));
    }
    document.querySelectorAll('.pronunciation-word.word-sync-active').forEach(w => {
      wasSpeaking = true;
      w.classList.remove('word-sync-active');
    });
    return wasSpeaking;
  }
  window.stopAllPronunciationSpeech = stopAllPronunciationSpeech;

  window.speakPronunciation = function (text, btnElement, lang) {
    if (!text) return;
    if (btnElement && btnElement.classList.contains('speaking')) {
      stopAllPronunciationSpeech();
      showToast('تم إيقاف النطق ⏹️', 'info');
      return;
    }
    const resolvedLang = lang || (vienixSettings.targetLanguage !== 'auto' ? vienixSettings.targetLanguage : detectLanguage(text));
    const phraseWrapper = btnElement ? btnElement.closest('.pronunciation-phrase') : null;
    const wordSpans = phraseWrapper ? Array.from(phraseWrapper.querySelectorAll('.pronunciation-word')) : [];

    let wordOffsets = [];
    const cleanSpeech = text.replace(/[*_#`~[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (vienixSettings.syncWordHighlight && wordSpans.length > 0) {
      let searchPos = 0;
      wordOffsets = wordSpans.map(span => {
        const w = (span.getAttribute('data-word') || span.textContent).trim();
        const idx = cleanSpeech.toLowerCase().indexOf(w.toLowerCase(), searchPos);
        if (idx !== -1) {
          searchPos = idx + w.length;
          return { span, start: idx, end: idx + w.length };
        }
        return { span, start: -1, end: -1 };
      });
    }

    let wordSyncTimer = null;
    let hasNativeWordBoundaries = false;

    const clearWordSync = () => {
      if (wordSyncTimer) {
        clearTimeout(wordSyncTimer);
        wordSyncTimer = null;
      }
      wordSpans.forEach(w => w.classList.remove('word-sync-active'));
    };

    const activateWordAt = (index) => {
      if (index < 0 || index >= wordSpans.length) return;
      wordSpans.forEach((w, i) => {
        if (i === index) w.classList.add('word-sync-active');
        else w.classList.remove('word-sync-active');
      });
    };

    const runTimedFallbackSync = () => {
      if (wordSpans.length === 0 || !vienixSettings.syncWordHighlight) return;
      const rate = Math.max(0.5, Math.min(2.0, parseFloat(vienixSettings.speechRate) || 0.8));
      let currentWordIdx = 0;
      activateWordAt(0);

      const stepNext = () => {
        if (hasNativeWordBoundaries) return;
        if (currentWordIdx >= wordSpans.length - 1) return;
        const wordText = wordSpans[currentWordIdx].textContent.trim();
        const duration = Math.max(220, Math.round((wordText.length * 68 + 120) / rate));
        wordSyncTimer = setTimeout(() => {
          if (hasNativeWordBoundaries) return;
          currentWordIdx++;
          activateWordAt(currentWordIdx);
          stepNext();
        }, duration);
      };
      stepNext();
    };

    speakText(text, resolvedLang, {
      onStart: () => {
        clearWordSync();
        if (btnElement) btnElement.classList.add('speaking');
        if (vienixSettings.syncWordHighlight && wordSpans.length > 0) {
          // If no native boundary events arrive within 70ms, start smooth timeline sync
          wordSyncTimer = setTimeout(() => {
            if (!hasNativeWordBoundaries) {
              runTimedFallbackSync();
            }
          }, 70);
        }
      },
      onWordBoundary: (charIndex, charLength) => {
        if (!vienixSettings.syncWordHighlight || wordOffsets.length === 0) return;
        hasNativeWordBoundaries = true;
        if (wordSyncTimer) {
          clearTimeout(wordSyncTimer);
          wordSyncTimer = null;
        }
        let match = wordOffsets.find(item => item.start !== -1 && charIndex >= item.start && charIndex < item.end);
        if (!match) {
          let minDiff = Infinity;
          wordOffsets.forEach(item => {
            if (item.start !== -1) {
              const diff = Math.abs(item.start - charIndex);
              if (diff < minDiff) {
                minDiff = diff;
                match = item;
              }
            }
          });
        }
        if (match && match.span) {
          wordSpans.forEach(w => {
            if (w !== match.span) w.classList.remove('word-sync-active');
          });
          match.span.classList.add('word-sync-active');
        }
      },
      onEnd: () => {
        clearWordSync();
        if (btnElement) btnElement.classList.remove('speaking');
      },
      onError: () => {
        clearWordSync();
        if (btnElement) btnElement.classList.remove('speaking');
      }
    });
  };

  
  // ==========================================================================
  // WORD TRANSLATION BUBBLE (فقاعة الترجمة الفورية الهجينة 1 + 3 بدون API)
  // ==========================================================================
  let activeTransBubble = null;
  let activeTransAbortController = null;

  function closeWordTranslationBubble() {
    if (activeTransAbortController) {
      try { activeTransAbortController.abort(); } catch (_) {}
      activeTransAbortController = null;
    }
    if (activeTransBubble && activeTransBubble.parentNode) {
      activeTransBubble.parentNode.removeChild(activeTransBubble);
    }
    activeTransBubble = null;
  }
  window.closeWordTranslationBubble = closeWordTranslationBubble;

  // 1. Chrome On-Device AI Translation (3)
  async function translateOnDevice(word, sourceLang) {
    try {
      const src = sourceLang ? sourceLang.split('-')[0].toLowerCase() : 'en';
      if (typeof window !== 'undefined' && window.translation && typeof window.translation.createTranslator === 'function') {
        const can = await window.translation.canTranslate({ sourceLanguage: src, targetLanguage: 'ar' });
        if (can === 'readily' || can === 'after-download') {
          const translator = await window.translation.createTranslator({ sourceLanguage: src, targetLanguage: 'ar' });
          const res = await translator.translate(word);
          if (res && res.trim() && res.trim().toLowerCase() !== word.toLowerCase()) {
            return { text: res.trim(), source: 'device' };
          }
        }
      }
      if (typeof window !== 'undefined' && window.ai && window.ai.translator) {
        const can = await window.ai.translator.capabilities();
        if (can && can.available !== 'no') {
          const tr = await window.ai.translator.create({ sourceLanguage: src, targetLanguage: 'ar' });
          const res = await tr.translate(word);
          if (res && res.trim()) {
            return { text: res.trim(), source: 'device' };
          }
        }
      }
    } catch (_) {}
    return null;
  }

  // 2. Free Public Translation Endpoint (1 - No API Key: Google GTX + Lingva + MyMemory)
  async function translateViaFreeService(word, sourceLang, signal) {
    const src = sourceLang ? sourceLang.split('-')[0].toLowerCase() : 'auto';

    // A. Google GTX Free Endpoint (High quality, no key)
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=ar&dt=t&q=${encodeURIComponent(word)}`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data[0] && data[0][0] && data[0][0][0]) {
          const txt = data[0][0][0].trim();
          if (txt && /[\u0600-\u06FF]/.test(txt)) {
            return { text: txt, source: 'cloud' };
          }
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
    }

    // B. Lingva Open Mirror Fallback
    try {
      const lingvaUrl = `https://lingva.ml/api/v1/${src}/ar/${encodeURIComponent(word)}`;
      const res = await fetch(lingvaUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        if (data && data.translation && data.translation.trim() && /[\u0600-\u06FF]/.test(data.translation)) {
          return { text: data.translation.trim(), source: 'cloud' };
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
    }

    // C. MyMemory Open Translation Fallback
    try {
      const myMemoryPair = src === 'auto' ? 'en|ar' : `${src}|ar`;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word.slice(0, 500))}&langpair=${myMemoryPair}`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = await res.json();
        const arabicRegex = /[\u0600-\u06FF]/;
        let candidates = [];
        if (data.responseData && data.responseData.translatedText) {
          candidates.push(data.responseData.translatedText);
        }
        if (Array.isArray(data.matches)) {
          data.matches.sort((a, b) => (b.quality || 0) - (a.quality || 0));
          data.matches.forEach(m => { if (m.translation) candidates.push(m.translation); });
        }
        for (let c of candidates) {
          let clean = c
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&#\d+;/g, '')
            .trim();
          if (clean && arabicRegex.test(clean) && clean.toLowerCase() !== word.toLowerCase()) {
            return { text: clean, source: 'cloud' };
          }
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
    }

    return null;
  }

  // 3. Combined Hybrid Waterfall Translation
  async function fetchWordTranslation(word, sourceLang, signal) {
    const cleanWord = (word || '').trim();
    if (!cleanWord) return null;
    const src = sourceLang ? sourceLang.split('-')[0].toLowerCase() : 'auto';
    const cacheKey = `vienix_trans_${src}_${cleanWord.toLowerCase().slice(0, 100)}`;

    // Step 1: Check localStorage Cache (0ms, 100% offline)
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        return { text: cached, source: 'cache' };
      }
    } catch (_) {}

    // Step 2: Chrome On-Device Local AI
    const deviceRes = await translateOnDevice(cleanWord, src);
    if (deviceRes && deviceRes.text) {
      try { localStorage.setItem(cacheKey, deviceRes.text); } catch (_) {}
      return deviceRes;
    }

    // Step 3: Free Public Cloud Service (No API Key)
    const cloudRes = await translateViaFreeService(cleanWord, src, signal);
    if (cloudRes && cloudRes.text) {
      try { localStorage.setItem(cacheKey, cloudRes.text); } catch (_) {}
      return cloudRes;
    }

    return null;
  }

  // 4. Show Floating Word Translation Bubble
  function showWordTranslationBubble(wordElement, word, langCode) {
    if (vienixSettings.wordTranslationBubble === false) return;
    closeWordTranslationBubble();

    const rect = wordElement.getBoundingClientRect();
    const bubble = document.createElement('div');
    bubble.className = 'word-trans-bubble';
    bubble.id = 'word-trans-bubble';
    bubble.setAttribute('dir', 'rtl');

    const langFlagMap = {
      de: '🇩🇪', en: '🇺🇸', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹',
      tr: '🇹🇷', ru: '🇷🇺', ja: '🇯🇵', zh: '🇨🇳', ko: '🇰🇷',
      pt: '🇧🇷', nl: '🇳🇱', sv: '🇸🇪', pl: '🇵🇱'
    };
    const prefix = (langCode || '').split('-')[0].toLowerCase();
    const flag = langFlagMap[prefix] || '🌐';

    bubble.innerHTML = `
      <div class="wtb-arrow"></div>
      <div class="wtb-header">
        <div class="wtb-term-row" dir="ltr">
          <span class="wtb-flag">${flag}</span>
          <span class="wtb-word">${escapeHtml(word)}</span>
        </div>
        <div class="wtb-actions" dir="ltr">
          <button type="button" class="wtb-slow-btn" id="wtb-btn-slow" title="استمع ببطء (0.6×)">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <span>بطيء</span>
          </button>
          <button type="button" class="wtb-close-btn" id="wtb-btn-close" aria-label="إغلاق"><svg class="ui-icon" style="margin:0;" viewBox="0 0 24 24" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
      </div>
      <div class="wtb-body">
        <div class="wtb-loading" id="wtb-loading">
          <span class="wtb-spinner"></span>
          <span>جارٍ استحضار المعنى...</span>
        </div>
        <div class="wtb-content" id="wtb-content" style="display:none;">
          <div class="wtb-arabic" id="wtb-arabic-text"></div>
        </div>
      </div>
    `;

    document.body.appendChild(bubble);
    activeTransBubble = bubble;

    // Slow speech button
    const slowBtn = bubble.querySelector('#wtb-btn-slow');
    if (slowBtn) {
      slowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speakText(word, langCode, { rateOverride: 0.6 });
        slowBtn.classList.add('playing');
        setTimeout(() => slowBtn.classList.remove('playing'), 1200);
      });
    }

    // Close button
    const closeBtn = bubble.querySelector('#wtb-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeWordTranslationBubble();
      });
    }

    // Measure & calculate coordinates
    const bubbleRect = bubble.getBoundingClientRect();
    const margin = 10;
    let top = rect.top - bubbleRect.height - 10;

    if (top < margin) {
      top = rect.bottom + 10;
      bubble.classList.add('arrow-top');
    } else {
      bubble.classList.add('arrow-bottom');
    }

    let left = rect.left + (rect.width / 2) - (bubbleRect.width / 2);
    if (left < margin) left = margin;
    if (left + bubbleRect.width > window.innerWidth - margin) {
      left = window.innerWidth - margin - bubbleRect.width;
    }

    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;

    const arrow = bubble.querySelector('.wtb-arrow');
    if (arrow) {
      const arrowLeft = rect.left + (rect.width / 2) - left;
      arrow.style.left = `${Math.max(14, Math.min(bubbleRect.width - 14, arrowLeft))}px`;
    }

    // Fetch Translation
    const abortController = new AbortController();
    activeTransAbortController = abortController;

    fetchWordTranslation(word, langCode, abortController.signal).then(res => {
      if (!activeTransBubble || activeTransBubble !== bubble) return;
      const loadingEl = bubble.querySelector('#wtb-loading');
      const contentEl = bubble.querySelector('#wtb-content');
      const arabicEl = bubble.querySelector('#wtb-arabic-text');

      if (loadingEl) loadingEl.style.display = 'none';

      if (res && res.text) {
        if (contentEl) contentEl.style.display = 'block';
        if (arabicEl) arabicEl.textContent = res.text;
      } else {
        if (contentEl) contentEl.style.display = 'block';
        if (arabicEl) {
          arabicEl.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">تعذر جلب الترجمة الفورية حالياً.</span>';
        }
      }
    }).catch(err => {
      if (err && err.name === 'AbortError') return;
      const loadingEl = bubble.querySelector('#wtb-loading');
      const contentEl = bubble.querySelector('#wtb-content');
      const arabicEl = bubble.querySelector('#wtb-arabic-text');
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
      if (arabicEl) {
        arabicEl.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">تعذر الاتصال بخدمة الترجمة.</span>';
      }
    });
  }

  window.showWordTranslationBubble = showWordTranslationBubble;

  // Auto-dismiss translation bubble on outside tap / click, scroll, or Escape
  document.addEventListener('pointerdown', function (e) {
    if (!activeTransBubble) return;
    if (e.target.closest('#word-trans-bubble') || e.target.closest('.pronunciation-word')) {
      return;
    }
    closeWordTranslationBubble();
  }, true);

  document.addEventListener('touchstart', function (e) {
    if (!activeTransBubble) return;
    if (e.target.closest('#word-trans-bubble') || e.target.closest('.pronunciation-word')) {
      return;
    }
    closeWordTranslationBubble();
  }, { passive: true, capture: true });

  window.addEventListener('scroll', function () {
    if (activeTransBubble) closeWordTranslationBubble();
  }, { passive: true, capture: true });

  document.addEventListener('scroll', function () {
    if (activeTransBubble) closeWordTranslationBubble();
  }, { passive: true, capture: true });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeTransBubble) {
      closeWordTranslationBubble();
    }
  });

  window.speakWord = function (word, wordElement, lang) {
    if (!word) return;
    if (wordElement && wordElement.classList.contains('speaking')) {
      stopAllPronunciationSpeech();
      closeWordTranslationBubble();
      showToast('تم إيقاف النطق ⏹️', 'info');
      return;
    }
    const resolvedLang = lang || (vienixSettings.targetLanguage !== 'auto' ? vienixSettings.targetLanguage : detectLanguage(word));

    // Show instant translation bubble (Hybrid 1+3)
    if (wordElement && vienixSettings.wordTranslationBubble !== false) {
      showWordTranslationBubble(wordElement, word, resolvedLang);
    }
    speakText(word, resolvedLang, {
      onStart: () => {
        if (wordElement) wordElement.classList.add('speaking');
      },
      onEnd: () => {
        if (wordElement) wordElement.classList.remove('speaking');
      },
      onError: () => {
        if (wordElement) wordElement.classList.remove('speaking');
      }
    });
  };

  window.testPronunciation = function () {
    const testSamplePhrases = {
      'de-AT': 'Servus! Willkommen beim Vienix Markdown Editor in Österreich.',
      'de-DE': 'Guten Tag und herzlich willkommen zum Vienix Markdown Editor.',
      'de-CH': 'Grüezi und herzlich willkommen im Vienix Editor.',
      'en-US': 'Welcome to Vienix Markdown Editor! Practice your pronunciation.',
      'en-GB': 'Welcome to Vienix Markdown Editor! Practice your pronunciation.',
      'fr-FR': "Bienvenue dans l'éditeur Vienix Markdown! Bonne pratique.",
      'es-ES': '¡Bienvenido al editor Vienix Markdown! Practica tu pronunciación.',
      'it-IT': "Benvenuto nell'editor Vienix Markdown! Buona pratica.",
      'tr-TR': 'Vienix Markdown Editörüne hoş geldiniz! Telaffuz çalışın.',
      'ru-RU': 'Добро пожаловать в Vienix Markdown Editor! Тренируйте произношение.',
      'ja-JP': 'Vienixマークダウンエディターへようこそ！発音を練習しましょう。',
      'zh-CN': '欢迎使用Vienix Markdown编辑器！练习您的发音。',
      'ko-KR': '비닉스 마크다운 에디터에 오신 것을 환영합니다! 발음을 연습해 보세요.',
      'pt-BR': 'Bem-vindo ao editor Vienix Markdown! Pratique sua pronúncia.',
      'nl-NL': 'Welkom bij Vienix Markdown Editor! Oefen je uitspraak.',
      'sv-SE': 'Välkommen till Vienix Markdown Editor! Träna ditt uttal.',
      'pl-PL': 'Witamy w edytorze Vienix Markdown! Ćwicz swoją wymowę.'
    };

    const target = vienixSettings.targetLanguage || 'de-AT';
    const text = testSamplePhrases[target] || testSamplePhrases['de-AT'] || 'Welcome to Vienix Editor!';
    const btn = document.getElementById('s-btn-test-pron');
    const statusEl = document.getElementById('s-test-status');

    if (btn && btn.classList.contains('speaking')) {
      stopAllPronunciationSpeech();
      if (statusEl) statusEl.textContent = '⏹️ تم إيقاف الصوت التجريبي';
      return;
    }

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = '🔊 جارٍ النطق: "' + text + '"';
    }

    speakText(text, target === 'auto' ? null : target, {
      onStart: () => {
        if (btn) btn.classList.add('speaking');
        if (statusEl) statusEl.textContent = '🔊 يتحدث الآن: "' + text + '"';
      },
      onEnd: () => {
        if (btn) btn.classList.remove('speaking');
        if (statusEl) statusEl.textContent = '✅ اكتمل النطق بنجاح!';
        setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
      },
      onError: (err) => {
        if (btn) btn.classList.remove('speaking');
        if (statusEl) statusEl.textContent = '⚠️ لم يتمكن المتصفح من تشغيل الصوت في هذه اللحظة.';
      }
    });
  };

  // ==========================================================================
  // PRONUNCIATION — Preview Processing (Post-render hook)
  // ==========================================================================

  
  // ==========================================================================
  // PRONUNCIATION SPEAKER CONTEXT MENU (قائمة خيارات زر الماوس الأيمن)
  // ==========================================================================

  let activePronContextMenu = null;

  function closePronunciationContextMenu() {
    if (activePronContextMenu && activePronContextMenu.parentNode) {
      activePronContextMenu.parentNode.removeChild(activePronContextMenu);
    }
    activePronContextMenu = null;
  }

  function openPronunciationContextMenu(event, text, detectedLang, triggerElement) {
    closePronunciationContextMenu();

    const menu = document.createElement('div');
    menu.className = 'pronunciation-context-menu';
    menu.id = 'active-pronunciation-context-menu';

    const langMetaMap = {
      'de-AT': { code: 'de-AT', flag: '🇦🇹', shortName: 'DE', label: 'الألمانية (AT)' },
      'de-DE': { code: 'de-DE', flag: '🇩🇪', shortName: 'DE', label: 'الألمانية (DE)' },
      'de-CH': { code: 'de-CH', flag: '🇨🇭', shortName: 'CH', label: 'الألمانية (CH)' },
      'en-US': { code: 'en-US', flag: '🇺🇸', shortName: 'EN', label: 'الإنجليزية (US)' },
      'en-GB': { code: 'en-GB', flag: '🇬🇧', shortName: 'EN', label: 'الإنجليزية (UK)' },
      'fr-FR': { code: 'fr-FR', flag: '🇫🇷', shortName: 'FR', label: 'الفرنسية' },
      'es-ES': { code: 'es-ES', flag: '🇪🇸', shortName: 'ES', label: 'الإسبانية' },
      'it-IT': { code: 'it-IT', flag: '🇮🇹', shortName: 'IT', label: 'الإيطالية' },
      'tr-TR': { code: 'tr-TR', flag: '🇹🇷', shortName: 'TR', label: 'التركية' },
      'ru-RU': { code: 'ru-RU', flag: '🇷🇺', shortName: 'RU', label: 'الروسية' },
      'ja-JP': { code: 'ja-JP', flag: '🇯🇵', shortName: 'JA', label: 'اليابانية' },
      'zh-CN': { code: 'zh-CN', flag: '🇨🇳', shortName: 'ZH', label: 'الصينية' },
      'ko-KR': { code: 'ko-KR', flag: '🇰🇷', shortName: 'KO', label: 'الكورية' },
      'pt-BR': { code: 'pt-BR', flag: '🇧🇷', shortName: 'PT', label: 'البرتغالية' },
      'nl-NL': { code: 'nl-NL', flag: '🇳🇱', shortName: 'NL', label: 'الهولندية' },
      'sv-SE': { code: 'sv-SE', flag: '🇸🇪', shortName: 'SV', label: 'السويدية' },
      'pl-PL': { code: 'pl-PL', flag: '🇵🇱', shortName: 'PL', label: 'البولندية' }
    };

    function getLangMeta(code) {
      if (!code) return { code: 'en-US', flag: '🌐', shortName: 'EN', label: 'English' };
      if (langMetaMap[code]) return langMetaMap[code];
      const prefix = code.split('-')[0].toLowerCase();
      for (const k in langMetaMap) {
        if (k.toLowerCase().startsWith(prefix)) return langMetaMap[k];
      }
      return { code: code, flag: '🌐', shortName: code.slice(0, 2).toUpperCase(), label: code };
    }

    const cleanSnippet = text.length > 28 ? text.substring(0, 26) + '...' : text;
    const currentRate = parseFloat(vienixSettings.speechRate) || 0.8;
    let activeLang = detectedLang || vienixSettings.targetLanguage || 'de-AT';
    const isPaused = typeof speechSynthesis !== 'undefined' && speechSynthesis.paused;

    const q1Code = vienixSettings.quickLang1 || 'de-AT';
    const q2Code = vienixSettings.quickLang2 || 'en-US';
    const q1Meta = getLangMeta(q1Code);
    const q2Meta = getLangMeta(q2Code);
    const activeMeta = getLangMeta(activeLang);

    menu.innerHTML = `
      <div class="pcm-header">
        <span class="pcm-phrase-preview" title="${text}">${cleanSnippet}</span>
        <div class="pcm-header-bar">
          <span class="pcm-badge" id="pcm-active-badge"><svg class="ui-icon" viewBox="0 0 24 24" width="14" height="14"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> ${activeMeta.flag} ${activeMeta.label}</span>
          <div class="pcm-quick-group" title="اختصارات التبديل السريع للغات">
            <button type="button" class="pcm-quick-btn ${activeLang === q1Code ? 'active' : ''}" id="pcm-qbtn-1" data-lang="${q1Code}" title="تعيين ونطق فوري كـ ${q1Meta.label}">
              <span class="pcm-qflag">${q1Meta.flag}</span>
              <span class="pcm-qcode">${q1Meta.shortName}</span>
            </button>
            <button type="button" class="pcm-quick-btn ${activeLang === q2Code ? 'active' : ''}" id="pcm-qbtn-2" data-lang="${q2Code}" title="تعيين ونطق فوري كـ ${q2Meta.label}">
              <span class="pcm-qflag">${q2Meta.flag}</span>
              <span class="pcm-qcode">${q2Meta.shortName}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="pcm-section-label">التحكم في النطق</div>
      <button type="button" class="pcm-item" id="pcm-play">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        <span>تشغيل / إعادة نطق</span>
      </button>

      <button type="button" class="pcm-item" id="pcm-pause-resume">
        ${isPaused
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>استئناف النطق (Resume)</span>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg><span>إيقاف مؤقت (Pause)</span>'
        }
      </button>

      <button type="button" class="pcm-item danger" id="pcm-stop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
        <span>إيقاف تام (Stop)</span>
      </button>

      <div class="pcm-divider"></div>

      <div class="pcm-section-label">سرعة التدرب الصوتية</div>
      <div class="pcm-speed-grid">
        <button type="button" class="pcm-speed-btn ${Math.abs(currentRate - 0.75) < 0.03 ? 'active' : ''}" data-speed="0.75" title="وضع التدرب البطيء لسماع المخارج بدقة">0.75×</button>
        <button type="button" class="pcm-speed-btn ${Math.abs(currentRate - 0.85) < 0.03 ? 'active' : ''}" data-speed="0.85" title="سرعة متوسطة واضحة">0.85×</button>
        <button type="button" class="pcm-speed-btn ${Math.abs(currentRate - 1.0) < 0.03 ? 'active' : ''}" data-speed="1.0" title="السرعة الطبيعية">1.0×</button>
        <button type="button" class="pcm-speed-btn ${Math.abs(currentRate - 1.25) < 0.03 ? 'active' : ''}" data-speed="1.25" title="سرعة سريعة">1.25×</button>
      </div>

      <div class="pcm-divider"></div>

      <button type="button" class="pcm-item" id="pcm-copy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>نسخ العبارة</span>
      </button>

      <button type="button" class="pcm-item" id="pcm-settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        <svg class="ui-icon" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg><span>إعدادات النطق المتقدمة</span>
      </button>
    `;

    document.body.appendChild(menu);
    activePronContextMenu = menu;

    // Positioning: Bottom sheet on mobile / touch, cursor-anchored on desktop
    const isMobile = window.innerWidth <= 640;
    if (isMobile) {
      menu.classList.add('pcm-mobile-sheet');
      menu.style.left = '50%';
      menu.style.transform = 'translateX(-50%)';
      menu.style.bottom = '16px';
      menu.style.top = 'auto';
      menu.style.width = 'calc(100vw - 32px)';
      menu.style.maxWidth = '360px';
    } else {
      const menuWidth = 270;
      const menuHeight = menu.offsetHeight || 310;
      let posX = (event && event.clientX) ? event.clientX : 100;
      let posY = (event && event.clientY) ? event.clientY : 100;

      if (posX + menuWidth > window.innerWidth - 10) {
        posX = window.innerWidth - menuWidth - 10;
      }
      if (posY + menuHeight > window.innerHeight - 10) {
        posY = window.innerHeight - menuHeight - 10;
      }
      if (posX < 10) posX = 10;
      if (posY < 10) posY = 10;

      menu.style.left = posX + 'px';
      menu.style.top = posY + 'px';
    }

    // 1. Play
    function switchPhraseLang(chosenCode) {
      const meta = getLangMeta(chosenCode);
      activeLang = chosenCode;
      const badgeEl = menu.querySelector('#pcm-active-badge');
      if (badgeEl) badgeEl.innerHTML = `🔊 ${meta.flag} ${meta.label}`;
      menu.querySelectorAll('.pcm-quick-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-lang') === chosenCode);
      });
      if (triggerElement) {
        triggerElement.setAttribute('data-lang', chosenCode);
        triggerElement.setAttribute('data-override-lang', chosenCode);
        const wrapper = triggerElement.closest('.pronunciation-phrase');
        if (wrapper) {
          wrapper.setAttribute('data-lang', chosenCode);
          wrapper.querySelectorAll('.pronunciation-word').forEach(w => {
            w.setAttribute('data-lang', chosenCode);
            w.setAttribute('data-override-lang', chosenCode);
            w.title = `انقر لنطق (${meta.shortName}): ${w.getAttribute('data-word') || w.textContent}`;
          });
        }
      }
      speakPronunciation(text, triggerElement, chosenCode);
      showToast(`تم تعيين لغة النطق: ${meta.flag} ${meta.label} 🎯`, 'success');
    }

    menu.querySelector('#pcm-qbtn-1').addEventListener('click', (ev) => {
      ev.stopPropagation();
      switchPhraseLang(q1Code);
    });

    menu.querySelector('#pcm-qbtn-2').addEventListener('click', (ev) => {
      ev.stopPropagation();
      switchPhraseLang(q2Code);
    });

    menu.querySelector('#pcm-play').addEventListener('click', (ev) => {
      ev.stopPropagation();
      closePronunciationContextMenu();
      speakPronunciation(text, triggerElement, activeLang);
    });

    // 2. Pause / Resume
    menu.querySelector('#pcm-pause-resume').addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (typeof speechSynthesis !== 'undefined') {
        if (speechSynthesis.paused) {
          speechSynthesis.resume();
          showToast('تم استئناف النطق ▶️', 'info');
        } else if (speechSynthesis.speaking) {
          speechSynthesis.pause();
          showToast('تم إيقاف النطق مؤقتاً ⏸️', 'info');
        } else {
          speakPronunciation(text, triggerElement, currentLang);
        }
      }
      closePronunciationContextMenu();
    });

    // 3. Stop
    menu.querySelector('#pcm-stop').addEventListener('click', (ev) => {
      ev.stopPropagation();
      stopAllPronunciationSpeech();
      showToast('تم إيقاف النطق ⏹️', 'info');
      closePronunciationContextMenu();
    });

    // 4. Speed pills
    menu.querySelectorAll('.pcm-speed-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const speed = btn.getAttribute('data-speed');
        window.setSpeedPreset(speed);
        showToast(`تم ضبط سرعة النطق على ${speed}×`, 'info');
        closePronunciationContextMenu();
        speakPronunciation(text, triggerElement, currentLang);
      });
    });

    // 5. Copy
    menu.querySelector('#pcm-copy').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        showToast('تم نسخ العبارة للحافظة 📋', 'success');
      } catch (e) {
        showToast('تعذر النسخ تلقائياً', 'warning');
      }
      closePronunciationContextMenu();
    });

    // 6. Settings
    menu.querySelector('#pcm-settings').addEventListener('click', (ev) => {
      ev.stopPropagation();
      closePronunciationContextMenu();
      window.openSettingsModal();
      window.switchSettingsTab('pronunciation');
    });
  }

  // Dismiss context menu on click outside or Escape
  document.addEventListener('pointerdown', (e) => {
    if (activePronContextMenu && !activePronContextMenu.contains(e.target)) {
      if (e.target.closest('.pronunciation-speaker-btn') || e.target.closest('.pronunciation-word')) {
        return;
      }
      closePronunciationContextMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePronunciationContextMenu();
  });

  
  // ==========================================================================
  // BILINGUAL DUAL VIEW SYSTEM (السيناريوهان 1 و 2 للترجمة المزدوجة المنسدلة)
  // ==========================================================================

  // تحديث إظهار أو إخفاء أيقونة الترجمة العامة حسب إعدادات المستخدم (تظهر فقط عند تفعيل النطق الصوتي)
  function updateGlobalBilingualBtnVisibility() {
    const isPronOn = typeof vienixSettings !== 'undefined' && vienixSettings.pronunciationEnabled === true;
    const isGlobalOn = typeof vienixSettings !== 'undefined' && vienixSettings.globalBilingualTranslation !== false;
    const show = isPronOn && isGlobalOn;
    const btn = document.getElementById('btn-global-bilingual-trans');
    if (btn) btn.style.display = show ? 'inline-flex' : 'none';
  }
  window.updateGlobalBilingualBtnVisibility = updateGlobalBilingualBtnVisibility;

  // السيناريو 1: تبديل كارت الترجمة المنزلق لعبارة محددة (Accordion Push-down)
  window.toggleInlinePhraseTranslation = async function (btn, boxEl, phraseText, langCode, isGlobal = false) {
    if (!boxEl) return;

    const isOpen = boxEl.classList.contains('is-open');

    if (isOpen) {
      // إغلاق الكارت وسحب النص لأعلى
      boxEl.classList.remove('is-open');
      if (btn) btn.classList.remove('is-active');
      return;
    }

    // إذا تم النقر بشكل فردي وليس بالترجمة الشاملة، نغلق أي كروت فردية أخرى مفتوحة
    if (!isGlobal && !window._isGlobalBilingualActive) {
      document.querySelectorAll('.inline-translation-box.is-open').forEach(b => {
        if (b !== boxEl) {
          b.classList.remove('is-open');
          if (b._associatedBtn) b._associatedBtn.classList.remove('is-active');
        }
      });
    }

    // فتح الكارت ودفع النص لأسفل
    boxEl.classList.add('is-open');
    if (btn) btn.classList.add('is-active');

    const textEl = boxEl.querySelector('.itb-text');
    const loadEl = boxEl.querySelector('.itb-loading');

    // إذا كانت الترجمة موجودة ومحمّلة مسبقاً لا داعي لإعادة طلبها
    if (textEl && textEl.textContent.trim().length > 0) {
      if (loadEl) loadEl.style.display = 'none';
      textEl.style.display = 'block';
      return;
    }

    // جلب الترجمة عبر محرك الشلال الهجين (كاش 0ms + محلي + سحابي مجاني)
    try {
      if (loadEl) loadEl.style.display = 'flex';
      if (textEl) textEl.style.display = 'none';

      const res = await fetchWordTranslation(phraseText, langCode);
      if (res && res.text) {
        if (textEl) {
          textEl.textContent = res.text;
          textEl.style.display = 'block';
        }
      } else {
        if (textEl) {
          textEl.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">تعذر جلب الترجمة في هذه اللحظة.</span>';
          textEl.style.display = 'block';
        }
      }
    } catch (_) {
      if (textEl) {
        textEl.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">تعذر جلب الترجمة.</span>';
        textEl.style.display = 'block';
      }
    } finally {
      if (loadEl) loadEl.style.display = 'none';
    }
  };

  // السيناريو 2: تبديل وضع الترجمة المزدوجة لكامل المقال (Global Bilingual Dual View)
  window._isGlobalBilingualActive = false;

  window.toggleGlobalBilingualMode = function () {
    window._isGlobalBilingualActive = !window._isGlobalBilingualActive;
    const active = window._isGlobalBilingualActive;

    const btn = document.getElementById('btn-global-bilingual-trans');
    if (btn) btn.classList.toggle('is-active', active);

    // البحث في كافة كروت الترجمة عبر المقال (تعمل دائماً سواء كانت أزرار الترجمة الفردية ظاهرة أو مخفية)
    const allBoxes = document.querySelectorAll('.inline-translation-box');
    allBoxes.forEach(box => {
      const phrase = box._phrase;
      const lang = (box._wrapper && box._wrapper.getAttribute('data-override-lang')) || box._lang;
      const associatedBtn = box._associatedBtn;
      const isOpen = box.classList.contains('is-open');

      if (active && !isOpen) {
        toggleInlinePhraseTranslation(associatedBtn, box, phrase, lang, true);
      } else if (!active && isOpen) {
        box.classList.remove('is-open');
        if (associatedBtn) associatedBtn.classList.remove('is-active');
      }
    });

    if (active) {
      showToast('تم تفعيل وضع القراءة المزدوجة لكامل المقال 🌐', 'success', 2000);
    } else {
      showToast('تم طي ترجمات المقال واستعادة العرض الأصلي ✓', 'info', 1800);
    }
  };

  // إغلاق كارت الترجمة الفردية تلقائياً عند النقر بالماوس في أي مكان آخر خارج الكارت
  document.addEventListener('click', function (e) {
    // في حالة الترجمة الشاملة للمقال، لا تغلق الكروت عند النقر بالماوس (تبقى ثابتة حتى يضغط المستخدم على الأيقونة الشاملة مجدداً)
    if (window._isGlobalBilingualActive) return;

    const openBoxes = document.querySelectorAll('.inline-translation-box.is-open');
    if (openBoxes.length === 0) return;

    openBoxes.forEach(box => {
      // إذا كان النقر داخل الكارت أو على زر الترجمة الفردي التابع له، نتجاهل
      if (box.contains(e.target)) return;
      if (box._associatedBtn && box._associatedBtn.contains(e.target)) return;

      // إغلاق الكارت وسحب النص لأعلى
      box.classList.remove('is-open');
      if (box._associatedBtn) box._associatedBtn.classList.remove('is-active');
    });
  });

  function processPronunciationInPreview() {
    if (!vienixSettings.pronunciationEnabled) return;
    if (!previewContent) return;

    const mode = vienixSettings.interactionMode || 'mixed';
    const showDots = vienixSettings.dottedUnderline !== false;
    const speakerSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';

    // Walk through all text nodes in preview
    const walker = document.createTreeWalker(previewContent, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (['CODE', 'PRE', 'SCRIPT', 'STYLE', 'SVG', 'BUTTON'].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('pre, code, .mermaid, .mermaid-wrapper, script, style, .diagram-zoom-controls, .preview-tools, .image-resizer-wrapper, .pronunciation-phrase, .pronunciation-word, .pronunciation-speaker-btn')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    // Regex for foreign word sequences (Latin, Cyrillic, Greek, CJK, etc.)
    const PHRASE_REGEX = /([\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]+(?:[\s',’\-]+[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]+)*)/gu;

    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      if (!text || text.trim().length === 0) return;

      PHRASE_REGEX.lastIndex = 0;
      let match;
      const parts = [];
      let lastIndex = 0;

      while ((match = PHRASE_REGEX.exec(text)) !== null) {
        const phrase = match[1].trim();
        // Ignore single non-word characters
        if (phrase.length < 1) continue;

        if (match.index > lastIndex) {
          parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
        }

        parts.push({ type: 'phrase', content: phrase });
        lastIndex = match.index + match[0].length;
      }

      if (parts.length === 0) return;

      if (lastIndex < text.length) {
        parts.push({ type: 'text', content: text.substring(lastIndex) });
      }

      const fragment = document.createDocumentFragment();
      let hasPronounceable = false;

      parts.forEach(part => {
        if (part.type === 'text') {
          fragment.appendChild(document.createTextNode(part.content));
        } else {
          hasPronounceable = true;
          const detectedLang = vienixSettings.targetLanguage !== 'auto' ? vienixSettings.targetLanguage : (detectLanguage(part.content) || 'de-AT');

          // Phrase wrapper for bidirectional LTR isolation
          const phraseWrapper = document.createElement('span');
          phraseWrapper.className = 'pronunciation-phrase';
          phraseWrapper.setAttribute('dir', 'ltr');
          phraseWrapper.setAttribute('data-phrase', part.content);
          phraseWrapper.setAttribute('data-lang', detectedLang);

          // Split phrase into word tokens and separators
          const tokens = part.content.match(/([\p{L}\p{N}\-']+|[^\p{L}\p{N}\-']+)/gu) || [part.content];

          tokens.forEach(tok => {
            if (/^[\p{L}\p{N}\-']+$/u.test(tok) && tok.trim().length > 0) {
              const wordSpan = document.createElement('span');
              wordSpan.className = 'pronunciation-word' + (showDots ? '' : ' no-underline');
              wordSpan.textContent = tok;
              wordSpan.setAttribute('data-word', tok);
              wordSpan.setAttribute('data-lang', detectedLang);
              wordSpan.title = `انقر لنطق: ${tok}`;

                            if (mode === 'click' || mode === 'mixed') {
                wordSpan.addEventListener('click', function (e) {
                  e.stopPropagation();
                  e.preventDefault();
                  const effectiveLang = this.getAttribute('data-override-lang') || this.getAttribute('data-lang') || detectedLang;
                  speakWord(tok, this, effectiveLang);
                });
              }

              // Word has NO context menu and NO long-press — single tap/click speaks the word directly!
              phraseWrapper.appendChild(wordSpan);
            } else {
              phraseWrapper.appendChild(document.createTextNode(tok));
            }
          });

          // Speaker icon button for phrase pronunciation (20px round, sleek indigo)
          if (mode === 'icon' || mode === 'mixed') {
            const speakerBtn = document.createElement('button');
            speakerBtn.type = 'button';
            speakerBtn.className = 'pronunciation-speaker-btn';
            speakerBtn.title = `🔊 استمع للعبارة: ${part.content} (نقر مطول أو زر يمين للخيارات)`;
            speakerBtn.setAttribute('aria-label', `Listen to ${part.content}`);
            speakerBtn.innerHTML = speakerSvg;

            // Long-press detection on touch screens (Mobile/Tablet)
            let longPressTimer = null;
            let touchStartX = 0;
            let touchStartY = 0;
            let hasTriggeredLongPress = false;

            speakerBtn.addEventListener('touchstart', function (e) {
              hasTriggeredLongPress = false;
              if (e.touches && e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                longPressTimer = setTimeout(() => {
                  hasTriggeredLongPress = true;
                  if (navigator.vibrate) try { navigator.vibrate(40); } catch (_) {}
                  openPronunciationContextMenu(
                    { clientX: touchStartX, clientY: touchStartY },
                    part.content,
                    detectedLang,
                    speakerBtn
                  );
                }, 450);
              }
            }, { passive: true });

            speakerBtn.addEventListener('touchmove', function (e) {
              if (longPressTimer && e.touches && e.touches.length === 1) {
                if (Math.abs(e.touches[0].clientX - touchStartX) > 10 || Math.abs(e.touches[0].clientY - touchStartY) > 10) {
                  clearTimeout(longPressTimer);
                  longPressTimer = null;
                }
              }
            }, { passive: true });

            speakerBtn.addEventListener('touchend', function () {
              if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            });
            speakerBtn.addEventListener('touchcancel', function () {
              if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            });

            speakerBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              e.preventDefault();
              if (hasTriggeredLongPress) { hasTriggeredLongPress = false; return; }
              const effectiveLang = phraseWrapper.getAttribute('data-override-lang') || phraseWrapper.getAttribute('data-lang') || detectedLang;
              speakPronunciation(part.content, this, effectiveLang);
            });

            speakerBtn.addEventListener('contextmenu', function (e) {
              e.stopPropagation();
              e.preventDefault();
              const effectiveLang = phraseWrapper.getAttribute('data-override-lang') || phraseWrapper.getAttribute('data-lang') || detectedLang;
              openPronunciationContextMenu(e, part.content, effectiveLang, this);
            });

            phraseWrapper.appendChild(speakerBtn);
          }

          // إنشاء كارت الترجمة المنزلق دائماً لكل عبارة (لدعم الترجمة الشاملة حتى لو تم إطفاء أزرار الترجمة الفردية)
          const transBox = document.createElement('div');
          transBox.className = 'inline-translation-box';
          transBox.setAttribute('dir', 'rtl');
          transBox.innerHTML = '<div class="itb-loading"><span class="wtb-spinner"></span><span>جارٍ استحضار ترجمة العبارة...</span></div><p class="itb-text" style="display:none;"></p>';
          transBox._phrase = part.content;
          transBox._lang = detectedLang;
          transBox._wrapper = phraseWrapper;
          transBox._associatedBtn = null;

          // إضافة زر الترجمة الفردي لكل عبارة (文A) فقط إذا كانت الميزة مفعلة في الإعدادات
          if (vienixSettings.inlinePhraseTranslation !== false) {
            const transBtn = document.createElement('button');
            transBtn.type = 'button';
            transBtn.className = 'pronunciation-trans-btn';
            transBtn.title = 'ترجمة العبارة وعرضها بالأسفل (دفع النص)';
            transBtn.setAttribute('aria-label', 'Translate phrase inline');
            transBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>';

            transBtn._associatedBox = transBox;
            transBtn._associatedPhrase = part.content;
            transBtn._associatedLang = detectedLang;
            transBox._associatedBtn = transBtn;

            transBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              e.preventDefault();
              const effectiveLang = phraseWrapper.getAttribute('data-override-lang') || detectedLang;
              toggleInlinePhraseTranslation(transBtn, transBox, part.content, effectiveLang, false);
            });

            phraseWrapper.appendChild(transBtn);
          }

          phraseWrapper.appendChild(transBox);

          fragment.appendChild(phraseWrapper);
        }
      });

      if (hasPronounceable && textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    });
  }


  // ==========================================================================
  // FLOATING PRONUNCIATION & TRANSLATION PILL (عنصر عائم طافٍ لا يؤثر في المحتوى)
  // ==========================================================================
  let floatingPillEl = null;
  let pillHideTimer = null;
  let activePillPhraseEl = null;

  function getOrCreateFloatingPill() {
    if (floatingPillEl) return floatingPillEl;

    floatingPillEl = document.createElement('div');
    floatingPillEl.className = 'pronunciation-floating-pill';
    floatingPillEl.id = 'pronunciation-floating-pill';
    floatingPillEl.setAttribute('dir', 'ltr');

    floatingPillEl.innerHTML = `
      <button type="button" class="pfp-btn pfp-speak" id="pfp-btn-speak" title="🔊 استمع للعبارة كاملة">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        <span>نطق</span>
      </button>
      <button type="button" class="pfp-btn pfp-trans" id="pfp-btn-trans" title="🌐 ترجمة فورية">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>
        <span>ترجمة</span>
      </button>
      <button type="button" class="pfp-btn pfp-slow" id="pfp-btn-slow" title="🐢 نطق بطيء (0.6×)">
        <span>0.6×</span>
      </button>
      <button type="button" class="pfp-btn pfp-more" id="pfp-btn-more" title="⚙️ خيارات ولهجات">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
      </button>
    `;

    document.body.appendChild(floatingPillEl);

    // Keep pill visible when cursor enters the pill
    floatingPillEl.addEventListener('mouseenter', () => {
      clearTimeout(pillHideTimer);
    });

    floatingPillEl.addEventListener('mouseleave', () => {
      scheduleHideFloatingPill();
    });

    // Speak button
    const speakBtn = floatingPillEl.querySelector('#pfp-btn-speak');
    if (speakBtn) {
      speakBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!activePillPhraseEl) return;
        const phrase = activePillPhraseEl.getAttribute('data-phrase');
        const lang = activePillPhraseEl.getAttribute('data-override-lang') || activePillPhraseEl.getAttribute('data-lang');
        speakPronunciation(phrase, speakBtn, lang);
      });
    }

    // Translate button (opens the instant floating translation bubble)
    const transBtn = floatingPillEl.querySelector('#pfp-btn-trans');
    if (transBtn) {
      transBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!activePillPhraseEl) return;
        const phrase = activePillPhraseEl.getAttribute('data-phrase');
        const lang = activePillPhraseEl.getAttribute('data-override-lang') || activePillPhraseEl.getAttribute('data-lang');
        showWordTranslationBubble(activePillPhraseEl, phrase, lang);
      });
    }

    // Slow speech button
    const slowBtn = floatingPillEl.querySelector('#pfp-btn-slow');
    if (slowBtn) {
      slowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!activePillPhraseEl) return;
        const phrase = activePillPhraseEl.getAttribute('data-phrase');
        const lang = activePillPhraseEl.getAttribute('data-override-lang') || activePillPhraseEl.getAttribute('data-lang');
        speakText(phrase, lang, { rateOverride: 0.6 });
        slowBtn.classList.add('playing');
        setTimeout(() => slowBtn.classList.remove('playing'), 1200);
      });
    }

    // Context menu / dialect options button
    const moreBtn = floatingPillEl.querySelector('#pfp-btn-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!activePillPhraseEl) return;
        const phrase = activePillPhraseEl.getAttribute('data-phrase');
        const lang = activePillPhraseEl.getAttribute('data-override-lang') || activePillPhraseEl.getAttribute('data-lang');
        openPronunciationContextMenu(e, phrase, lang, activePillPhraseEl);
      });
    }

    return floatingPillEl;
  }

  function showFloatingPillForPhrase(phraseEl) {
    if (!phraseEl) return;
    clearTimeout(pillHideTimer);
    activePillPhraseEl = phraseEl;

    const pill = getOrCreateFloatingPill();
    const rect = phraseEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    pill.style.display = 'inline-flex';
    const pillWidth = pill.offsetWidth || 180;
    const pillHeight = pill.offsetHeight || 32;

    let top = rect.top - pillHeight - 6;
    if (top < 10) {
      top = rect.bottom + 6;
    }

    let left = rect.left + (rect.width / 2) - (pillWidth / 2);
    if (left < 10) left = 10;
    if (left + pillWidth > window.innerWidth - 10) {
      left = window.innerWidth - 10 - pillWidth;
    }

    pill.style.top = `${top}px`;
    pill.style.left = `${left}px`;
    pill.classList.add('is-visible');
  }

  function scheduleHideFloatingPill() {
    clearTimeout(pillHideTimer);
    pillHideTimer = setTimeout(() => {
      if (floatingPillEl) {
        floatingPillEl.classList.remove('is-visible');
        floatingPillEl.style.display = 'none';
        activePillPhraseEl = null;
      }
    }, 220);
  }

  // (Hover pill disabled in favor of direct inline icons to maintain clean baseline and touch accessibility)

  window.addEventListener('scroll', () => {
    scheduleHideFloatingPill();
  }, { passive: true });

  // ==========================================================================
  // PRONUNCIATION — Preview Click to Stop Speech (توقف تلقائي عند النقر بالماوس في ساحة العرض)
  // ==========================================================================
  const previewPanel = document.getElementById('panel-preview') || document.getElementById('preview-output');
  if (previewPanel) {
    previewPanel.addEventListener('click', function (e) {
      // If user enabled completing pronunciation to the end, ignore preview clicks
      if (vienixSettings.keepSpeakingOnClick) return;

      // Ignore clicks on context menu, resize handles, or preview tools
      if (e.target.closest('.pronunciation-context-menu, .diagram-zoom-controls, .preview-tools, .image-resizer-wrapper')) {
        return;
      }

      // If user clicked a speaker button or word, its own handler toggles or starts it
      if (e.target.closest('.pronunciation-speaker-btn, .pronunciation-word')) {
        return;
      }

      // Clicked anywhere else in the preview area: stop speech immediately!
      const wasSpeaking = stopAllPronunciationSpeech();
      if (wasSpeaking) {
        showToast('تم إيقاف النطق ⏹️', 'info');
      }
    });
  }

  // ==========================================================================
  // INITIALIZATION — Load and apply settings on startup
  // ==========================================================================

  
  // Listen for voices loading in Chromium/Firefox
  if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = function () {
      populateVoicesList();
    };
  }

  // ESC key to close settings modal
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('settings-modal-overlay');
      if (overlay && overlay.classList.contains('active')) {
        closeSettingsModal();
        e.preventDefault();
      }
    }
  });

  // =========================================================================
  // GLOBAL SPOTLIGHT SEARCH ENGINE (منظومة البحث الشامل الفوري في كل الملفات والمجلدات)
  // =========================================================================
  let currentGlobalSearchFilter = 'all';
  let globalSearchResultsList = [];
  let selectedGlobalSearchResultIndex = -1;

  function safeEscapeSearchHtml(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.openGlobalSearchModal = function () {
    const modal = document.getElementById('global-search-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const input = document.getElementById('global-search-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 60);
    }
    const clearBtn = document.getElementById('btn-clear-global-search');
    if (clearBtn) clearBtn.style.display = 'none';

    window.setGlobalSearchFilter('all', false);
    renderGlobalSearchResults('');
  };

  window.closeGlobalSearchModal = function (e) {
    if (e && e.target && e.target !== e.currentTarget && !e.target.classList.contains('search-esc-badge')) {
      return;
    }
    const modal = document.getElementById('global-search-modal');
    if (modal) modal.style.display = 'none';
    const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : (typeof editor !== 'undefined' ? editor : null);
    if (activeEl) activeEl.focus();
  };

  window.clearGlobalSearchInput = function () {
    const input = document.getElementById('global-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    const clearBtn = document.getElementById('btn-clear-global-search');
    if (clearBtn) clearBtn.style.display = 'none';
    renderGlobalSearchResults('');
  };

  window.setGlobalSearchFilter = function (filterKey, shouldRerender = true) {
    currentGlobalSearchFilter = filterKey || 'all';
    document.querySelectorAll('.search-filter-chip').forEach(chip => {
      if (chip.getAttribute('data-filter') === currentGlobalSearchFilter) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
    if (shouldRerender) {
      const input = document.getElementById('global-search-input');
      renderGlobalSearchResults(input ? input.value : '');
    }
  };

  window.handleGlobalSearchInput = function (query) {
    const clearBtn = document.getElementById('btn-clear-global-search');
    if (clearBtn) {
      clearBtn.style.display = query && query.length > 0 ? 'flex' : 'none';
    }
    renderGlobalSearchResults(query);
  };

  window.handleGlobalSearchKeydown = function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.closeGlobalSearchModal();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (globalSearchResultsList.length === 0) return;
      selectedGlobalSearchResultIndex = (selectedGlobalSearchResultIndex + 1) % globalSearchResultsList.length;
      updateSelectedGlobalSearchItemUI();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (globalSearchResultsList.length === 0) return;
      selectedGlobalSearchResultIndex = (selectedGlobalSearchResultIndex - 1 + globalSearchResultsList.length) % globalSearchResultsList.length;
      updateSelectedGlobalSearchItemUI();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedGlobalSearchResultIndex >= 0 && selectedGlobalSearchResultIndex < globalSearchResultsList.length) {
        window.selectGlobalSearchResult(selectedGlobalSearchResultIndex);
      }
      return;
    }
  };

  function updateSelectedGlobalSearchItemUI() {
    const items = document.querySelectorAll('.search-result-item');
    items.forEach((item, idx) => {
      if (idx === selectedGlobalSearchResultIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function highlightSearchQuery(text, query) {
    if (!text) return '';
    const safeText = safeEscapeSearchHtml(text);
    if (!query || !query.trim()) return safeText;
    const cleanQ = query.trim();
    const escapedQ = cleanQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQ})`, 'gi');
    return safeText.replace(regex, '<mark>$1</mark>');
  }

  function findAllMatches(content, query) {
    if (!content || !query) return [];
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matches = [];
    let pos = 0;
    while ((pos = lowerContent.indexOf(lowerQuery, pos)) !== -1) {
      const lineNum = content.substring(0, pos).split('\n').length;
      const start = Math.max(0, pos - 35);
      const end = Math.min(content.length, pos + query.length + 50);
      const prefix = start > 0 ? '...' : '';
      const suffix = end < content.length ? '...' : '';
      const snippet = prefix + content.substring(start, end).replace(/\r?\n/g, ' ') + suffix;
      matches.push({
        matchPos: pos,
        lineNum: lineNum,
        snippet: snippet
      });
      pos += lowerQuery.length;
    }
    return matches;
  }

  function renderGlobalSearchResults(query) {
    const container = document.getElementById('global-search-results');
    const countLabel = document.getElementById('global-search-count-label');
    if (!container) return;

    const q = (query || '').trim().toLowerCase();
    const results = [];
    selectedGlobalSearchResultIndex = -1;

    // الشرط الأول: يظهر فارغاً تماماً عند الفتح أو إذا كان الإدخال أقل من محرفين اثنين
    if (q.length < 2) {
      globalSearchResultsList = [];
      selectedGlobalSearchResultIndex = -1;
      if (countLabel) countLabel.textContent = '';
      container.innerHTML = '';
      return;
    }

    // 1. تجميع بيانات الحجرات والفصول (Chambers 1-8)
    const chambersData = [];
    const maxChambers = typeof TOTAL_CHAMBERS !== 'undefined' ? TOTAL_CHAMBERS : (window.VienixGetTotalChambers ? window.VienixGetTotalChambers() : 8);
    for (let i = 1; i <= maxChambers; i++) {
      const content = typeof getChamberContent === 'function' ? getChamberContent(i) : '';
      const title = typeof getChamberTitle === 'function' ? getChamberTitle(i) : `حجرة ${i}`;
      const isFilled = (content || '').trim().length > 0;
      chambersData.push({
        type: 'chamber',
        chNum: i,
        title: title || `حجرة ${i}`,
        content: content || '',
        isFilled: isFilled,
        isCurrent: (typeof activeChamber !== 'undefined' && i === activeChamber)
      });
    }

    // 2. تجميع المجلدات وملفاتها
    const allFolders = typeof getAppFolders === 'function' ? getAppFolders() : (window.getAppFolders ? window.getAppFolders() : []);
    const folderFilesData = [];
    allFolders.forEach(folder => {
      const files = typeof getFolderFiles === 'function' ? getFolderFiles(folder.key) : [];
      files.forEach(f => {
        folderFilesData.push({
          type: 'folder_file',
          folderKey: folder.key,
          folderName: folder.name,
          fileId: f.id,
          num: f.num,
          title: f.title || `ملف ${f.num}`,
          content: f.content || '',
          linkedChamber: f.linkedChamber
        });
      });
    });

    // 3. مطابقة البحث الفعلي عبر الفئات المحددة وعرض المواضع المتعددة
    // أ. مطابقة الفصول والحجرات
    if (currentGlobalSearchFilter === 'all' || currentGlobalSearchFilter === 'chambers' || currentGlobalSearchFilter === 'content' || currentGlobalSearchFilter === 'code') {
      chambersData.forEach(c => {
        const titleMatch = c.title.toLowerCase().includes(q);
        const isCodeMermaid = (c.content.includes('```mermaid') || c.content.includes('```')) && (c.content.toLowerCase().includes(q) || titleMatch);

        if (currentGlobalSearchFilter === 'code' && !isCodeMermaid) return;

        // مطابقة في العنوان
        if (titleMatch && currentGlobalSearchFilter !== 'content') {
          results.push({
            type: 'chamber',
            chNum: c.chNum,
            badge: `حجرة ${c.chNum}`,
            title: c.title,
            path: c.isCurrent ? 'الحجرة المفتوحة حالياً (مطابقة في العنوان)' : `حجرة رقم ${c.chNum} (مطابقة في العنوان)`,
            snippet: (c.content || '').substring(0, 80).replace(/\r?\n/g, ' '),
            matchQuery: q,
            matchPos: 0,
            iconType: isCodeMermaid ? 'code' : 'file',
            isTitleMatch: true
          });
        }

        // مطابقة في المحتوى النصي الداخلي - دعم كافة المواضع المتعددة
        const contentMatches = findAllMatches(c.content, q);
        contentMatches.forEach((m, matchIdx) => {
          const locBadge = contentMatches.length > 1 ? `موضع ${matchIdx + 1} • سطر ${m.lineNum}` : `سطر ${m.lineNum}`;
          results.push({
            type: 'chamber',
            chNum: c.chNum,
            badge: `حجرة ${c.chNum}`,
            title: c.title,
            path: c.isCurrent ? `الحجرة المفتوحة حالياً • ${locBadge}` : `حجرة رقم ${c.chNum} • ${locBadge}`,
            snippet: m.snippet,
            matchQuery: q,
            matchPos: m.matchPos,
            iconType: isCodeMermaid ? 'code' : 'file',
            isTitleMatch: false
          });
        });
      });
    }

    // ب. مطابقة ملفات المجلدات
    if (currentGlobalSearchFilter === 'all' || currentGlobalSearchFilter === 'folders' || currentGlobalSearchFilter === 'content' || currentGlobalSearchFilter === 'code') {
      folderFilesData.forEach(f => {
        const titleMatch = f.title.toLowerCase().includes(q);
        const isCodeMermaid = (f.content.includes('```mermaid') || f.content.includes('```')) && (f.content.toLowerCase().includes(q) || titleMatch);

        if (currentGlobalSearchFilter === 'code' && !isCodeMermaid) return;

        // مطابقة في عنوان الملف
        if (titleMatch && currentGlobalSearchFilter !== 'content') {
          results.push({
            type: 'folder_file',
            folderKey: f.folderKey,
            fileId: f.fileId,
            badge: f.folderName,
            title: f.title,
            path: `المستكشف / ${f.folderName} (مطابقة في العنوان)`,
            snippet: (f.content || '').substring(0, 80).replace(/\r?\n/g, ' '),
            matchQuery: q,
            matchPos: 0,
            iconType: isCodeMermaid ? 'code' : 'file',
            isTitleMatch: true
          });
        }

        // مطابقة في محتوى الملف - دعم كافة المواضع المتعددة
        const contentMatches = findAllMatches(f.content, q);
        contentMatches.forEach((m, matchIdx) => {
          const locBadge = contentMatches.length > 1 ? `موضع ${matchIdx + 1} • سطر ${m.lineNum}` : `سطر ${m.lineNum}`;
          results.push({
            type: 'folder_file',
            folderKey: f.folderKey,
            fileId: f.fileId,
            badge: f.folderName,
            title: f.title,
            path: `المستكشف / ${f.folderName} / ${f.title} • ${locBadge}`,
            snippet: m.snippet,
            matchQuery: q,
            matchPos: m.matchPos,
            iconType: isCodeMermaid ? 'code' : 'file',
            isTitleMatch: false
          });
        });
      });
    }

    // ج. مطابقة المجلدات
    if (currentGlobalSearchFilter === 'all' || currentGlobalSearchFilter === 'folders') {
      allFolders.forEach(folder => {
        const nameMatch = folder.name.toLowerCase().includes(q);
        const descMatch = (folder.desc || '').toLowerCase().includes(q);
        if (nameMatch || descMatch) {
          results.push({
            type: 'folder',
            folderKey: folder.key,
            badge: 'مجلد',
            title: folder.name,
            path: folder.desc || 'مجلد بالمستكشف',
            snippet: '',
            matchQuery: q,
            matchPos: 0,
            iconType: 'folder',
            isTitleMatch: true
          });
        }
      });
    }

    results.sort((a, b) => {
      if (a.isTitleMatch && !b.isTitleMatch) return -1;
      if (!a.isTitleMatch && b.isTitleMatch) return 1;
      return 0;
    });

    globalSearchResultsList = results;
    if (results.length > 0) {
      selectedGlobalSearchResultIndex = 0;
    }
    if (countLabel) {
      countLabel.textContent = results.length > 0 ? `تم العثور على ${results.length} نتيجة` : 'لا توجد نتائج';
    }
    renderItemsToHtml(container, results, q);
  }

  function renderItemsToHtml(container, items, query) {
    if (items.length === 0) {
      container.innerHTML = `
        <div class="search-empty-state">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
          <h5>لا توجد نتائج مطابقة لـ "${safeEscapeSearchHtml(query)}"</h5>
          <p>تأكد من كتابة الكلمات بشكل صحيح أو اختر تبويباً آخر للتصفية.</p>
        </div>
      `;
      return;
    }

    const html = items.map((item, idx) => {
      const isSelected = (idx === selectedGlobalSearchResultIndex);
      let iconSvg = '';
      if (item.iconType === 'folder') {
        iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#d97706" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
      } else if (item.iconType === 'code') {
        iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8b5cf6" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
      } else {
        iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#2563eb" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
      }

      const highlightedTitle = highlightSearchQuery(item.title, query);
      const highlightedSnippet = item.snippet ? highlightSearchQuery(item.snippet, query) : '';

      return `
        <div class="search-result-item ${isSelected ? 'selected' : ''}" data-index="${idx}" onclick="selectGlobalSearchResult(${idx})">
          <div class="search-result-icon">
            ${iconSvg}
          </div>
          <div class="search-result-info">
            <div class="search-result-header-row">
              <span class="search-result-title">${highlightedTitle}</span>
              <span class="search-result-badge">${safeEscapeSearchHtml(item.badge || '')}</span>
            </div>
            <div class="search-result-path">${safeEscapeSearchHtml(item.path || '')}</div>
            ${highlightedSnippet ? `<div class="search-result-snippet">${highlightedSnippet}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="search-results-list">${html}</div>`;
  }

  window.selectGlobalSearchResult = function (idx) {
    if (idx < 0 || idx >= globalSearchResultsList.length) return;
    const item = globalSearchResultsList[idx];
    const modal = document.getElementById('global-search-modal');
    if (modal) modal.style.display = 'none';

    if (item.type === 'chamber') {
      if (typeof window.switchChamber === 'function') {
        window.switchChamber(item.chNum);
      }
    } else if (item.type === 'folder_file') {
      if (typeof window.handleFolderFileClick === 'function') {
        window.handleFolderFileClick(item.folderKey, item.fileId);
      }
    } else if (item.type === 'folder') {
      if (typeof window.toggleChambersExplorer === 'function') {
        window.toggleChambersExplorer(true);
      }
    }

    if (item.matchQuery && typeof item.matchPos === 'number') {
      setTimeout(() => {
        const activeEl = (typeof isClassicMode !== 'undefined' && isClassicMode && typeof classicEditor !== 'undefined' && classicEditor) ? classicEditor : (typeof editor !== 'undefined' ? editor : null);
        if (activeEl) {
          activeEl.focus();
          const targetStart = item.matchPos;
          const targetEnd = targetStart + item.matchQuery.length;
          activeEl.setSelectionRange(targetStart, targetEnd);
          
          // التمرير إلى السطر المحدد بدقة
          const textBefore = activeEl.value.substring(0, targetStart);
          const lineCount = textBefore.split('\n').length;
          const approxLineHeight = 26;
          activeEl.scrollTop = Math.max(0, (lineCount - 4) * approxLineHeight);
        }
      }, 160);
    }

    if (typeof showToast === 'function') {
      showToast(`تم الانتقال إلى: "${item.title}" ✓`, 'success', 1800);
    }
  };

  // الاستماع لاختصارات لوحة المفاتيح: دعم كلا من Ctrl+F و Ctrl+K للبحث الشامل
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      const modal = document.getElementById('global-search-modal');
      if (modal && modal.style.display === 'flex') {
        window.closeGlobalSearchModal();
      } else {
        window.openGlobalSearchModal();
      }
    }
  });

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
    makeDraggable('preview-floating-dock-wrapper', 'vienix_preview_dock_pos');
    makeDraggable('classic-floating-dock-wrapper', 'vienix_classic_dock_pos');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDrag);
  } else {
    initDrag();
  }
})();
