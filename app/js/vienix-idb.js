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
        if (!this.db) {
          try { localStorage.setItem(key, value); } catch (e) {}
          return resolve(true);
        }

        try {
          const tx = this.db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(value, key);

          tx.oncomplete = () => {
            // Also attempt to keep light items in localStorage for dual-layer safety
            // but ignore quota errors silently because IndexedDB has the true copy!
            try {
              if (typeof value === 'string' && value.length < 50000) {
                localStorage.setItem(key, value);
              }
            } catch (quotaErr) {}
            resolve(true);
          };

          tx.onerror = (e) => {
            console.warn('[VienixIDB] Write error:', e.target.error);
            try { localStorage.setItem(key, value); } catch (q) {}
            resolve(false);
          };
        } catch (e) {
          try { localStorage.setItem(key, value); } catch (q) {}
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

  // Immediate database bootstrap
  VienixIDB.openDB();

})();
