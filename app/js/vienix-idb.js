/**
 * ============================================================================
 * Vienix Markdown Editor - IndexedDB Next-Gen Storage Adapter (Phase 1)
 * ============================================================================
 * Features:
 *  1. Virtually unlimited storage capacity (Gigabytes vs 5MB in LocalStorage)
 *  2. Transparent zero-config migration from LocalStorage on first launch
 *  3. In-memory synchronized cache for 0ms synchronous editor reads
 *  4. Non-blocking asynchronous writes that never freeze the main thread
 *  5. Full backward compatibility with existing getStored & safeSaveToStorage
 * ============================================================================
 */

(function () {
  'use strict';

  const DB_NAME = 'vienix_workspace_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'keyval';

  const VienixIDB = {
    db: null,
    isReady: false,
    memoryCache: {},
    initPromise: null,

    // ─────────────────────────────────────────────────────────────
    // 1. OPEN DATABASE
    // ─────────────────────────────────────────────────────────────
    openDB: function () {
      if (this.initPromise) return this.initPromise;

      this.initPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          console.warn('[VienixIDB] IndexedDB is not supported in this browser. Falling back to localStorage.');
          this.hydrateFromLocalStorage();
          this.isReady = true;
          return resolve(false);
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = async (event) => {
          this.db = event.target.result;
          this.isReady = true;

          // Hydrate memory cache from IndexedDB
          await this.hydrateMemoryCache();

          // Check and perform auto-migration from localStorage if needed
          await this.autoMigrateFromLocalStorage();

          resolve(true);
        };

        request.onerror = (event) => {
          console.error('[VienixIDB] IndexedDB open error:', event.target.error);
          this.hydrateFromLocalStorage();
          this.isReady = true;
          resolve(false);
        };
      });

      return this.initPromise;
    },

    // ─────────────────────────────────────────────────────────────
    // 2. CACHE HYDRATION (0ms Sync Access)
    // ─────────────────────────────────────────────────────────────
    hydrateMemoryCache: function () {
      return new Promise((resolve) => {
        if (!this.db) {
          this.hydrateFromLocalStorage();
          return resolve();
        }

        try {
          const transaction = this.db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const cursorRequest = store.openCursor();

          cursorRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              this.memoryCache[cursor.key] = cursor.value;
              cursor.continue();
            } else {
              // Also merge any existing localStorage items into memoryCache for safety
              this.hydrateFromLocalStorage();
              resolve();
            }
          };

          cursorRequest.onerror = () => {
            this.hydrateFromLocalStorage();
            resolve();
          };
        } catch (err) {
          this.hydrateFromLocalStorage();
          resolve();
        }
      });
    },

    hydrateFromLocalStorage: function () {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('vienix_') || key.startsWith('yaser_'))) {
            if (this.memoryCache[key] === undefined) {
              this.memoryCache[key] = localStorage.getItem(key);
            }
          }
        }
      } catch (e) {}
    },

    // ─────────────────────────────────────────────────────────────
    // 3. TRANSPARENT MIGRATION FROM LOCALSTORAGE
    // ─────────────────────────────────────────────────────────────
    autoMigrateFromLocalStorage: async function () {
      const MIGRATION_FLAG = 'vienix_idb_migrated_v1';
      if (this.memoryCache[MIGRATION_FLAG] === 'true' || localStorage.getItem(MIGRATION_FLAG) === 'true') {
        return; // Already migrated
      }

      console.info('[VienixIDB] Performing one-time transparent migration from localStorage to IndexedDB...');
      let migratedKeys = 0;

      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('vienix_') || key.startsWith('yaser_'))) {
            const val = localStorage.getItem(key);
            if (val !== null) {
              this.memoryCache[key] = val;
              await this.set(key, val);
              migratedKeys++;
            }
          }
        }

        // Set migration flag
        this.memoryCache[MIGRATION_FLAG] = 'true';
        await this.set(MIGRATION_FLAG, 'true');
        try { localStorage.setItem(MIGRATION_FLAG, 'true'); } catch (e) {}

        console.info(`[VienixIDB] Migration completed successfully: ${migratedKeys} items saved to IndexedDB.`);
      } catch (err) {
        console.warn('[VienixIDB] Migration warning:', err);
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 4. CORE ASYNC OPERATIONS
    // ─────────────────────────────────────────────────────────────
    get: function (key) {
      if (this.memoryCache[key] !== undefined) {
        return Promise.resolve(this.memoryCache[key]);
      }

      return new Promise((resolve) => {
        if (!this.db) {
          const fallback = localStorage.getItem(key);
          return resolve(fallback);
        }

        try {
          const tx = this.db.transaction([STORE_NAME], 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);

          req.onsuccess = () => {
            const val = req.result !== undefined ? req.result : localStorage.getItem(key);
            if (val !== undefined && val !== null) {
              this.memoryCache[key] = val;
            }
            resolve(val);
          };

          req.onerror = () => {
            resolve(localStorage.getItem(key));
          };
        } catch (e) {
          resolve(localStorage.getItem(key));
        }
      });
    },

    set: function (key, value) {
      // 1. Instant sync update in memory cache
      this.memoryCache[key] = value;

      // 2. Async persistent write into IndexedDB
      return new Promise((resolve) => {
        const isHistoryKey = typeof key === 'string' && key.startsWith('vienix_history_');

        if (!this.db) {
          if (!isHistoryKey) {
            try { localStorage.setItem(key, value); } catch (e) {}
          }
          return resolve(true);
        }

        try {
          const tx = this.db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(value, key);

          tx.oncomplete = () => {
            // Also attempt to keep light items in localStorage for dual-layer safety
            // but ignore quota errors silently because IndexedDB has the true copy!
            // IMPORTANT: Exclude large history snapshots from localStorage to prevent quota exhaustion
            try {
              if (!isHistoryKey && typeof value === 'string' && value.length < 50000) {
                localStorage.setItem(key, value);
              }
            } catch (quotaErr) {}
            resolve(true);
          };

          tx.onerror = (e) => {
            console.warn('[VienixIDB] Write error:', e.target.error);
            if (!isHistoryKey) {
              try { localStorage.setItem(key, value); } catch (q) {}
            }
            resolve(false);
          };
        } catch (e) {
          if (!isHistoryKey) {
            try { localStorage.setItem(key, value); } catch (q) {}
          }
          resolve(false);
        }
      });
    },

    remove: function (key) {
      delete this.memoryCache[key];
      return new Promise((resolve) => {
        try { localStorage.removeItem(key); } catch (e) {}
        if (!this.db) return resolve();

        try {
          const tx = this.db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    },

    getAll: function () {
      return new Promise((resolve) => {
        const result = Object.assign({}, this.memoryCache);

        if (!this.db) return resolve(result);

        try {
          const tx = this.db.transaction([STORE_NAME], 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.openCursor();

          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              result[cursor.key] = cursor.value;
              cursor.continue();
            } else {
              resolve(result);
            }
          };

          req.onerror = () => resolve(result);
        } catch (e) {
          resolve(result);
        }
      });
    },

    // ─────────────────────────────────────────────────────────────
    // 5. SYNCHRONOUS BRIDGES FOR RTLMD.JS
    // ─────────────────────────────────────────────────────────────
    getSync: function (key, legacyKey) {
      if (this.memoryCache[key] !== undefined && this.memoryCache[key] !== null) {
        return this.memoryCache[key];
      }
      if (legacyKey && this.memoryCache[legacyKey] !== undefined && this.memoryCache[legacyKey] !== null) {
        return this.memoryCache[legacyKey];
      }
      try {
        const val = localStorage.getItem(key);
        if (val !== null) {
          this.memoryCache[key] = val;
          return val;
        }
        if (legacyKey) {
          const legVal = localStorage.getItem(legacyKey);
          if (legVal !== null) {
            this.memoryCache[legacyKey] = legVal;
            return legVal;
          }
        }
      } catch (e) {}
      return null;
    },

    setSync: function (key, value) {
      // 1. Instant update in memory cache
      this.memoryCache[key] = value;

      // 2. Non-blocking asynchronous persist to IndexedDB
      this.set(key, value);

      // 3. Trigger live status meter update if available
      if (window.VienixStorage && typeof window.VienixStorage.updateStatusMeterDebounced === 'function') {
        window.VienixStorage.updateStatusMeterDebounced();
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 6. STORAGE QUOTA ESTIMATION
    // ─────────────────────────────────────────────────────────────
    estimateQuota: async function () {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          return {
            usageBytes: est.usage || 0,
            quotaBytes: est.quota || 0,
            usageMB: ((est.usage || 0) / (1024 * 1024)).toFixed(2),
            quotaGB: ((est.quota || 0) / (1024 * 1024 * 1024)).toFixed(1)
          };
        } catch (e) {}
      }
      return null;
    }
  };

  // Expose globally
  window.VienixIDB = VienixIDB;

  // Immediate synchronous cache hydration from localStorage so memoryCache is never empty
  VienixIDB.hydrateFromLocalStorage();

  // Immediate database bootstrap
  VienixIDB.openDB();

  // ============================================================================
  // Vienix Image Attachment & Reference Vault (Clean Markdown Image Engine)
  // ============================================================================
  const VienixImages = {
    // توليد معرّف فريد وموجز لمرفق الصورة
    generateId: function () {
      const timestamp = Date.now().toString(36);
      const rand = Math.random().toString(36).substring(2, 6);
      return `img_${timestamp}_${rand}`;
    },

    // حفظ الصورة في قاعدة بيانات IndexedDB واسترجاع المعرف الفريد
    saveImage: function (dataUrl, explicitId) {
      if (!dataUrl || typeof dataUrl !== 'string') return null;
      const id = explicitId || this.generateId();
      const storageKey = `vienix_image_${id}`;
      if (window.VienixIDB && typeof window.VienixIDB.setSync === 'function') {
        window.VienixIDB.setSync(storageKey, dataUrl);
      } else {
        try { localStorage.setItem(storageKey, dataUrl); } catch (e) {}
      }
      return id;
    },

    // جلب مسار الصورة الحقيقي (Data URL) عبر المعرف
    getImage: function (idOrUri) {
      if (!idOrUri || typeof idOrUri !== 'string') return null;
      const cleanId = idOrUri.replace(/^vienix-(?:img|image):\/\//i, '').trim();
      if (!cleanId) return null;
      const storageKey = `vienix_image_${cleanId}`;
      let val = null;
      if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
        val = window.VienixIDB.getSync(storageKey);
      }
      if (!val) {
        try { val = localStorage.getItem(storageKey); } catch (e) {}
      }
      return val;
    },

    // التحقق مما إذا كان الرابط يمثل مسار صورة خاص بفينيكس
    isVienixImageUri: function (uri) {
      return typeof uri === 'string' && /^vienix-(?:img|image):\/\//i.test(uri);
    },

    // تحويل أي كود Base64 مدمج داخل نص الماركداون إلى وسوم فينيكس النظيفة والمختصرة
    cleanseMarkdownImages: function (markdownText) {
      if (!markdownText || typeof markdownText !== 'string') return markdownText;
      if (!markdownText.includes('data:image/')) return markdownText;

      // 1. صيغة الماركداون القياسية: ![alt](data:image/...) أو ![alt|300px](data:image/...)
      const mdImgRegex = /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)/g;
      let cleaned = markdownText.replace(mdImgRegex, (match, altText, dataUrl) => {
        const id = this.saveImage(dataUrl);
        return `![${altText || 'صورة'}](vienix-img://${id})`;
      });

      // 2. صيغة وسوم HTML: <img ... src="data:image/..." ...>
      const htmlImgRegex = /<img\s+([^>]*?)src=["'](data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)["']([^>]*?)>/gi;
      cleaned = cleaned.replace(htmlImgRegex, (match, prefix, dataUrl, suffix) => {
        const id = this.saveImage(dataUrl);
        return `<img ${prefix}src="vienix-img://${id}" data-attachment-id="${id}"${suffix}>`;
      });

      return cleaned;
    },

    // تجهيز نص الماركداون للتصدير الخارجي لضمان توافقه التام مع برامج الماركداون الأخرى
    // يحافظ على متن المستند نظيفاً بصيغة المراجع ![alt][id] ويضع تعريفات Base64 في ذيل الملف
    prepareForExport: function (markdownText) {
      if (!markdownText || typeof markdownText !== 'string') return markdownText;
      const uriRegex = /!\[([^\]]*)\]\(vienix-(?:img|image):\/\/([a-zA-Z0-9_-]+)\)/g;
      const attachments = new Map();

      const textWithRefs = markdownText.replace(uriRegex, (match, altText, id) => {
        const dataUrl = this.getImage(id);
        if (dataUrl) {
          attachments.set(id, dataUrl);
          return `![${altText || 'صورة'}][${id}]`;
        }
        return match;
      });

      if (attachments.size === 0) return markdownText;

      let appendix = '\n\n<!-- مرفقات الصور المضمنة (Vienix Attachments) -->\n';
      attachments.forEach((dataUrl, id) => {
        appendix += `[${id}]: ${dataUrl}\n`;
      });

      return textWithRefs + appendix;
    }
  };

  // Expose VienixImages globally
  window.VienixImages = VienixImages;

})();
