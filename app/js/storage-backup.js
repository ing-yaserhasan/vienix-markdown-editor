/**
 * ============================================================================
 * Vienix Markdown Editor - Storage Health Monitor & Full Workspace Backup
 * Phase 0: Local-First Protection Engine
 * ============================================================================
 * Features:
 *  1. Live LocalStorage Health Monitor (Status Bar + Settings Tab)
 *  2. Base64 Media & Chambers Deep Analytics
 *  3. Full Workspace JSON Backup (Chambers, Folders, Files, Settings, Overrides)
 *  4. Full Workspace JSON Restore with Validation & Preview Modal
 *  5. Silent Quota Exceeded Shield & Immediate Safety Alerts
 * ============================================================================
 */

(function () {
  'use strict';

  // Standard safe limit for browser localStorage (5MB = ~5,242,880 UTF-16 code units)
  const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
  let updateDebounceTimer = null;

  const VienixStorage = {
    limitBytes: STORAGE_LIMIT_BYTES,

    // ─────────────────────────────────────────────────────────────
    // 1. STORAGE METRICS & ANALYTICS
    // ─────────────────────────────────────────────────────────────
    getStats: function () {
      let totalChars = 0;
      let chambersChars = 0;
      let imagesChars = 0;
      let foldersChars = 0;
      let settingsChars = 0;
      let otherChars = 0;
      let imageCount = 0;
      let activeChambersCount = 0;

      const imageRegex = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;

      try {
        const keySet = new Set();
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) keySet.add(k);
        }
        if (window.VienixIDB && window.VienixIDB.memoryCache) {
          Object.keys(window.VienixIDB.memoryCache).forEach(k => keySet.add(k));
        }

        keySet.forEach(key => {
          let val = '';
          if (window.VienixIDB && window.VienixIDB.memoryCache && window.VienixIDB.memoryCache[key] !== undefined) {
            val = window.VienixIDB.memoryCache[key] || '';
          } else {
            val = localStorage.getItem(key) || '';
          }
          const itemChars = key.length + val.length;
          totalChars += itemChars;

          // Categorization
          if (key.includes('chamber') || key.includes('md_content')) {
            chambersChars += itemChars;
            if (val.trim().length > 0 && !key.includes('meta')) {
              activeChambersCount++;
            }
            // Scan for embedded Base64 images inside chamber content
            const imgMatches = val.match(imageRegex);
            if (imgMatches) {
              imageCount += imgMatches.length;
              imgMatches.forEach(match => {
                imagesChars += match.length;
              });
            }
          } else if (key.includes('folder') || key.includes('explorer')) {
            foldersChars += itemChars;
          } else if (key.includes('settings') || key.includes('theme') || key.includes('sync_scroll')) {
            settingsChars += itemChars;
          } else {
            otherChars += itemChars;
          }
        });
      } catch (err) {
        console.warn('[VienixStorage] Error reading storage:', err);
      }

      // In UTF-16 DOM storage, each character is 2 bytes in memory
      const totalBytes = totalChars * 2;
      const chambersBytes = chambersChars * 2;
      const imagesBytes = imagesChars * 2;
      const foldersBytes = foldersChars * 2;
      const settingsBytes = settingsChars * 2;
      const otherBytes = otherChars * 2;

      // Calculate percentage against 5MB
      const percent = Math.min(100, Math.round((totalBytes / STORAGE_LIMIT_BYTES) * 100));

      let status = 'safe';
      if (percent >= 90) {
        status = 'danger';
      } else if (percent >= 70) {
        status = 'warning';
      }

      return {
        totalChars,
        totalBytes,
        totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
        limitMB: (STORAGE_LIMIT_BYTES / (1024 * 1024)).toFixed(1),
        percent,
        status,
        imageCount,
        activeChambersCount,
        breakdown: {
          chambersBytes,
          chambersMB: (chambersBytes / (1024 * 1024)).toFixed(2),
          imagesBytes,
          imagesMB: (imagesBytes / (1024 * 1024)).toFixed(2),
          foldersBytes,
          foldersKB: (foldersBytes / 1024).toFixed(1),
          settingsBytes,
          settingsKB: (settingsBytes / 1024).toFixed(1),
          otherBytes,
          otherKB: (otherBytes / 1024).toFixed(1)
        }
      };
    },

    // ─────────────────────────────────────────────────────────────
    // 2. STATUS BAR LIVE MONITOR
    // ─────────────────────────────────────────────────────────────
    updateStatusMeter: function () {
      const el = document.getElementById('stat-storage-item');
      if (!el) return;

      const stats = this.getStats();
      const textEl = document.getElementById('stat-storage-text');
      const badgeClass = `status-storage-${stats.status}`;

      el.classList.remove('status-storage-safe', 'status-storage-warning', 'status-storage-danger');
      el.classList.add(badgeClass);

      let statusIcon = '📊';
      if (stats.status === 'danger') statusIcon = '🚨';
      else if (stats.status === 'warning') statusIcon = '⚠️';

      if (textEl) {
        textEl.textContent = `${statusIcon} الذاكرة: ${stats.totalMB} / ${stats.limitMB} MB (${stats.percent}%)`;
      }

      el.title = `استهلاك الذاكرة المحلية (LocalStorage): ${stats.percent}% (${stats.totalMB} MB مستخدم من أصل ${stats.limitMB} MB).\n` +
        `• الحجرات: ${stats.breakdown.chambersMB} MB\n` +
        `• الصور المضمنة (${stats.imageCount}): ${stats.breakdown.imagesMB} MB\n` +
        `انقر لفتح إدارة البيانات والنسخ الاحتياطي.`;

      // Update Settings UI if opened
      this.updateSettingsUI(stats);
    },

    updateStatusMeterDebounced: function () {
      if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
      updateDebounceTimer = setTimeout(() => {
        this.updateStatusMeter();
      }, 400);
    },

    // ─────────────────────────────────────────────────────────────
    // 3. SETTINGS MODAL STORAGE PANEL ENHANCEMENT
    // ─────────────────────────────────────────────────────────────
    updateSettingsUI: function (optionalStats) {
      const stats = optionalStats || this.getStats();
      const container = document.getElementById('s-storage-interactive-box');
      if (!container) return;

      let statusLabel = 'حالة آمنة ومستقرة';
      let statusColor = '#10b981';
      let statusDesc = 'المساحة المستخدمة ضمن الحدود الطبيعية لمتصفحك.';

      if (stats.status === 'warning') {
        statusLabel = 'تحذير: اقتراب من حد الذاكرة (70%+)';
        statusColor = '#f59e0b';
        statusDesc = 'استهلكت معظم مساحة المتصفح، يُنصح بتصدير نسخة احتياطية دورية.';
      } else if (stats.status === 'danger') {
        statusLabel = 'خطر شديد: امتلاء الذاكرة وشيك (90%+)';
        statusColor = '#ef4444';
        statusDesc = 'المساحة ممتلئة تقريباً! احفظ نسخة احتياطية فوراً لتجنب فقدان النصوص أو الصور.';
      }

      container.innerHTML = `
        <div class="storage-meter-head">
          <div class="storage-meter-title-wrap">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="storage-meter-badge" style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor}40;">
                ${stats.status === 'danger' ? '🚨' : stats.status === 'warning' ? '⚠️' : '🟢'} ${statusLabel}
              </span>
              <span class="storage-meter-badge" style="background:rgba(99, 102, 241, 0.15); color:var(--accent-color, #6366f1); border:1px solid rgba(99, 102, 241, 0.35);">
                ⚡ محرك IndexedDB نشط (سعة غير محدودة)
              </span>
            </div>
            <span class="storage-meter-numbers">
              <strong>${stats.totalMB} MB</strong> من أصل <strong>${stats.limitMB} MB</strong> (${stats.percent}%)
            </span>
          </div>
          <p class="storage-meter-subdesc">${window.VienixIDB && window.VienixIDB.isReady ? 'يتم حفظ كافة الحجرات والصور المضمنة في قاعدة بيانات IndexedDB المحلية الفائقة دون التقيد بحدود المتصفح.' : statusDesc}</p>
        </div>

        <div class="storage-progress-track">
          <div class="storage-progress-bar" style="width: ${stats.percent}%; background: ${statusColor};"></div>
        </div>

        <div class="storage-breakdown-grid">
          <div class="storage-breakdown-card">
            <div class="storage-breakdown-icon">📝</div>
            <div class="storage-breakdown-info">
              <span class="storage-breakdown-name">نصوص الحجرات (${stats.activeChambersCount})</span>
              <span class="storage-breakdown-val">${stats.breakdown.chambersMB} MB</span>
            </div>
          </div>

          <div class="storage-breakdown-card">
            <div class="storage-breakdown-icon">🖼️</div>
            <div class="storage-breakdown-info">
              <span class="storage-breakdown-name">الصور المضمنة (${stats.imageCount})</span>
              <span class="storage-breakdown-val">${stats.breakdown.imagesMB} MB</span>
            </div>
          </div>

          <div class="storage-breakdown-card">
            <div class="storage-breakdown-icon">📁</div>
            <div class="storage-breakdown-info">
              <span class="storage-breakdown-name">المجلدات والشجرة</span>
              <span class="storage-breakdown-val">${stats.breakdown.foldersKB} KB</span>
            </div>
          </div>

          <div class="storage-breakdown-card">
            <div class="storage-breakdown-icon">⚙️</div>
            <div class="storage-breakdown-info">
              <span class="storage-breakdown-name">الإعدادات والتفضيلات</span>
              <span class="storage-breakdown-val">${stats.breakdown.settingsKB} KB</span>
            </div>
          </div>
        </div>
      `;
    },

    // ─────────────────────────────────────────────────────────────
    // 4. FULL WORKSPACE BACKUP (.JSON)
    // ─────────────────────────────────────────────────────────────
    exportBackup: function () {
      const timestamp = new Date().toISOString();
      const dateFormatted = new Date().toLocaleString('ar-SA', {
        dateStyle: 'full',
        timeStyle: 'short'
      });

      // 1. Gather all chambers data
      const chambers = [];
      const totalCh = typeof window.VienixGetTotalChambers === 'function' ? window.VienixGetTotalChambers() : 8;
      for (let ch = 1; ch <= totalCh; ch++) {
        let content = '';
        let metaRaw = null;
        if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
          content = window.VienixIDB.getSync('vienix_chamber_' + ch, 'yaser_chamber_' + ch) || '';
          metaRaw = window.VienixIDB.getSync('vienix_chamber_meta_' + ch, 'yaser_chamber_meta_' + ch);
        } else {
          content = localStorage.getItem('vienix_chamber_' + ch) || localStorage.getItem('yaser_chamber_' + ch) || '';
          metaRaw = localStorage.getItem('vienix_chamber_meta_' + ch) || localStorage.getItem('yaser_chamber_meta_' + ch) || null;
        }

        let meta = null;
        if (metaRaw) {
          try { meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw; } catch (e) { meta = null; }
        }

        // Chamber 1 legacy fallback
        if (ch === 1 && !content) {
          if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
            content = window.VienixIDB.getSync('vienix_md_content', 'yaser_md_content') || '';
          } else {
            content = localStorage.getItem('vienix_md_content') || localStorage.getItem('yaser_md_content') || '';
          }
        }

        chambers.push({
          chamberId: ch,
          content: content,
          meta: meta,
          hasContent: content.trim().length > 0,
          wordCount: (content.trim().match(/\S+/g) || []).length,
          charCount: content.length
        });
      }

      // 2. Gather Explorer & Custom Folders
      let customFolders = [];
      try {
        customFolders = JSON.parse(localStorage.getItem('vienix_custom_folders') || '[]');
      } catch (e) { customFolders = []; }

      const folderFiles = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('vienix_folder_files_')) {
            folderFiles[k] = JSON.parse(localStorage.getItem(k) || '[]');
          }
        }
      } catch (e) {}

      let folderNameOverrides = {};
      try {
        folderNameOverrides = JSON.parse(localStorage.getItem('vienix_folder_name_overrides') || '{}');
      } catch (e) { folderNameOverrides = {}; }

      let deletedDefaultFolders = [];
      try {
        deletedDefaultFolders = JSON.parse(localStorage.getItem('vienix_deleted_default_folders') || '[]');
      } catch (e) { deletedDefaultFolders = []; }

      let chambersOrder = [];
      try {
        chambersOrder = JSON.parse(localStorage.getItem('vienix_chambers_order') || '[]');
      } catch (e) { chambersOrder = []; }

      let activeExplorerFile = null;
      try {
        activeExplorerFile = JSON.parse(localStorage.getItem('vienix_active_explorer_file') || 'null');
      } catch (e) { activeExplorerFile = null; }

      // 3. Gather Settings
      let settings = {};
      try {
        settings = JSON.parse(localStorage.getItem('vienix_settings') || '{}');
      } catch (e) { settings = {}; }

      // 4. Raw key dump for 100% loss-less fallback
      const rawVienixData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('vienix_') || k.startsWith('yaser_'))) {
          rawVienixData[k] = localStorage.getItem(k);
        }
      }

      const backupPackage = {
        app: 'Vienix Markdown Editor',
        version: '1.0',
        generator: 'Vienix Storage Shield',
        timestamp: timestamp,
        timestampLocal: dateFormatted,
        stats: {
          chambersCount: chambers.filter(c => c.hasContent).length,
          customFoldersCount: customFolders.length,
          totalKeys: Object.keys(rawVienixData).length
        },
        payload: {
          chambers: chambers,
          customFolders: customFolders,
          folderFiles: folderFiles,
          folderNameOverrides: folderNameOverrides,
          deletedDefaultFolders: deletedDefaultFolders,
          chambersOrder: chambersOrder,
          activeExplorerFile: activeExplorerFile,
          settings: settings,
          rawKeys: rawVienixData
        }
      };

      const jsonStr = JSON.stringify(backupPackage, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      // File name format: vienix-backup-YYYY-MM-DD-HHmm.json
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const filename = `vienix-full-backup-${yyyy}-${mm}-${dd}-${hh}${min}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showCustomModal({
        title: 'تم تصدير النسخة الاحتياطية الشاملة بنجاح ✅',
        icon: '💾',
        content: `
          <p style="margin-bottom:12px; color:var(--text-secondary);">تم تجميع كافة بياناتك في ملف JSON محلي آمن جاهز للحفظ أو النقل لأي جهاز آخر:</p>
          <div style="background:var(--bg-canvas); border:1px solid var(--border-color); border-radius:8px; padding:12px; font-size:0.85rem; line-height:1.7;">
            <div>• اسم الملف: <strong style="color:var(--accent-color);">${filename}</strong></div>
            <div>• عدد الحجرات المحفوظة: <strong>${backupPackage.stats.chambersCount} حجرة</strong></div>
            <div>• المجلدات المخصصة: <strong>${backupPackage.stats.customFoldersCount} مجلد</strong></div>
            <div>• إعدادات المحرر والمظهر: <strong>محفوظة بالكامل</strong></div>
          </div>
        `,
        confirmText: 'حسناً، فهمت'
      });
    },

    // ─────────────────────────────────────────────────────────────
    // 5. FULL WORKSPACE RESTORE (.JSON)
    // ─────────────────────────────────────────────────────────────
    triggerRestore: function () {
      let input = document.getElementById('vienix-restore-file-input');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'vienix-restore-file-input';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          this.processRestoreFile(file);
          input.value = ''; // reset for subsequent triggers
        });
      }
      input.click();
    },

    processRestoreFile: function (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = e.target.result;
          const data = JSON.parse(raw);

          // Validation
          const isVienixBackup = (data.app && data.app.includes('Vienix')) ||
            (data.payload && (data.payload.chambers || data.payload.rawKeys)) ||
            (data.rawKeys && Object.keys(data.rawKeys).some(k => k.startsWith('vienix_')));

          if (!isVienixBackup) {
            alert('الملف المحدد ليس نسخة احتياطية صالحة من تطبيق Vienix Markdown Editor!');
            return;
          }

          const payload = data.payload || data;
          const chambersCount = (payload.chambers && payload.chambers.length) || 'غير محدد';
          const backupDate = data.timestampLocal || data.timestamp || 'غير معروف';

          // Show confirmation modal
          this.showCustomModal({
            title: 'استعادة النسخة الاحتياطية الشاملة 📂',
            icon: '⚠️',
            content: `
              <p style="margin-bottom:10px; color:var(--text-secondary);">تم فحص الملف بنجاح، تفاصيل النسخة الاحتياطية:</p>
              <div style="background:var(--bg-canvas); border:1px solid var(--border-color); border-radius:8px; padding:12px; font-size:0.85rem; line-height:1.7; margin-bottom:12px;">
                <div>• تاريخ النسخة: <strong>${backupDate}</strong></div>
                <div>• عدد الحجرات المتوفرة: <strong>${chambersCount}</strong></div>
                <div>• حجم الملف: <strong>${(file.size / 1024).toFixed(1)} KB</strong></div>
              </div>
              <p style="color:#ef4444; font-weight:600; font-size:0.85rem;">
                ⚠️ تنبيه: استعادة النسخة ستستبدل الحجرات والمجلدات والإعدادات الحالية بما هو موجود في الملف. هل تود المتابعة؟
              </p>
            `,
            confirmText: 'نعم، استعادة الآن وإعادة التحميل',
            confirmColor: '#6366f1',
            cancelText: 'إلغاء',
            onConfirm: async () => {
              await this.applyRestore(payload);
            }
          });
        } catch (err) {
          alert('تعذر قراءة ملف النسخة الاحتياطية! تأكد من أن الملف سليم وبصيغة JSON صالحة.');
          console.error(err);
        }
      };
      reader.readAsText(file, 'utf-8');
    },

    applyRestore: async function (payload) {
      try {
        const idbPromises = [];

        // Helper to set in both VienixIDB and localStorage
        const restoreSet = (k, v) => {
          if (v === null || v === undefined) return;
          const strVal = typeof v === 'string' ? v : JSON.stringify(v);
          try { localStorage.setItem(k, strVal); } catch (e) {}
          if (window.VienixIDB && typeof window.VienixIDB.set === 'function') {
            idbPromises.push(window.VienixIDB.set(k, strVal));
          } else if (window.VienixIDB && window.VienixIDB.memoryCache) {
            window.VienixIDB.memoryCache[k] = strVal;
          }
        };

        // Helper to delete from both VienixIDB and localStorage
        const restoreDelete = (k) => {
          try { localStorage.removeItem(k); } catch (e) {}
          if (window.VienixIDB && typeof window.VienixIDB.remove === 'function') {
            idbPromises.push(window.VienixIDB.remove(k));
          } else if (window.VienixIDB && window.VienixIDB.memoryCache) {
            delete window.VienixIDB.memoryCache[k];
          }
        };

        // 1. Identify all chambers present and populated in incoming payload
        const presentChambers = new Map(); // chNum -> { content, meta }

        if (payload.rawKeys && typeof payload.rawKeys === 'object') {
          Object.keys(payload.rawKeys).forEach(k => {
            const m = k.match(/^(?:vienix|yaser)_chamber_(\d+)$/);
            if (m) {
              const chNum = parseInt(m[1], 10);
              const val = payload.rawKeys[k];
              if (val !== null && val !== undefined && String(val).trim().length > 0) {
                if (!presentChambers.has(chNum)) presentChambers.set(chNum, {});
                presentChambers.get(chNum).content = String(val);
              }
            }
            const mMeta = k.match(/^(?:vienix|yaser)_chamber_meta_(\d+)$/);
            if (mMeta) {
              const chNum = parseInt(mMeta[1], 10);
              const val = payload.rawKeys[k];
              if (val) {
                if (!presentChambers.has(chNum)) presentChambers.set(chNum, {});
                presentChambers.get(chNum).meta = val;
              }
            }
          });

          // Check legacy Chamber 1 content keys
          const legacyCh1 = payload.rawKeys['vienix_md_content'] || payload.rawKeys['yaser_md_content'];
          if (legacyCh1 && String(legacyCh1).trim().length > 0) {
            if (!presentChambers.has(1)) presentChambers.set(1, {});
            if (!presentChambers.get(1).content) presentChambers.get(1).content = String(legacyCh1);
          }
        }

        if (Array.isArray(payload.chambers)) {
          payload.chambers.forEach(ch => {
            if (ch && ch.chamberId) {
              const chNum = parseInt(ch.chamberId, 10);
              if (ch.content !== undefined && String(ch.content).trim().length > 0) {
                if (!presentChambers.has(chNum)) presentChambers.set(chNum, {});
                presentChambers.get(chNum).content = ch.content;
              }
              if (ch.meta) {
                if (!presentChambers.has(chNum)) presentChambers.set(chNum, {});
                presentChambers.get(chNum).meta = ch.meta;
              }
            }
          });
        }

        // 2. CLEAN FULL MIRRORING: Active scan from Chamber 1 up to maximum chambers
        const maxChambers = typeof window.VienixGetTotalChambers === 'function' ? window.VienixGetTotalChambers() : 8;
        const scanLimit = Math.max(16, maxChambers);

        for (let ch = 1; ch <= scanLimit; ch++) {
          if (presentChambers.has(ch)) {
            const chData = presentChambers.get(ch);
            if (chData.content !== undefined) {
              restoreSet('vienix_chamber_' + ch, chData.content);
              restoreSet('yaser_chamber_' + ch, chData.content);
              if (ch === 1) {
                restoreSet('vienix_md_content', chData.content);
                restoreSet('yaser_md_content', chData.content);
              }
            }
            if (chData.meta) {
              const metaStr = typeof chData.meta === 'string' ? chData.meta : JSON.stringify(chData.meta);
              restoreSet('vienix_chamber_meta_' + ch, metaStr);
              restoreSet('yaser_chamber_meta_' + ch, metaStr);
            } else {
              restoreDelete('vienix_chamber_meta_' + ch);
              restoreDelete('yaser_chamber_meta_' + ch);
            }
          } else {
            // Chamber is NOT in cloud/incoming backup -> WIPE IT CLEAN so old accounts cannot bleed through
            restoreSet('vienix_chamber_' + ch, '');
            restoreSet('yaser_chamber_' + ch, '');
            if (ch === 1) {
              restoreSet('vienix_md_content', '');
              restoreSet('yaser_md_content', '');
            }
            restoreDelete('vienix_chamber_meta_' + ch);
            restoreDelete('yaser_chamber_meta_' + ch);
          }
        }

        // 3. Clean up folder files (vienix_folder_files_*) to prevent cross-account pollution
        const incomingFolderFilesKeys = new Set();
        if (payload.rawKeys && typeof payload.rawKeys === 'object') {
          Object.keys(payload.rawKeys).forEach(k => {
            if (k.startsWith('vienix_folder_files_')) incomingFolderFilesKeys.add(k);
          });
        }
        if (payload.folderFiles && typeof payload.folderFiles === 'object') {
          Object.keys(payload.folderFiles).forEach(k => {
            incomingFolderFilesKeys.add(k);
          });
        }

        try {
          const keysToCheck = new Set();
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('vienix_folder_files_')) keysToCheck.add(k);
          }
          if (window.VienixIDB && window.VienixIDB.memoryCache) {
            Object.keys(window.VienixIDB.memoryCache).forEach(k => {
              if (k && k.startsWith('vienix_folder_files_')) keysToCheck.add(k);
            });
          }
          keysToCheck.forEach(k => {
            if (!incomingFolderFilesKeys.has(k)) {
              restoreDelete(k);
            }
          });
        } catch (e) {}

        // 4. Restore custom folders or reset to empty
        if (payload.customFolders) {
          const val = typeof payload.customFolders === 'string' ? payload.customFolders : JSON.stringify(payload.customFolders);
          restoreSet('vienix_custom_folders', val);
        } else if (payload.rawKeys && payload.rawKeys['vienix_custom_folders'] !== undefined) {
          restoreSet('vienix_custom_folders', payload.rawKeys['vienix_custom_folders']);
        } else {
          restoreSet('vienix_custom_folders', '[]');
        }

        // 5. Restore folder files from explicit payload if provided
        if (payload.folderFiles && typeof payload.folderFiles === 'object') {
          Object.keys(payload.folderFiles).forEach(k => {
            restoreSet(k, payload.folderFiles[k]);
          });
        }

        // 6. Restore folder name overrides
        if (payload.folderNameOverrides) {
          const val = typeof payload.folderNameOverrides === 'string' ? payload.folderNameOverrides : JSON.stringify(payload.folderNameOverrides);
          restoreSet('vienix_folder_name_overrides', val);
        } else if (payload.rawKeys && payload.rawKeys['vienix_folder_name_overrides'] !== undefined) {
          restoreSet('vienix_folder_name_overrides', payload.rawKeys['vienix_folder_name_overrides']);
        } else {
          restoreDelete('vienix_folder_name_overrides');
        }

        // 7. Restore remaining non-chamber rawKeys (settings, theme, layout)
        if (payload.rawKeys && typeof payload.rawKeys === 'object') {
          Object.keys(payload.rawKeys).forEach(k => {
            if (/^(?:vienix|yaser)_chamber_/.test(k) || k === 'vienix_md_content' || k === 'yaser_md_content' || k === 'vienix_custom_folders' || k.startsWith('vienix_folder_files_')) {
              return;
            }
            restoreSet(k, payload.rawKeys[k]);
          });
        }

        // 8. Restore explicit settings if present
        if (payload.settings) {
          const val = typeof payload.settings === 'string' ? payload.settings : JSON.stringify(payload.settings);
          restoreSet('vienix_settings', val);
        }

        // 9. Reset active explorer file and default active chamber to 1
        restoreDelete('vienix_active_explorer_file');
        restoreSet('vienix_active_chamber', '1');

        // 10. Await all pending IndexedDB asynchronous writes/deletes before reload
        if (idbPromises.length > 0) {
          await Promise.all(idbPromises);
        }

        // Mark flash notification in sessionStorage for post-reload display
        sessionStorage.setItem('vienix_restore_success_flash', 'true');

        // Reload to fresh, fully mirrored state
        window.location.reload();
      } catch (err) {
        alert('حدث خطأ أثناء استعادة البيانات: ' + err.message);
        console.error(err);
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 6. QUOTA EXCEEDED ALERT SHIELD
    // ─────────────────────────────────────────────────────────────
    handleQuotaExceeded: function (failedKey, error) {
      console.error('[VienixStorage] LocalStorage Quota Exceeded on key:', failedKey, error);

      // Force meter update to danger state
      this.updateStatusMeter();

      // Check if alert banner already visible
      let banner = document.getElementById('vienix-quota-alert-banner');
      if (banner) return;

      banner = document.createElement('div');
      banner.id = 'vienix-quota-alert-banner';
      banner.className = 'vienix-quota-alert-banner';
      banner.innerHTML = `
        <div class="quota-banner-inner">
          <div class="quota-banner-icon">🚨</div>
          <div class="quota-banner-text">
            <strong>تحذير حرج: ذاكرة المتصفح ممتلئة بالكامل (Storage Full)!</strong>
            <span>تعذر حفظ التعديل الأخير في الذاكرة المحلية. يرجى تصدير نسخة احتياطية فوراً لحفظ عملك وتفريغ بعض الصور أو النصوص.</span>
          </div>
          <div class="quota-banner-actions">
            <button class="quota-banner-btn-backup" onclick="VienixStorage.exportBackup()">
              💾 تصدير نسخة احتياطية الآن
            </button>
            <button class="quota-banner-btn-close" onclick="document.getElementById('vienix-quota-alert-banner').remove()">
              ✕
            </button>
          </div>
        </div>
      `;
      document.body.prepend(banner);
    },

    // ─────────────────────────────────────────────────────────────
    // 7. GENERIC REUSABLE MODAL DIALOG
    // ─────────────────────────────────────────────────────────────
    showCustomModal: function (options) {
      let overlay = document.getElementById('vienix-custom-modal-overlay');
      if (overlay) overlay.remove();

      overlay = document.createElement('div');
      overlay.id = 'vienix-custom-modal-overlay';
      overlay.className = 'vienix-custom-modal-overlay active';

      overlay.innerHTML = `
        <div class="vienix-custom-modal" onclick="event.stopPropagation()">
          <div class="vienix-custom-modal-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:1.4rem;">${options.icon || 'ℹ️'}</span>
              <h3 style="margin:0; font-size:1.05rem; font-weight:700;">${options.title}</h3>
            </div>
            <button class="vienix-custom-modal-close" onclick="document.getElementById('vienix-custom-modal-overlay').remove()">&times;</button>
          </div>
          <div class="vienix-custom-modal-body">
            ${options.content}
          </div>
          <div class="vienix-custom-modal-footer">
            ${options.cancelText ? `<button class="btn btn-ghost" onclick="document.getElementById('vienix-custom-modal-overlay').remove()">${options.cancelText}</button>` : ''}
            <button class="btn btn-primary" id="vienix-custom-modal-confirm-btn" style="${options.confirmColor ? `background:${options.confirmColor}; border-color:${options.confirmColor};` : ''}">
              ${options.confirmText || 'موافق'}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const confirmBtn = document.getElementById('vienix-custom-modal-confirm-btn');
      confirmBtn.addEventListener('click', () => {
        overlay.remove();
        if (typeof options.onConfirm === 'function') {
          options.onConfirm();
        }
      });
    },

    // ─────────────────────────────────────────────────────────────
    // 8. INITIALIZATION
    // ─────────────────────────────────────────────────────────────
    init: function () {
      // 1. Initial meter update
      this.updateStatusMeter();

      // 2. Check for post-restore flash notification
      if (sessionStorage.getItem('vienix_restore_success_flash')) {
        sessionStorage.removeItem('vienix_restore_success_flash');
        setTimeout(() => {
          this.showCustomModal({
            title: 'تمت استعادة بيئة العمل بنجاح! 🚀',
            icon: '✅',
            content: '<p style="color:var(--text-secondary);">تم استرجاع كافة الحجرات والمجلدات والملفات والإعدادات بنجاح من نسختك الاحتياطية، ومحررك جاهز للعمل الآن بكامل بياناتك.</p>',
            confirmText: 'رائع، فلنبدأ'
          });
        }, 300);
      }

      // 3. Periodic check every 45 seconds to catch external tab modifications
      setInterval(() => {
        this.updateStatusMeter();
      }, 45000);
    }
  };

  // Expose to window
  window.VienixStorage = VienixStorage;

  // Global helper for opening settings to specific tab
  window.openSettingsModalToTab = function (tabId) {
    if (typeof window.openSettingsModal === 'function') {
      window.openSettingsModal();
      if (typeof window.switchSettingsTab === 'function') {
        window.switchSettingsTab(tabId);
      }
    }
  };

  // Global shortcuts for direct menu buttons
  window.exportFullWorkspaceBackup = function () {
    VienixStorage.exportBackup();
  };

  window.triggerRestoreWorkspaceBackup = function () {
    VienixStorage.triggerRestore();
  };

  // Auto-init on DOMContentLoaded or immediate if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VienixStorage.init());
  } else {
    VienixStorage.init();
  }

})();
