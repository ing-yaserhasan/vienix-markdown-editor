/**
 * ============================================================================
 * Vienix Markdown Editor - Google Drive Cloud Sync Engine (Phase 2 - Robust)
 * ============================================================================
 * Architecture: Local-First + Personal Cloud (Zero Servers, Zero Leaks)
 *  - Scope: https://www.googleapis.com/auth/drive.file (Strictly isolated to app files)
 *  - Google Identity Services (GIS) OAuth 2.0 Token Client with Auto Refresh
 *  - App Folder: 'Vienix Notes' on Google Drive
 *  - Automatic Drive Versioning (PATCH media generates automatic revision history)
 *  - Exact Chamber Mapping: Tracks and updates existing Drive files by Chamber number
 *  - Honest Error Reporting: No fake successes or silent swallows
 *  - Bi-directional Smart Sync: Force Push, Force Pull, and Auto Smart Sync
 * ============================================================================
 */

(function () {
  'use strict';

  const DRIVE_FOLDER_NAME = 'Vienix Notes';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const GIS_SDK_URL = 'https://accounts.google.com/gsi/client';
  const DEFAULT_CLIENT_ID = '910465707186-ku2139v0blb6m9pkomehfc1dmdnp9lv5.apps.googleusercontent.com';

  let tokenClient = null;
  let autoSyncDebounceTimer = null;
  let tokenRequestResolvers = [];

  const VienixDrive = {
    accessToken: null,
    tokenExpiresAt: 0,
    userProfile: null,
    appFolderId: null,
    isSyncing: false,
    isAutoConnecting: false,
    lastSyncTime: null,
    lastSyncError: null,
    autoSyncEnabled: true,
    clientId: localStorage.getItem('vienix_google_client_id') || DEFAULT_CLIENT_ID,

    // ─────────────────────────────────────────────────────────────
    // 1. INITIALIZATION & SDK LOADER
    // ─────────────────────────────────────────────────────────────
    init: function () {
      const savedToken = localStorage.getItem('vienix_drive_token') || sessionStorage.getItem('vienix_drive_token');
      const savedExpiry = localStorage.getItem('vienix_drive_token_expires') || sessionStorage.getItem('vienix_drive_token_expires');
      const savedProfile = localStorage.getItem('vienix_drive_profile') || sessionStorage.getItem('vienix_drive_profile');
      const savedConnected = localStorage.getItem('vienix_drive_connected') === 'true';
      const savedFolder = localStorage.getItem('vienix_drive_folder_id');
      const savedLastSync = localStorage.getItem('vienix_drive_last_sync');

      if (savedFolder) this.appFolderId = savedFolder;
      if (savedLastSync) {
        const d = new Date(savedLastSync);
        if (!isNaN(d.getTime())) this.lastSyncTime = d;
      }

      if (savedProfile) {
        try { this.userProfile = JSON.parse(savedProfile); } catch (e) {}
      }

      const isTokenValid = savedToken && savedExpiry && Number(savedExpiry) > (Date.now() + 60000);

      if (isTokenValid) {
        this.accessToken = savedToken;
        this.tokenExpiresAt = Number(savedExpiry);
      } else if (savedConnected || this.userProfile) {
        // Connected previously, token expired/missing -> flag for silent auto-reconnect on startup
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        this.isAutoConnecting = true;
      }

      const autoSyncSetting = localStorage.getItem('vienix_drive_auto_sync');
      this.autoSyncEnabled = autoSyncSetting !== 'false';

      // ── After a Smart-Merge pull: auto-push the merged workspace back to Drive
      if (sessionStorage.getItem('vienix_post_merge_push_needed')) {
        sessionStorage.removeItem('vienix_post_merge_push_needed');
        if (this.accessToken) {
          setTimeout(() => {
            if (window.showToast) window.showToast('🔀 جارٍ رفع البيانات المدمجة إلى السحابة تلقائياً... ☁️', 'info', 3500);
            this.syncAllToDrive({ force: true, interactive: false });
          }, 2500);
        }
      }

      // ── Notify user that a pre-pull backup is still available in this session
      if (sessionStorage.getItem('vienix_pre_pull_backup')) {
        setTimeout(() => {
          if (window.showToast) {
            window.showToast('💾 نسخة احتياطية مؤقتة من بياناتك السابقة متاحة. يمكن تنزيلها من لوحة المزامنة.', 'info', 7000);
          }
        }, 1800);
      }

      this.loadGoogleSDK();
      this.updateUI();
    },

    loadGoogleSDK: function () {
      if (window.google && window.google.accounts) {
        this.initTokenClient();
        return;
      }

      if (!document.querySelector(`script[src="${GIS_SDK_URL}"]`)) {
        const script = document.createElement('script');
        script.src = GIS_SDK_URL;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          this.initTokenClient();
        };
        document.head.appendChild(script);
      }
    },

    initTokenClient: function () {
      if (!window.google || !window.google.accounts || !this.clientId) return;

      try {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: this.clientId,
          scope: DRIVE_SCOPE,
          callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              this.accessToken = tokenResponse.access_token;
              this.tokenExpiresAt = Date.now() + (Number(tokenResponse.expires_in) || 3600) * 1000;
              this.lastSyncError = null;
              this.isAutoConnecting = false;

              // Save permanently to localStorage
              localStorage.setItem('vienix_drive_token', this.accessToken);
              localStorage.setItem('vienix_drive_token_expires', String(this.tokenExpiresAt));
              localStorage.setItem('vienix_drive_connected', 'true');
              sessionStorage.setItem('vienix_drive_token', this.accessToken);
              sessionStorage.setItem('vienix_drive_token_expires', String(this.tokenExpiresAt));

              // Resolve pending token request promises
              const resolvers = tokenRequestResolvers.slice();
              tokenRequestResolvers = [];
              resolvers.forEach(r => r.resolve(this.accessToken));

              // Fetch user profile and ensure app folder
              await this.fetchUserProfile();
              await this.ensureAppFolder();
              this.updateUI();
            } else {
              this.isAutoConnecting = false;
              const errMsg = (tokenResponse && tokenResponse.error_description) || (tokenResponse && tokenResponse.error) || 'تعذر الحصول على إذن الاتصال من Google';
              const resolvers = tokenRequestResolvers.slice();
              tokenRequestResolvers = [];
              resolvers.forEach(r => r.reject(new Error(errMsg)));
              this.updateUI();
            }
          }
        });

        // Trigger silent auto-reconnect ONLY if returning user who was actively connected
        if (!this.accessToken && localStorage.getItem('vienix_drive_connected') === 'true') {
          this.silentAutoConnect();
        }
      } catch (err) {
        console.warn('[VienixDrive] Failed to init GIS token client:', err);
      }
    },

    setClientId: function (newId) {
      this.clientId = (newId || '').trim();
      localStorage.setItem('vienix_google_client_id', this.clientId);
      this.initTokenClient();
      this.updateUI();
    },

    // ─────────────────────────────────────────────────────────────
    // 2. AUTHENTICATION & TOKEN REFRESH
    // ─────────────────────────────────────────────────────────────
    silentAutoConnect: async function () {
      if (this.accessToken && Date.now() < (this.tokenExpiresAt - 60000)) return;
      if (localStorage.getItem('vienix_drive_connected') !== 'true') return;
      if (!tokenClient) return;

      console.log('[VienixDrive] Attempting silent background reconnect for existing user...');
      this.isAutoConnecting = true;
      this.updateUI();

      try {
        await this.requestToken(false);
        console.log('[VienixDrive] Silent auto-connect succeeded! ✓');
        this.isAutoConnecting = false;
        this.lastSyncError = null;
        this.updateUI();

        // If post-merge push was waiting for connection
        if (sessionStorage.getItem('vienix_post_merge_push_needed')) {
          sessionStorage.removeItem('vienix_post_merge_push_needed');
          setTimeout(() => {
            if (window.showToast) window.showToast('🔀 جارٍ رفع البيانات المدمجة إلى السحابة تلقائياً... ☁️', 'info', 3500);
            this.syncAllToDrive({ force: true, interactive: false });
          }, 2000);
        }
      } catch (err) {
        console.log('[VienixDrive] Silent auto-connect postponed (will refresh on user action):', err && err.message);
        this.isAutoConnecting = false;
        this.updateUI();
      }
    },

    requestToken: function (interactive = false) {
      return new Promise((resolve, reject) => {
        if (!window.google || !window.google.accounts) {
          this.loadGoogleSDK();
          setTimeout(() => {
            this.requestToken(interactive).then(resolve).catch(reject);
          }, 500);
          return;
        }

        if (!tokenClient) {
          this.initTokenClient();
        }

        if (!tokenClient) {
          return reject(new Error('تعذر تحميل واجهة Google Identity Services'));
        }

        tokenRequestResolvers.push({ resolve, reject });

        const email = (this.userProfile && this.userProfile.email) || localStorage.getItem('vienix_drive_connected_email');
        const reqConfig = {};

        if (interactive) {
          // Interactive login / switch: ALWAYS force Google Account Chooser
          // NEVER pass hint so Google doesn't lock to previous account!
          reqConfig.prompt = 'select_account';
        } else {
          // Silent background refresh for existing active connection
          reqConfig.prompt = '';
          if (email) {
            reqConfig.hint = email;
          }
        }

        try {
          tokenClient.requestAccessToken(reqConfig);
        } catch (e) {
          tokenRequestResolvers = tokenRequestResolvers.filter(r => r.resolve !== resolve);
          reject(e);
        }
      });
    },

    ensureValidToken: async function (interactive = false) {
      // 1. If in-memory token is valid (more than 60 seconds left)
      if (this.accessToken && Date.now() < (this.tokenExpiresAt - 60000)) {
        return this.accessToken;
      }

      // 2. Check localStorage in case another tab or background call refreshed it
      const storedToken = localStorage.getItem('vienix_drive_token');
      const storedExpiry = localStorage.getItem('vienix_drive_token_expires');
      if (storedToken && storedExpiry && Number(storedExpiry) > (Date.now() + 60000)) {
        this.accessToken = storedToken;
        this.tokenExpiresAt = Number(storedExpiry);
        return this.accessToken;
      }

      // 3. Token missing or expired -> attempt silent refresh first (or interactive if requested)
      try {
        return await this.requestToken(interactive);
      } catch (err) {
        if (interactive) throw err;
        this.accessToken = null;
        this.updateUI();
        throw new Error('انتهت جلسة تسجيل الدخول إلى Google Drive. انقر على زر السحابة لإعادة الاتصال.');
      }
    },

    reconnect: async function () {
      try {
        if (window.showToast) window.showToast('جارٍ استعادة الاتصال بـ Google Drive...', 'info', 1500);
        await this.ensureValidToken(false);
        await this.smartSync();
      } catch (err) {
        // If silent refresh failed, prompt interactively
        try {
          await this.requestToken(true);
          await this.smartSync();
        } catch (interactiveErr) {
          alert('تعذر تنشيط الاتصال بـ Google Drive: ' + interactiveErr.message);
        }
      }
    },

    connect: async function () {
      try {
        await this.requestToken(true);
        if (window.showToast) {
          window.showToast('تم الاتصال بـ Google Drive بنجاح ☁️✓', 'success', 2000);
        }

        // Smart workspace check on connection
        const isLocalEmpty = this.isLocalWorkspaceEmpty();
        const inventory = await this.getFolderInventory();

        if (isLocalEmpty && inventory && inventory.hasRemoteData) {
          if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
            window.VienixStorage.showCustomModal({
              title: 'تم العثور على ملفاتك في Google Drive! ☁️📥',
              icon: '📥',
              content: `<p style="color:var(--text-secondary);">أهلاً بك <strong>${this.userProfile ? this.userProfile.name : ''}</strong>!<br>تم ربط حسابك، ووجدنا ملفاتك وحجراتك السابقة في مجلد <strong>Vienix Notes</strong> على Google Drive.<br><br>هل ترغب في <strong>استيراد وتنزيل ملفاتك</strong> إلى هذا الجهاز الآن؟</p>`,
              confirmText: 'نعم، استيراد ملفاتي الآن',
              cancelText: 'تخطي والبدء بصفحة فارغة',
              onConfirm: () => { this.pullFromDrive({ force: true, interactive: false }); }
            });
          } else {
            if (confirm('تم العثور على ملفاتك في Google Drive. هل ترغب في استيرادها وتنزيلها الآن؟')) {
              this.pullFromDrive({ force: true, interactive: false });
            }
          }
        } else if (!isLocalEmpty && (!inventory || !inventory.hasRemoteData)) {
          if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
            window.VienixStorage.showCustomModal({
              title: 'تم الاتصال بـ Google Drive بنجاح! ☁️',
              icon: '✅',
              content: `<p style="color:var(--text-secondary);">أهلاً بك <strong>${this.userProfile ? this.userProfile.name : ''}</strong>! تم ربط حسابك السحابي، وأصبح بإمكانك مزامنة نصوصك وحجراتك مع مجلد <strong>Vienix Notes</strong> على Google Drive بأمان تام.</p>`,
              confirmText: 'ابدأ المزامنة الآن',
              onConfirm: () => { this.syncAllToDrive({ force: true, interactive: false }); }
            });
          }
        } else if (!isLocalEmpty && inventory && inventory.hasRemoteData) {
          // Both local and cloud have data — offer the user the diff preview
          if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
            window.VienixStorage.showCustomModal({
              title: 'يوجد ملفات على جهازك وعلى السحابة! 📱☁️',
              icon: '🔀',
              content: '<p style="color:var(--text-secondary);">' +
                'أهلاً بك <strong>' + (this.userProfile ? this.userProfile.name : '') + '</strong>!<br>' +
                'وجدنا ملفات على <strong>هذا الجهاز</strong> وأيضاً على <strong>Google Drive</strong>.<br><br>' +
                'اختر الإجراء المناسب:</p>',
              confirmText: '📥 استيراد من السحابة (مع مقارنة بصرية)',
              cancelText: '☁️ رفع ملفات الجهاز إلى السحابة',
              onConfirm: () => { this.pullFromDrive({ force: false, interactive: false }); },
              onCancel: () => { this.syncAllToDrive({ force: true, interactive: false }); }
            });
          }
        }
      } catch (err) {
        alert('تعذر ربط Google Drive: ' + err.message);
      }
    },

    handleCloudBtnClick: function () {
      if (!this.accessToken) {
        if (this.userProfile || localStorage.getItem('vienix_drive_connected') === 'true') {
          this.reconnect();
        } else {
          this.connect();
        }
      } else {
        this.smartSync();
      }
    },

    disconnect: function (silent = false) {
      if (this.accessToken && window.google && window.google.accounts) {
        try {
          window.google.accounts.oauth2.revoke(this.accessToken, () => {
            console.log('[VienixDrive] Access token revoked.');
          });
        } catch (e) {}
      }

      this.accessToken = null;
      this.tokenExpiresAt = 0;
      this.userProfile = null;
      this.appFolderId = null;
      this.lastSyncError = null;
      this.isAutoConnecting = false;
      tokenClient = null; // Reset GIS client instance for clean multi-account switching

      if (autoSyncDebounceTimer) {
        clearTimeout(autoSyncDebounceTimer);
        autoSyncDebounceTimer = null;
      }

      localStorage.removeItem('vienix_drive_token');
      localStorage.removeItem('vienix_drive_token_expires');
      localStorage.removeItem('vienix_drive_profile');
      localStorage.removeItem('vienix_drive_connected');
      localStorage.removeItem('vienix_drive_connected_email');
      localStorage.removeItem('vienix_drive_folder_id');
      localStorage.removeItem('vienix_drive_last_sync');
      sessionStorage.removeItem('vienix_drive_token');
      sessionStorage.removeItem('vienix_drive_token_expires');
      sessionStorage.removeItem('vienix_drive_profile');

      this.updateUI();

      if (!silent && window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
        window.VienixStorage.showCustomModal({
          title: 'تم تسجيل الخروج وفصل Google Drive',
          icon: '👋',
          content: '<p style="color:var(--text-secondary);">تم إلغاء الاتصال بالسحابة بنجاح. يمكنك الآن تسجيل الدخول بأي حساب Google آخر متى شئت، وتبقى جميع بياناتك مخزنة محلياً على جهازك بأمان.</p>',
          confirmText: 'حسناً'
        });
      }
    },

    switchAccount: async function () {
      this.disconnect(true);
      await this.connect();
    },

    fetchUserProfile: async function () {
      if (!this.accessToken) return;
      try {
        const res = await this.driveFetch('https://www.googleapis.com/drive/v3/about?fields=user');
        const data = await res.json();
        if (data && data.user) {
          this.userProfile = {
            name: data.user.displayName || 'مستخدم Google Drive',
            email: data.user.emailAddress || '',
            picture: data.user.photoLink || ''
          };
          localStorage.setItem('vienix_drive_profile', JSON.stringify(this.userProfile));
          sessionStorage.setItem('vienix_drive_profile', JSON.stringify(this.userProfile));
          if (this.userProfile.email) {
            localStorage.setItem('vienix_drive_connected_email', this.userProfile.email);
          }
        }
      } catch (err) {
        console.warn('[VienixDrive] Failed to fetch user profile:', err);
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 3. SECURE DRIVE API FETCH WRAPPER
    // ─────────────────────────────────────────────────────────────
    driveFetch: async function (url, options = {}, isRetry = false) {
      const token = await this.ensureValidToken(false);
      const headers = Object.assign({}, options.headers || {}, {
        Authorization: `Bearer ${token}`
      });

      const res = await fetch(url, Object.assign({}, options, { headers }));

      if (res.status === 401 && !isRetry) {
        console.warn('[VienixDrive] 401 Unauthorized from Drive API. Attempting silent token renewal...');
        this.accessToken = null;
        sessionStorage.removeItem('vienix_drive_token');
        localStorage.removeItem('vienix_drive_token');
        try {
          await this.ensureValidToken(false);
          return await this.driveFetch(url, options, true);
        } catch (refreshErr) {
          this.lastSyncError = 'انتهت جلسة Google Drive. انقر على زر السحابة لإعادة الاتصال.';
          this.updateUI();
          throw new Error('انتهت جلسة تسجيل الدخول إلى Google Drive (401). يرجى النقر على زر السحابة لإعادة الاتصال.');
        }
      }

      if (!res.ok) {
        let errorDetail = '';
        try {
          const errJson = await res.json();
          if (errJson && errJson.error && errJson.error.message) {
            errorDetail = errJson.error.message;
          }
        } catch (e) {}
        throw new Error(errorDetail || `Google Drive API error (HTTP ${res.status})`);
      }

      return res;
    },

    // ─────────────────────────────────────────────────────────────
    // 4. DRIVE FOLDER & INVENTORY MANAGEMENT
    // ─────────────────────────────────────────────────────────────
    ensureAppFolder: async function () {
      if (this.appFolderId) {
        try {
          const res = await this.driveFetch(`https://www.googleapis.com/drive/v3/files/${this.appFolderId}?fields=id,name,trashed`);
          const data = await res.json();
          if (!data.trashed) return this.appFolderId;
        } catch (e) {
          this.appFolderId = null;
          localStorage.removeItem('vienix_drive_folder_id');
        }
      }

      // Search for folder by name
      try {
        const q = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const searchRes = await this.driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
        const searchData = await searchRes.json();

        if (searchData.files && searchData.files.length > 0) {
          this.appFolderId = searchData.files[0].id;
          localStorage.setItem('vienix_drive_folder_id', this.appFolderId);
          return this.appFolderId;
        }

        // Create folder if not found
        const createRes = await this.driveFetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: DRIVE_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            description: 'Vienix Markdown Editor Workspace Sync Folder'
          })
        });
        const folderData = await createRes.json();
        this.appFolderId = folderData.id;
        localStorage.setItem('vienix_drive_folder_id', this.appFolderId);
        return this.appFolderId;
      } catch (err) {
        console.error('[VienixDrive] Error ensuring app folder:', err);
        throw err;
      }
    },

    getFolderInventory: async function () {
      const folderId = await this.ensureAppFolder();
      if (!folderId) throw new Error('تعذر العثور على مجلد Vienix Notes على Google Drive');

      const q = `'${folderId}' in parents and trashed=false`;
      const res = await this.driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,size,mimeType)&pageSize=100`);
      const data = await res.json();
      const files = data.files || [];

      const manifestFile = files.find(f => f.name === 'vienix_workspace_manifest.json') || null;

      // Group chamber files by chamber number
      const chamberFiles = new Map(); // chNum -> [fileObj, ...]
      let remoteTime = 0;

      if (manifestFile && manifestFile.modifiedTime) {
        remoteTime = new Date(manifestFile.modifiedTime).getTime();
      }

      files.forEach(f => {
        const match = f.name.match(/^Chamber_(\d+)(?:_(.*))?\.md$/i);
        if (match) {
          const chNum = parseInt(match[1], 10);
          if (!chamberFiles.has(chNum)) chamberFiles.set(chNum, []);
          chamberFiles.get(chNum).push(f);

          if (f.modifiedTime) {
            const mt = new Date(f.modifiedTime).getTime();
            if (mt > remoteTime) remoteTime = mt;
          }
        }
      });

      const hasRemoteData = (manifestFile && Number(manifestFile.size || 0) > 20) || chamberFiles.size > 0;

      return {
        folderId,
        files,
        manifestFile,
        chamberFiles,
        remoteTime,
        hasRemoteData
      };
    },

    uploadOrUpdateDriveFile: async function (filename, content, mimeType, existingFileId) {
      if (existingFileId) {
        // 1. Update file media content (Triggers Drive revision history)
        await this.driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Content-Type': mimeType
          },
          body: content
        });

        // 2. Ensure filename is up-to-date
        await this.driveFetch(`https://www.googleapis.com/drive/v3/files/${existingFileId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: filename })
        });

        return { id: existingFileId, updated: true };
      } else {
        // Multipart POST to create file with metadata inside app folder
        const boundary = '-------314159265358979323846';
        const metadata = {
          name: filename,
          parents: [this.appFolderId]
        };

        const multipartBody =
          '--' + boundary + '\r\n' +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) + '\r\n' +
          '--' + boundary + '\r\n' +
          'Content-Type: ' + mimeType + '\r\n\r\n' +
          content + '\r\n' +
          '--' + boundary + '--';

        const res = await this.driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        });
        return await res.json();
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 5. PUSH TO DRIVE (FULL WORKSPACE MIRRORING & UPLOAD)
    // ─────────────────────────────────────────────────────────────
    syncAllToDrive: async function (options = {}) {
      if (this.isSyncing) return;
      this.isSyncing = true;
      this.updateUI();

      try {
        await this.ensureValidToken(options.interactive || false);

        console.log('[VienixDrive] Starting full workspace sync to Google Drive...');
        const inventory = await this.getFolderInventory();
        let syncedChambers = 0;

        const localSnapshot = this._getLocalChamberSnapshot();
        const allTargetNums = new Set([...Array.from({length: 7}, (_, i) => i + 1), ...localSnapshot.keys()]);
        let maxCh = 8;
        allTargetNums.forEach(n => { if (n > maxCh) maxCh = n; });

        // 1. Sync every active chamber and folder file
        for (const ch of Array.from(allTargetNums).sort((a, b) => a - b)) {
          let content = '';
          let title = '';

          if (localSnapshot.has(ch)) {
            const item = localSnapshot.get(ch);
            content = item.content || '';
            title = item.title || (ch >= 8 ? `ملف ${ch}` : `Chamber_${ch}`);
          }

          const remoteFiles = inventory.chamberFiles.get(ch) || [];

          if (content.trim().length > 0) {
            const cleanTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim();
            const targetFilename = `Chamber_${ch}_${cleanTitle}.md`;

            // Existing remote file mapped to this chamber number
            const primaryRemoteFile = remoteFiles.length > 0 ? remoteFiles[0] : null;

            await this.uploadOrUpdateDriveFile(
              targetFilename,
              content,
              'text/markdown; charset=utf-8',
              primaryRemoteFile ? primaryRemoteFile.id : null
            );
            syncedChambers++;

            // Clean up any extra duplicate files for this chamber (from previous bugs)
            if (remoteFiles.length > 1) {
              for (let i = 1; i < remoteFiles.length; i++) {
                try {
                  await this.driveFetch(`https://www.googleapis.com/drive/v3/files/${remoteFiles[i].id}`, { method: 'DELETE' });
                } catch (e) {}
              }
            }
          } else if (remoteFiles.length > 0) {
            // Chamber is empty locally -> ALWAYS delete stale remote files from Google Drive!
            for (const rf of remoteFiles) {
              try {
                await this.driveFetch(`https://www.googleapis.com/drive/v3/files/${rf.id}`, { method: 'DELETE' });
              } catch (e) {}
            }
          }
        }

        // Clean up any orphan files on Google Drive for chambers not in current workspace
        for (const [chNum, files] of inventory.chamberFiles.entries()) {
          if (!allTargetNums.has(chNum)) {
            for (const rf of files) {
              try {
                await this.driveFetch(`https://www.googleapis.com/drive/v3/files/${rf.id}`, { method: 'DELETE' });
              } catch (e) {}
            }
          }
        }

        // 2. Upload full workspace snapshot manifest
        const manifest = {
          app: 'Vienix Markdown Editor',
          timestamp: new Date().toISOString(),
          rawKeys: {}
        };

        const isLayoutKey = (k) => /^(?:vienix|yaser)_(?:dock_pos|split_pct|dock_version)/.test(k);

        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('vienix_') || k.startsWith('yaser_')) && !k.startsWith('vienix_history_') && !isLayoutKey(k)) {
            manifest.rawKeys[k] = localStorage.getItem(k);
          }
        }

        if (window.VienixIDB && window.VienixIDB.memoryCache) {
          Object.keys(window.VienixIDB.memoryCache).forEach(k => {
            if (!k.startsWith('vienix_history_') && !isLayoutKey(k)) {
              manifest.rawKeys[k] = window.VienixIDB.memoryCache[k];
            }
          });
        }

        // Explicitly set chambers in manifest from localSnapshot to reflect actual values
        allTargetNums.forEach(ch => {
          let chVal = '';
          if (localSnapshot.has(ch)) {
            chVal = localSnapshot.get(ch).content || '';
          }
          manifest.rawKeys['vienix_chamber_' + ch] = chVal;
          manifest.rawKeys['yaser_chamber_' + ch] = chVal;
          if (!chVal || chVal.trim().length === 0) {
            delete manifest.rawKeys['vienix_chamber_meta_' + ch];
            delete manifest.rawKeys['yaser_chamber_meta_' + ch];
          }
        });

        // Strip orphan chamber keys not in current workspace
        Object.keys(manifest.rawKeys).forEach(k => {
          const m = k.match(/^(?:vienix|yaser)_chamber_(?:meta_)?(\d+)$/);
          if (m && !allTargetNums.has(parseInt(m[1], 10))) {
            delete manifest.rawKeys[k];
          }
        });

        // 2b. Explicitly bundle custom folders and nested folders hierarchy
        try {
          const rawCustomFolders = localStorage.getItem('vienix_custom_folders');
          if (rawCustomFolders) {
            manifest.customFolders = JSON.parse(rawCustomFolders);
          }
          const rawFolderOverrides = localStorage.getItem('vienix_folder_name_overrides');
          if (rawFolderOverrides) {
            manifest.folderNameOverrides = JSON.parse(rawFolderOverrides);
          }
          const rawDeletedFolders = localStorage.getItem('vienix_deleted_default_folders');
          if (rawDeletedFolders) {
            manifest.deletedDefaultFolders = JSON.parse(rawDeletedFolders);
          }
        } catch (e) {}

        // 2c. Explicitly bundle folder files across ALL folders (including custom/nested folders)
        manifest.folderFiles = {};
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('vienix_folder_files_')) {
              try {
                manifest.folderFiles[k] = JSON.parse(localStorage.getItem(k));
              } catch (e) {
                manifest.folderFiles[k] = localStorage.getItem(k);
              }
            }
          }
          if (window.VienixIDB && window.VienixIDB.memoryCache) {
            Object.keys(window.VienixIDB.memoryCache).forEach(k => {
              if (k.startsWith('vienix_folder_files_') && !manifest.folderFiles[k]) {
                try {
                  manifest.folderFiles[k] = JSON.parse(window.VienixIDB.memoryCache[k]);
                } catch (e) {
                  manifest.folderFiles[k] = window.VienixIDB.memoryCache[k];
                }
              }
            });
          }

          // Ensure latest content of active explorer file in Chamber 8 is embedded in manifest.folderFiles
          let activeExpFile = null;
          const rawAct = localStorage.getItem('vienix_active_explorer_file');
          if (rawAct) activeExpFile = JSON.parse(rawAct);
          const ch8Content = (window.VienixIDB && typeof window.VienixIDB.getSync === 'function')
            ? (window.VienixIDB.getSync('vienix_chamber_8', 'yaser_chamber_8') || '')
            : (localStorage.getItem('vienix_chamber_8') || '');

          if (activeExpFile && activeExpFile.folderKey && activeExpFile.fileId && ch8Content) {
            const fKey = 'vienix_folder_files_' + activeExpFile.folderKey;
            if (manifest.folderFiles[fKey] && Array.isArray(manifest.folderFiles[fKey])) {
              const activeF = manifest.folderFiles[fKey].find(item => item && item.id === activeExpFile.fileId);
              if (activeF) {
                activeF.content = ch8Content;
                activeF.updatedAt = Date.now();
              }
            }
          }
        } catch (e) {}

        await this.uploadOrUpdateDriveFile(
          'vienix_workspace_manifest.json',
          JSON.stringify(manifest, null, 2),
          'application/json; charset=utf-8',
          inventory.manifestFile ? inventory.manifestFile.id : null
        );

        // 3. Mark success
        this.lastSyncTime = new Date();
        this.lastSyncError = null;
        localStorage.setItem('vienix_drive_last_sync', this.lastSyncTime.toISOString());
        console.log(`[VienixDrive] Sync finished: ${syncedChambers} chambers and manifest updated on Drive.`);

        if (window.VienixStorage && typeof window.VienixStorage.updateStatusMeter === 'function') {
          window.VienixStorage.updateStatusMeter();
        }

        if (window.showToast) {
          window.showToast(`تمت مزامنة ورفع مساحة العمل (${syncedChambers} حجرة) إلى Google Drive بنجاح ☁️✓`, 'success', 2500);
        }
      } catch (err) {
        console.error('[VienixDrive] Sync failed:', err);
        this.lastSyncError = err.message;
        if (window.showToast) {
          window.showToast(`تعذر إتمام المزامنة مع Google Drive: ${err.message} ⚠️`, 'error', 4500);
        }
        // Always alert on push failure so user knows it didn't work
        alert(`تعذر إتمام المزامنة مع Google Drive:\n${err.message}`);
      } finally {
        this.isSyncing = false;
        this.updateUI();
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 6. WORKSPACE INSPECTION HELPERS
    // ─────────────────────────────────────────────────────────────
    isLocalWorkspaceEmpty: function () {
      const maxCh = typeof window.VienixGetTotalChambers === 'function' ? window.VienixGetTotalChambers() : 8;
      let totalLength = 0;
      let otherChambersLength = 0;
      let ch1Text = '';

      for (let ch = 1; ch <= maxCh; ch++) {
        let content = '';
        if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
          content = window.VienixIDB.getSync('vienix_chamber_' + ch, 'yaser_chamber_' + ch) || '';
        } else {
          content = localStorage.getItem('vienix_chamber_' + ch) || localStorage.getItem('yaser_chamber_' + ch) || '';
        }
        if (ch === 1 && !content) {
          content = localStorage.getItem('vienix_md_content') || '';
        }
        const len = (content || '').trim().length;
        totalLength += len;
        if (ch === 1) {
          ch1Text = (content || '').trim();
        } else {
          otherChambersLength += len;
        }
      }

      // Check custom folders
      try {
        const rawFolders = localStorage.getItem('vienix_custom_folders');
        if (rawFolders) {
          const parsed = JSON.parse(rawFolders);
          if (Array.isArray(parsed) && parsed.length > 0) {
            totalLength += parsed.length * 10;
            otherChambersLength += parsed.length * 10;
          }
        }
      } catch (e) {}

      if (totalLength === 0) return true;

      // If only chamber 1 has text, but it is the default welcome/intro template, treat as fresh/empty
      if (otherChambersLength === 0 && (
        ch1Text.includes('Vienix Markdown') ||
        ch1Text.includes('مرحباً بك في') ||
        ch1Text.includes('محرر ماركداون عربي')
      )) {
        return true;
      }

      return false;
    },

    getLocalLastModifiedTime: function () {
      let maxTime = 0;
      const maxCh = typeof window.VienixGetTotalChambers === 'function' ? window.VienixGetTotalChambers() : 8;
      for (let ch = 1; ch <= maxCh; ch++) {
        let raw = null;
        if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
          raw = window.VienixIDB.getSync('vienix_chamber_meta_' + ch, 'yaser_chamber_meta_' + ch);
        } else {
          raw = localStorage.getItem('vienix_chamber_meta_' + ch) || localStorage.getItem('yaser_chamber_meta_' + ch);
        }
        if (raw) {
          try {
            const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (meta && meta.updatedAt) {
              const t = Number(meta.updatedAt);
              if (t > maxTime) maxTime = t;
            }
          } catch (e) {}
        }
      }
      return maxTime;
    },

    // ─────────────────────────────────────────────────────────────
    // 7. PULL FROM DRIVE (WITH DIFF PREVIEW + SILENT BACKUP + SMART MERGE)
    // ─────────────────────────────────────────────────────────────

    /**
     * Collects local chamber and folder file data for comparison purposes.
     * Returns a Map of chNum -> { content, meta, title, wordCount }
     */
    _getLocalChamberSnapshot: function () {
      const localChambers = new Map();

      // 1. Gather fixed chambers 1 to 7
      for (let ch = 1; ch <= 7; ch++) {
        let content = '';
        let metaRaw = null;
        if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
          content = window.VienixIDB.getSync('vienix_chamber_' + ch, 'yaser_chamber_' + ch) || '';
          metaRaw = window.VienixIDB.getSync('vienix_chamber_meta_' + ch, 'yaser_chamber_meta_' + ch) || null;
        } else {
          content = localStorage.getItem('vienix_chamber_' + ch) || localStorage.getItem('yaser_chamber_' + ch) || '';
          metaRaw = localStorage.getItem('vienix_chamber_meta_' + ch) || localStorage.getItem('yaser_chamber_meta_' + ch) || null;
        }
        if (ch === 1 && !content) {
          content = (window.VienixIDB && typeof window.VienixIDB.getSync === 'function')
            ? (window.VienixIDB.getSync('vienix_md_content', 'yaser_md_content') || '')
            : (localStorage.getItem('vienix_md_content') || localStorage.getItem('yaser_md_content') || '');
        }
        if (content && content.trim().length > 0) {
          let title = '';
          if (metaRaw) {
            try {
              const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw;
              title = (meta && meta.customTitle) ? meta.customTitle : '';
            } catch (e) {}
          }
          localChambers.set(ch, {
            content: content,
            meta: metaRaw,
            title: title || ('حجرة ' + ch),
            wordCount: (content.trim().match(/\S+/g) || []).length
          });
        }
      }

      // 2. Gather Explorer Folder Files from ALL folders (book, drafts, archive, and all custom/nested folders)
      try {
        let activeExpFile = null;
        try {
          const rawAct = localStorage.getItem('vienix_active_explorer_file');
          if (rawAct) activeExpFile = JSON.parse(rawAct);
        } catch (e) {}

        let activeCh8Val = '';
        if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
          activeCh8Val = window.VienixIDB.getSync('vienix_chamber_8', 'yaser_chamber_8') || '';
        } else {
          activeCh8Val = localStorage.getItem('vienix_chamber_8') || '';
        }

        // Collect all folder file keys from localStorage and memoryCache
        const allFolderKeys = new Set();
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('vienix_folder_files_')) allFolderKeys.add(k);
        }
        if (window.VienixIDB && window.VienixIDB.memoryCache) {
          Object.keys(window.VienixIDB.memoryCache).forEach(k => {
            if (k && k.startsWith('vienix_folder_files_')) allFolderKeys.add(k);
          });
        }
        allFolderKeys.add('vienix_folder_files_book');
        allFolderKeys.add('vienix_folder_files_drafts');
        allFolderKeys.add('vienix_folder_files_archive');

        let nextSafeNum = 8;
        allFolderKeys.forEach(fk => {
          let raw = null;
          if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
            raw = window.VienixIDB.getSync(fk);
          }
          if (!raw) raw = localStorage.getItem(fk);
          if (raw) {
            try {
              const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
              if (Array.isArray(list)) {
                list.forEach(f => {
                  if (f && typeof f.num === 'number' && f.num >= nextSafeNum) {
                    nextSafeNum = f.num + 1;
                  }
                });
              }
            } catch (e) {}
          }
        });

        allFolderKeys.forEach(fk => {
          const folderKeyName = fk.replace('vienix_folder_files_', '');
          let fileList = null;
          if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
            const raw = window.VienixIDB.getSync(fk);
            if (raw) fileList = typeof raw === 'string' ? JSON.parse(raw) : raw;
          }
          if (!fileList) {
            const raw = localStorage.getItem(fk);
            if (raw) {
              try { fileList = JSON.parse(raw); } catch (e) {}
            }
          }

          if (Array.isArray(fileList)) {
            let listDirty = false;
            fileList.forEach(f => {
              if (!f) return;
              if (typeof f.num !== 'number' || f.num < 8 || (localChambers.has(f.num) && localChambers.get(f.num).fileId !== f.id)) {
                f.num = nextSafeNum++;
                listDirty = true;
              }
              const num = f.num;
              let fileContent = f.content || '';
              if (activeExpFile && activeExpFile.fileId === f.id && activeCh8Val && activeCh8Val.trim().length > 0) {
                fileContent = activeCh8Val;
                f.content = activeCh8Val;
                listDirty = true;
              }
              if (fileContent && fileContent.trim().length > 0) {
                const metaObj = {
                  customTitle: f.title || ('ملف ' + num),
                  folder: folderKeyName,
                  fileId: f.id
                };
                localChambers.set(num, {
                  content: fileContent,
                  meta: JSON.stringify(metaObj),
                  title: f.title || ('ملف ' + num),
                  wordCount: (fileContent.trim().match(/\S+/g) || []).length,
                  folderKey: folderKeyName,
                  fileId: f.id
                });
              }
            });
            if (listDirty) {
              try {
                localStorage.setItem(fk, JSON.stringify(fileList));
                if (window.VienixIDB && typeof window.VienixIDB.set === 'function') {
                  window.VienixIDB.set(fk, JSON.stringify(fileList));
                }
              } catch (e) {}
            }
          }
        });
      } catch (e) {
        console.warn('[VienixDrive] Error reading folder files for snapshot:', e);
      }

      // 3. Gather any other explicit chamber keys stored in memoryCache / localStorage (8..50)
      for (let ch = 8; ch <= 50; ch++) {
        if (localChambers.has(ch)) continue;
        let content = '';
        let metaRaw = null;
        if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
          content = window.VienixIDB.getSync('vienix_chamber_' + ch, 'yaser_chamber_' + ch) || '';
          metaRaw = window.VienixIDB.getSync('vienix_chamber_meta_' + ch, 'yaser_chamber_meta_' + ch) || null;
        } else {
          content = localStorage.getItem('vienix_chamber_' + ch) || localStorage.getItem('yaser_chamber_' + ch) || '';
          metaRaw = localStorage.getItem('vienix_chamber_meta_' + ch) || localStorage.getItem('yaser_chamber_meta_' + ch) || null;
        }
        if (content && content.trim().length > 0) {
          let title = '';
          if (metaRaw) {
            try {
              const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw;
              title = (meta && meta.customTitle) ? meta.customTitle : '';
            } catch (e) {}
          }
          localChambers.set(ch, {
            content: content,
            meta: metaRaw,
            title: title || (ch >= 8 ? ('ملف ' + ch) : ('حجرة ' + ch)),
            wordCount: (content.trim().match(/\S+/g) || []).length
          });
        }
      }

      return localChambers;
    },

    /**
     * Extracts cloud chamber info from a manifest for comparison.
     * Returns a Map of chNum -> { content, meta, title, wordCount }
     */
    _getCloudChamberSnapshot: function (manifest) {
      const cloudChambers = new Map();
      if (!manifest) return cloudChambers;

      if (manifest.rawKeys) {
        Object.keys(manifest.rawKeys).forEach(k => {
          const m = k.match(/^(?:vienix|yaser)_chamber_(\d+)$/);
          if (m) {
            const chNum = parseInt(m[1], 10);
            const val = manifest.rawKeys[k];
            if (val !== null && val !== undefined && String(val).trim().length > 0) {
              const strVal = String(val);
              if (!cloudChambers.has(chNum)) cloudChambers.set(chNum, { content: '', title: '', meta: null, wordCount: 0 });
              cloudChambers.get(chNum).content = strVal;
              cloudChambers.get(chNum).wordCount = (strVal.trim().match(/\S+/g) || []).length;
            }
          }
          const mMeta = k.match(/^(?:vienix|yaser)_chamber_meta_(\d+)$/);
          if (mMeta) {
            const chNum = parseInt(mMeta[1], 10);
            const val = manifest.rawKeys[k];
            if (val) {
              try {
                const meta = typeof val === 'string' ? JSON.parse(val) : val;
                if (meta && meta.customTitle && cloudChambers.has(chNum)) {
                  cloudChambers.get(chNum).title = meta.customTitle;
                  cloudChambers.get(chNum).meta = val;
                }
              } catch (e) {}
            }
          }
        });
      }

      // Check cloud folderFiles across ALL folders (book, drafts, archive, and all custom/nested folders)
      try {
        const cloudFolderKeys = new Set();
        if (manifest.folderFiles && typeof manifest.folderFiles === 'object') {
          Object.keys(manifest.folderFiles).forEach(k => {
            if (k.startsWith('vienix_folder_files_')) cloudFolderKeys.add(k);
          });
        }
        if (manifest.rawKeys && typeof manifest.rawKeys === 'object') {
          Object.keys(manifest.rawKeys).forEach(k => {
            if (k.startsWith('vienix_folder_files_')) cloudFolderKeys.add(k);
          });
        }

        cloudFolderKeys.forEach(k => {
          let fileList = null;
          if (manifest.folderFiles && manifest.folderFiles[k]) {
            fileList = manifest.folderFiles[k];
          } else if (manifest.rawKeys && manifest.rawKeys[k]) {
            const raw = manifest.rawKeys[k];
            fileList = typeof raw === 'string' ? JSON.parse(raw) : raw;
          }
          if (Array.isArray(fileList)) {
            fileList.forEach(f => {
              if (!f) return;
              const num = typeof f.num === 'number' ? f.num : 8;
              const fileContent = f.content || '';
              if (fileContent && fileContent.trim().length > 0) {
                if (!cloudChambers.has(num)) {
                  cloudChambers.set(num, {
                    content: fileContent,
                    meta: null,
                    title: f.title || ('ملف ' + num),
                    wordCount: (fileContent.trim().match(/\S+/g) || []).length
                  });
                } else if (f.title) {
                  cloudChambers.get(num).title = f.title;
                }
              }
            });
          }
        });
      } catch (e) {}

      // Fill missing titles for populated cloud chambers
      cloudChambers.forEach((data, chNum) => {
        if (!data.title) {
          data.title = chNum >= 8 ? ('ملف ' + chNum) : ('حجرة ' + chNum);
        }
      });

      return cloudChambers;
    },

    /**
     * Builds and shows the Diff Preview modal (Feature 4).
     * The user chooses: Full Replace, Smart Merge, or Cancel.
     */
    _showDiffPreviewModal: function (localChambers, cloudChambers, manifest) {
      const allChNums = new Set([...localChambers.keys(), ...cloudChambers.keys()]);
      const sorted = Array.from(allChNums).sort((a, b) => a - b);

      let tableRows = '';
      let localOnlyCount = 0;
      let cloudOnlyCount = 0;
      let bothCount = 0;

      sorted.forEach(ch => {
        const hasLocal = localChambers.has(ch);
        const hasCloud = cloudChambers.has(ch);
        const localTitle = hasLocal ? localChambers.get(ch).title : '';
        const cloudTitle = hasCloud ? cloudChambers.get(ch).title : '';
        const localWords = hasLocal ? localChambers.get(ch).wordCount : 0;
        const cloudWords = hasCloud ? cloudChambers.get(ch).wordCount : 0;
        const displayTitle = cloudTitle || localTitle || ('\u062d\u062c\u0631\u0629 ' + ch);

        let action = '';
        let actionColor = '';
        let actionIcon = '';

        if (hasCloud && hasLocal) {
          action = '\u0633\u064a\u064f\u0633\u062a\u0628\u062f\u0644 \u0628\u0627\u0644\u0633\u062d\u0627\u0628\u0629';
          actionColor = '#6366f1';
          actionIcon = '\uD83D\uDD04';
          bothCount++;
        } else if (hasCloud && !hasLocal) {
          action = '\u0633\u064a\u064f\u0636\u0627\u0641 \u0645\u0646 \u0627\u0644\u0633\u062d\u0627\u0628\u0629';
          actionColor = '#10b981';
          actionIcon = '\uD83D\uDCE5';
          cloudOnlyCount++;
        } else if (!hasCloud && hasLocal) {
          action = '\u26A0\uFE0F \u0633\u064a\u064f\u062d\u0630\u0641 (\u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f \u0641\u064a \u0627\u0644\u0633\u062d\u0627\u0628\u0629)';
          actionColor = '#ef4444';
          actionIcon = '\uD83D\uDDD1\uFE0F';
          localOnlyCount++;
        }

        tableRows += '<tr style="border-bottom:1px solid var(--border-color);">' +
          '<td style="padding:8px 10px; font-weight:600; white-space:nowrap;">' + (ch >= 8 ? ('ملف ' + ch) : ('حجرة ' + ch)) + '</td>' +
          '<td style="padding:8px 10px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + displayTitle + '">' + displayTitle + '</td>' +
          '<td style="padding:8px 10px; text-align:center;">' +
            (hasLocal ? '<span style="color:#10b981;">\u2705 (' + localWords + ' \u0643\u0644\u0645\u0629)</span>' : '<span style="color:var(--text-muted);">\u2014</span>') +
          '</td>' +
          '<td style="padding:8px 10px; text-align:center;">' +
            (hasCloud ? '<span style="color:#6366f1;">\u2705 (' + cloudWords + ' \u0643\u0644\u0645\u0629)</span>' : '<span style="color:var(--text-muted);">\u2014</span>') +
          '</td>' +
          '<td style="padding:8px 10px; color:' + actionColor + '; font-size:0.8rem; font-weight:600;">' +
            actionIcon + ' ' + action +
          '</td>' +
          '</tr>';
      });

      // Summary badges
      var summaryParts = [];
      if (bothCount > 0) summaryParts.push('<span style="background:rgba(99,102,241,0.12); color:#6366f1; padding:4px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid rgba(99,102,241,0.3);">\uD83D\uDD04 ' + bothCount + ' \u0645\u0634\u062a\u0631\u0643\u0629</span>');
      if (cloudOnlyCount > 0) summaryParts.push('<span style="background:rgba(16,185,129,0.12); color:#10b981; padding:4px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid rgba(16,185,129,0.3);">\uD83D\uDCE5 ' + cloudOnlyCount + ' \u062c\u062f\u064a\u062f\u0629 \u0645\u0646 \u0627\u0644\u0633\u062d\u0627\u0628\u0629</span>');
      if (localOnlyCount > 0) summaryParts.push('<span style="background:rgba(239,68,68,0.12); color:#ef4444; padding:4px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; border:1px solid rgba(239,68,68,0.3);">\u26A0\uFE0F ' + localOnlyCount + ' \u0633\u062a\u064f\u062d\u0630\u0641 \u0625\u0646 \u0644\u0645 \u062a\u062f\u0645\u062c</span>');
      var summaryHtml = '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">' + summaryParts.join('') + '</div>';

      var modalContent =
        summaryHtml +
        '<div style="max-height:260px; overflow-y:auto; border:1px solid var(--border-color); border-radius:8px;">' +
          '<table style="width:100%; border-collapse:collapse; font-size:0.82rem;">' +
            '<thead>' +
              '<tr style="background:var(--bg-canvas); position:sticky; top:0; z-index:1;">' +
                '<th style="padding:8px 10px; text-align:right; font-weight:700; white-space:nowrap;">\u0627\u0644\u0631\u0642\u0645</th>' +
                '<th style="padding:8px 10px; text-align:right; font-weight:700;">\u0627\u0644\u0639\u0646\u0648\u0627\u0646</th>' +
                '<th style="padding:8px 10px; text-align:center; font-weight:700;">\uD83D\uDCF1 \u0627\u0644\u062c\u0647\u0627\u0632</th>' +
                '<th style="padding:8px 10px; text-align:center; font-weight:700;">\u2601\uFE0F \u0627\u0644\u0633\u062d\u0627\u0628\u0629</th>' +
                '<th style="padding:8px 10px; text-align:right; font-weight:700;">\u0627\u0644\u0625\u062c\u0631\u0627\u0621</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + tableRows + '</tbody>' +
          '</table>' +
        '</div>';

      var hasLocalOnly = localOnlyCount > 0;

      var overlay = document.getElementById('vienix-custom-modal-overlay');
      if (overlay) overlay.remove();

      overlay = document.createElement('div');
      overlay.id = 'vienix-custom-modal-overlay';
      overlay.className = 'vienix-custom-modal-overlay active';

      var footerButtons;
      if (hasLocalOnly) {
        footerButtons =
          '<div style="display:flex; gap:8px; flex-wrap:wrap; width:100%;">' +
            '<button class="btn btn-ghost" id="vienix-diff-cancel-btn" style="flex:0 0 auto;">\u0625\u0644\u063a\u0627\u0621</button>' +
            '<button class="btn btn-primary" id="vienix-diff-replace-btn" style="flex:1; background:#ef4444; border-color:#ef4444;">' +
              '\uD83D\uDDD1\uFE0F \u0627\u0633\u062a\u0628\u062f\u0627\u0644 \u0643\u0627\u0645\u0644 (\u062d\u0630\u0641 ' + localOnlyCount + ' \u062d\u062c\u0631\u0629 \u0645\u062d\u0644\u064a\u0629)' +
            '</button>' +
            '<button class="btn btn-primary" id="vienix-diff-merge-btn" style="flex:1; background:#10b981; border-color:#10b981;">' +
              '\uD83D\uDD00 \u062f\u0645\u062c \u0630\u0643\u064a (\u0627\u0644\u0627\u062d\u062a\u0641\u0627\u0638 \u0628\u0627\u0644\u062d\u062c\u0631\u0627\u062a \u0627\u0644\u0645\u062d\u0644\u064a\u0629)' +
            '</button>' +
          '</div>';
      } else {
        footerButtons =
          '<div style="display:flex; gap:8px; flex-wrap:wrap; width:100%;">' +
            '<button class="btn btn-ghost" id="vienix-diff-cancel-btn" style="flex:0 0 auto;">\u0625\u0644\u063a\u0627\u0621</button>' +
            '<button class="btn btn-primary" id="vienix-diff-replace-btn" style="flex:1;">' +
              '\u2705 \u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0645\u0646 \u0627\u0644\u0633\u062d\u0627\u0628\u0629' +
            '</button>' +
          '</div>';
      }

      overlay.innerHTML =
        '<div class="vienix-custom-modal" onclick="event.stopPropagation()" style="max-width:680px;">' +
          '<div class="vienix-custom-modal-header">' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<span style="font-size:1.4rem;">\uD83D\uDCCA</span>' +
              '<h3 style="margin:0; font-size:1.05rem; font-weight:700;">\u0645\u0642\u0627\u0631\u0646\u0629 \u0628\u064a\u0627\u0646\u0627\u062a\u0643 \u0642\u0628\u0644 \u0627\u0644\u0627\u0633\u062a\u064a\u0631\u0627\u062f</h3>' +
            '</div>' +
            '<button class="vienix-custom-modal-close" id="vienix-diff-close-btn">&times;</button>' +
          '</div>' +
          '<div class="vienix-custom-modal-body" style="padding:16px 20px;">' +
            modalContent +
            '<p style="color:var(--text-muted); font-size:0.75rem; margin-top:12px;">\uD83D\uDCBE \u0633\u064a\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0646\u0633\u062e\u0629 \u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629 \u0645\u0624\u0642\u062a\u0629 \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b \u0642\u0628\u0644 \u0623\u064a \u062a\u063a\u064a\u064a\u0631 \u0644\u062d\u0645\u0627\u064a\u0629 \u0628\u064a\u0627\u0646\u0627\u062a\u0643.</p>' +
          '</div>' +
          '<div class="vienix-custom-modal-footer" style="padding:12px 20px;">' +
            footerButtons +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      return new Promise(function (resolve) {
        var closeBtn = document.getElementById('vienix-diff-close-btn');
        var cancelBtn = document.getElementById('vienix-diff-cancel-btn');
        var replaceBtn = document.getElementById('vienix-diff-replace-btn');
        var mergeBtn = document.getElementById('vienix-diff-merge-btn');

        var cleanup = function () { if (overlay.parentNode) overlay.remove(); };

        closeBtn.addEventListener('click', function () { cleanup(); resolve('cancel'); });
        cancelBtn.addEventListener('click', function () { cleanup(); resolve('cancel'); });
        replaceBtn.addEventListener('click', function () { cleanup(); resolve('replace'); });
        if (mergeBtn) {
          mergeBtn.addEventListener('click', function () { cleanup(); resolve('merge'); });
        }
      });
    },

    pullFromDrive: async function (options = {}) {
      this.isSyncing = true;
      this.updateUI();

      try {
        await this.ensureValidToken(options.interactive || false);
        const inventory = await this.getFolderInventory();
        let manifest = null;

        // 1. Read manifest if present
        if (inventory.manifestFile) {
          try {
            const res = await this.driveFetch('https://www.googleapis.com/drive/v3/files/' + inventory.manifestFile.id + '?alt=media');
            manifest = await res.json();
          } catch (e) {
            console.warn('[VienixDrive] Could not parse manifest from Drive:', e);
          }
        }

        if (!manifest) {
          manifest = { app: 'Vienix Markdown Editor', rawKeys: {} };
        }
        if (!manifest.rawKeys) manifest.rawKeys = {};

        let hasChambers = false;

        // 2. Read every chamber file directly from Drive inventory (all chambers and files)
        for (const [chNum, files] of inventory.chamberFiles.entries()) {
          const file = files[0];
          const match = file.name.match(/^Chamber_(\d+)(?:_(.*))?\.md$/i);
          const title = match && match[2] ? match[2].replace(/_/g, ' ') : '';

          try {
            const res = await this.driveFetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media');
            const text = await res.text();
            const cleanText = (text !== null && text !== undefined) ? text : '';
            manifest.rawKeys['vienix_chamber_' + chNum] = cleanText;
            manifest.rawKeys['yaser_chamber_' + chNum] = cleanText;
            if (chNum === 1) {
              manifest.rawKeys['vienix_md_content'] = cleanText;
              manifest.rawKeys['yaser_md_content'] = cleanText;
            }
            if (title) {
              let assignedFolder = 'book';
              if (manifest.folderFiles) {
                for (const fk of Object.keys(manifest.folderFiles)) {
                  const arr = manifest.folderFiles[fk];
                  if (Array.isArray(arr) && arr.some(f => f && (f.num === chNum || f.title === title))) {
                    assignedFolder = fk.replace('vienix_folder_files_', '');
                    break;
                  }
                }
              }
              const existingMeta = manifest.rawKeys['vienix_chamber_meta_' + chNum];
              let metaObj = null;
              if (existingMeta) {
                try {
                  metaObj = typeof existingMeta === 'string' ? JSON.parse(existingMeta) : existingMeta;
                } catch (e) {}
              }
              if (!metaObj) {
                metaObj = {
                  customTitle: title,
                  folder: assignedFolder,
                  updatedAt: file.modifiedTime ? new Date(file.modifiedTime).getTime() : Date.now()
                };
              } else {
                metaObj.customTitle = title;
                if (!metaObj.folder || metaObj.folder === 'book') metaObj.folder = assignedFolder;
              }
              manifest.rawKeys['vienix_chamber_meta_' + chNum] = JSON.stringify(metaObj);
              manifest.rawKeys['yaser_chamber_meta_' + chNum] = JSON.stringify(metaObj);
            }
            hasChambers = true;
          } catch (err) {
            console.warn('[VienixDrive] Failed reading chamber file from Drive:', file.name, err);
          }
        }

        // Preserve custom folders and overrides into rawKeys for full restore
        if (manifest.customFolders && !manifest.rawKeys['vienix_custom_folders']) {
          manifest.rawKeys['vienix_custom_folders'] = JSON.stringify(manifest.customFolders);
        }
        if (manifest.folderNameOverrides && !manifest.rawKeys['vienix_folder_name_overrides']) {
          manifest.rawKeys['vienix_folder_name_overrides'] = JSON.stringify(manifest.folderNameOverrides);
        }
        if (manifest.deletedDefaultFolders && !manifest.rawKeys['vienix_deleted_default_folders']) {
          manifest.rawKeys['vienix_deleted_default_folders'] = JSON.stringify(manifest.deletedDefaultFolders);
        }

        // If a chamber has NO file in Drive inventory, mark it as empty so local data gets cleared!
        const localSnap = this._getLocalChamberSnapshot();
        const allNumsToCheck = new Set([...Array.from({length: 7}, (_, i) => i + 1), ...localSnap.keys(), ...inventory.chamberFiles.keys()]);

        if (inventory.chamberFiles.size > 0) {
          for (const ch of allNumsToCheck) {
            if (!inventory.chamberFiles.has(ch)) {
              // Chamber file does NOT exist on Drive -> mark empty so local data gets wiped!
              manifest.rawKeys['vienix_chamber_' + ch] = '';
              manifest.rawKeys['yaser_chamber_' + ch] = '';
              if (ch === 1) {
                manifest.rawKeys['vienix_md_content'] = '';
                manifest.rawKeys['yaser_md_content'] = '';
              }
              delete manifest.rawKeys['vienix_chamber_meta_' + ch];
              delete manifest.rawKeys['yaser_chamber_meta_' + ch];
            }
          }
        }

        // Ensure folderFiles structure exists in manifest for clean restore
        if (!manifest.folderFiles) {
          manifest.folderFiles = {};
          if (manifest.rawKeys) {
            Object.keys(manifest.rawKeys).forEach(k => {
              if (k.startsWith('vienix_folder_files_')) {
                try {
                  manifest.folderFiles[k] = JSON.parse(manifest.rawKeys[k]);
                } catch (e) {
                  manifest.folderFiles[k] = manifest.rawKeys[k];
                }
              }
            });
          }
        }

        // If inventory has manifest or files, we consider chambers present
        if (inventory.chamberFiles.size > 0) {
          hasChambers = true;
        } else if (inventory.manifestFile) {
          Object.keys(manifest.rawKeys).forEach(k => {
            if (k.includes('chamber') && !k.includes('meta')) {
              const v = manifest.rawKeys[k];
              if (v && String(v).trim().length > 0) hasChambers = true;
            }
          });
        }

        if (!hasChambers) {
          if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
            window.VienixStorage.showCustomModal({
              title: '\u062a\u0646\u0628\u064a\u0647 \u0627\u0644\u0627\u0633\u062a\u064a\u0631\u0627\u062f',
              icon: '\u26A0\uFE0F',
              content: '<p style="color:var(--text-secondary);">\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0645\u0644\u0641\u0627\u062a \u0623\u0648 \u0646\u0635\u0648\u0635 \u0633\u0627\u0628\u0642\u0629 \u0641\u064a \u0645\u062c\u0644\u062f Vienix Notes \u0639\u0644\u0649 Google Drive.</p>',
              confirmText: '\u062d\u0633\u0646\u0627\u064b'
            });
          } else {
            alert('\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0645\u0644\u0641\u0627\u062a \u0633\u0627\u0628\u0642\u0629 \u0641\u064a \u0645\u062c\u0644\u062f Vienix Notes \u0639\u0644\u0649 Google Drive.');
          }
          return;
        }

        // ──────────────────────────────────────────────
        // Feature 4: DIFF PREVIEW — compare before acting
        // ──────────────────────────────────────────────
        const localChambers = this._getLocalChamberSnapshot();
        const cloudChambers = this._getCloudChamberSnapshot(manifest);

        // Check if there are local-only chambers that would be lost
        let hasLocalOnlyFiles = false;
        localChambers.forEach(function (_, ch) {
          if (!cloudChambers.has(ch)) hasLocalOnlyFiles = true;
        });

        let userChoice = 'replace';

        if (!options.force || hasLocalOnlyFiles) {
          // Show the diff preview modal and let the user choose
          this.isSyncing = false;
          this.updateUI();
          userChoice = await this._showDiffPreviewModal(localChambers, cloudChambers, manifest);
          this.isSyncing = true;
          this.updateUI();
        }

        if (userChoice === 'cancel') {
          console.log('[VienixDrive] Pull cancelled by user after diff preview.');
          return;
        }

        // ──────────────────────────────────────────────
        // Feature 3: SILENT BACKUP — safety net before any destructive action
        // ──────────────────────────────────────────────
        if (localChambers.size > 0 && window.VienixStorage && typeof window.VienixStorage.createSilentBackup === 'function') {
          console.log('[VienixDrive] Creating silent pre-pull backup...');
          window.VienixStorage.createSilentBackup();
        }

        // ──────────────────────────────────────────────
        // Execute the chosen strategy
        // ──────────────────────────────────────────────
        this.lastSyncTime = new Date();
        this.lastSyncError = null;
        localStorage.setItem('vienix_drive_last_sync', this.lastSyncTime.toISOString());

        if (userChoice === 'merge' && window.VienixStorage && typeof window.VienixStorage.applyMerge === 'function') {
          // Feature 2: SMART MERGE — keep local-only chambers, update cloud chambers
          await window.VienixStorage.applyMerge(manifest);
        } else {
          // Full Replace (original behavior)
          if (window.VienixStorage && typeof window.VienixStorage.applyRestore === 'function') {
            await window.VienixStorage.applyRestore(manifest);
          } else {
            console.error('[VienixDrive] CANNOT RESTORE: VienixStorage or applyRestore not available!', window.VienixStorage);
          }
        }
        // applyRestore / applyMerge will reload the page
        return;
      } catch (err) {
        console.error('[VienixDrive] Pull error:', err);
        this.lastSyncError = err.message;
        alert('\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0645\u0646 Google Drive: ' + err.message);
      } finally {
        this.isSyncing = false;
        this.updateUI();
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 8. SMART BI-DIRECTIONAL SYNC
    // ─────────────────────────────────────────────────────────────
    smartSync: async function (options = {}) {
      if (this.isSyncing) return;

      try {
        await this.ensureValidToken(true);
      } catch (e) {
        return;
      }

      this.isSyncing = true;
      this.updateUI();

      try {
        const isLocalEmpty = this.isLocalWorkspaceEmpty();
        const inventory = await this.getFolderInventory();

        // 1. Local is completely empty, and Drive has files -> Auto PULL
        if (isLocalEmpty && inventory.hasRemoteData) {
          console.log('[VienixDrive] SmartSync: Local is empty and Drive has files -> Pulling from Drive...');
          this.isSyncing = false;
          await this.pullFromDrive({ force: true, interactive: false });
          return;
        }

        // 2. Drive has no data, Local has data -> Auto PUSH
        if (!isLocalEmpty && !inventory.hasRemoteData) {
          console.log('[VienixDrive] SmartSync: Drive is empty and Local has files -> Pushing to Drive...');
          this.isSyncing = false;
          await this.syncAllToDrive({ force: true, interactive: false });
          return;
        }

        // 3. Both are empty
        if (isLocalEmpty && !inventory.hasRemoteData) {
          this.isSyncing = false;
          this.updateUI();
          if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
            window.VienixStorage.showCustomModal({
              title: 'Google Drive متصل ☁️',
              icon: 'ℹ️',
              content: '<p style="color:var(--text-secondary);">مساحة العمل فارغة حالياً على هذا الجهاز وعلى Google Drive. ابدأ بكتابة نصوصك وسيتم حفظها ومزامنتها تلقائياً.</p>',
              confirmText: 'حسناً'
            });
          }
          return;
        }

        // 4. Both have data -> Compare timestamps
        const localTime = this.getLocalLastModifiedTime();
        const remoteTime = inventory.remoteTime || 0;

        // If remote is noticeably newer (more than 5 seconds newer than local)
        if (remoteTime > (localTime + 5000)) {
          this.isSyncing = false;
          this.updateUI();
          const dateStr = new Date(remoteTime).toLocaleTimeString('ar-SA') + ' (' + new Date(remoteTime).toLocaleDateString('ar-SA') + ')';
          if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
            window.VienixStorage.showCustomModal({
              title: 'تحديثات أحدث على Google Drive! 📥',
              icon: '🔄',
              content: `<p style="color:var(--text-secondary);">تم العثور على نسخة أحدث على Google Drive تم تعديلها بتاريخ <strong>${dateStr}</strong>.<br><br>هل ترغب في <strong>استيراد النسخة الأحدث من السحابة</strong> أم <strong>رفع نسختك الحالية</strong> واستبدال السحابة؟</p>`,
              confirmText: 'استيراد الأحدث من السحابة (تنزيل)',
              cancelText: 'رفع النسخة الحالية إلى السحابة',
              onConfirm: () => {
                this.pullFromDrive({ force: true, interactive: false });
              },
              onCancel: () => {
                this.syncAllToDrive({ force: true, interactive: false });
              }
            });
          } else {
            if (confirm(`توجد نسخة أحدث على Google Drive بتاريخ ${dateStr}. هل ترغب في تنزيلها؟`)) {
              await this.pullFromDrive({ force: true, interactive: false });
            } else {
              await this.syncAllToDrive({ force: true, interactive: false });
            }
          }
          return;
        }

        // Local is newer or equal -> Push local changes to Drive
        console.log('[VienixDrive] SmartSync: Local is up-to-date or newer -> Pushing to Drive...');
        this.isSyncing = false;
        await this.syncAllToDrive({ force: true, interactive: false });
      } catch (err) {
        console.error('[VienixDrive] SmartSync error:', err);
        this.lastSyncError = err.message;
        if (window.showToast) {
          window.showToast(`تعذر إتمام المزامنة الذكية: ${err.message} ⚠️`, 'error', 4000);
        }
      } finally {
        this.isSyncing = false;
        this.updateUI();
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 9. DEBOUNCED AUTO-SYNC TRIGGER
    // ─────────────────────────────────────────────────────────────
    triggerAutoSync: function () {
      if (!this.autoSyncEnabled || !this.accessToken) return;

      if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = setTimeout(() => {
        this.syncAllToDrive({ force: true, interactive: false });
      }, 120000); // 2 minutes debounce
    },

    toggleAutoSync: function (enabled) {
      this.autoSyncEnabled = enabled;
      localStorage.setItem('vienix_drive_auto_sync', enabled ? 'true' : 'false');
      this.updateUI();
    },

    // ─────────────────────────────────────────────────────────────
    // 10. UI CONTROLLERS & BINDINGS
    // ─────────────────────────────────────────────────────────────
    updateUI: function () {
      // 1. Top bar cloud icon dot
      const dot = document.getElementById('cloud-sync-dot');
      if (dot) {
        dot.className = 'cloud-sync-status-dot';
        if (this.isSyncing) {
          dot.classList.add('status-syncing');
          dot.title = 'جارٍ المزامنة السحابية...';
        } else if (this.isAutoConnecting) {
          dot.classList.add('status-syncing');
          dot.title = 'جارٍ استعادة الاتصال بـ Google Drive تلقائياً...';
        } else if (this.lastSyncError) {
          dot.classList.add('status-error');
          dot.title = `تنبيه مزامنة Google Drive: ${this.lastSyncError}`;
        } else if (this.accessToken) {
          dot.classList.add('status-connected');
          dot.title = `متصل بـ Google Drive (${this.userProfile ? this.userProfile.name : ''})`;
        } else if (this.userProfile) {
          dot.classList.add('status-warning');
          dot.title = `Google Drive (${this.userProfile.name}) - انقر للتنشيط والمزامنة`;
        } else {
          dot.classList.add('status-disconnected');
          dot.title = 'Google Drive غير متصل (انقر للربط والمزامنة)';
        }
      }

      // 2. Settings Modal Cloud Panel
      const panel = document.getElementById('settings-panel-cloud');
      if (!panel) return;

      const isConnected = !!this.accessToken;
      const hasSavedUser = !!this.userProfile;
      const lastSyncStr = this.lastSyncTime ? this.lastSyncTime.toLocaleTimeString('ar-SA') + ' - ' + this.lastSyncTime.toLocaleDateString('ar-SA') : 'لم تتم بعد';

      panel.innerHTML = `
        <h3 class="settings-section-title">
          <svg class="ui-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path></svg>
          <span>المزامنة السحابية (Google Drive)</span>
        </h3>

        <!-- Connection Card -->
        <div class="cloud-account-card">
          ${(isConnected || hasSavedUser) && this.userProfile ? `
            <div class="cloud-profile-wrap">
              <img src="${this.userProfile.picture || 'assets/icons/google-drive.svg'}" class="cloud-avatar" alt="Avatar">
              <div class="cloud-profile-info">
                <span class="cloud-user-name">${this.userProfile.name}</span>
                <span class="cloud-user-email">${this.userProfile.email}</span>
                ${this.isAutoConnecting ? `
                  <span class="cloud-badge-connected" style="background:rgba(99,102,241,0.15); color:var(--accent-color, #6366f1); border:1px solid rgba(99,102,241,0.3);">🔄 جارٍ استعادة الاتصال تلقائياً...</span>
                ` : this.lastSyncError ? `
                  <span class="cloud-badge-connected" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">⚠️ تنبيه: ${this.lastSyncError}</span>
                ` : isConnected ? `
                  <span class="cloud-badge-connected">✓ متصل ومفعل ومربوط</span>
                ` : `
                  <span class="cloud-badge-connected" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);">⚡ في وضع الاستعداد (انقر للمزامنة)</span>
                `}
              </div>
            </div>
            <div class="cloud-card-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary btn-sync-now ${this.isSyncing ? 'loading' : ''}" onclick="VienixDrive.handleCloudBtnClick()" style="flex:1;">
                ${this.isSyncing ? '🔄 جارٍ المزامنة...' : isConnected ? '🔄 مزامنة ذكية الآن' : '⚡ تنشيط ومزامنة الآن'}
              </button>
              <button type="button" class="btn btn-ghost" onclick="VienixDrive.switchAccount()" title="تسجيل الدخول بحساب Google آخر">
                تبديل الحساب
              </button>
              <button type="button" class="btn btn-ghost btn-disconnect" onclick="VienixDrive.disconnect()">
                فصل الحساب
              </button>
            </div>
          ` : `
            <div class="cloud-connect-prompt">
              <div class="cloud-drive-logo">
                <svg viewBox="0 0 87.3 78" width="40" height="36">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1l5.6 13.85z" fill="#0066da"/>
                  <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.6 44.35 13.75 23.8 28.9-47.65z" fill="#00ac47"/>
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.6-13.15c.8-1.4 1.25-2.95 1.25-4.55H57.4l6.9 11.95 9.25 11.8z" fill="#ea4335"/>
                  <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2l13.75 23.8z" fill="#00832d"/>
                  <path d="M57.4 46.9H29.9L16.15 70.7c1.35.8 2.9 1.25 4.5 1.25h52.9c1.6 0 3.15-.45 4.5-1.25L57.4 46.9z" fill="#2684fc"/>
                  <path d="M86.1 46.9c0-1.6-.45-3.15-1.25-4.55l-14.8-25.65c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l27.5 47.65 13.7-23.75c.8-1.4 1.25-2.95 1.25-2z" fill="#ffba02"/>
                </svg>
              </div>
              <div>
                <h4 style="margin:0 0 4px 0; font-size:1.02rem;">ربط حساب Google Drive الشخصي</h4>
                <p style="margin:0; font-size:0.8rem; color:var(--text-muted); line-height:1.5;">
                  احفظ نصوصك تلقائياً في مجلد <strong>Vienix Notes</strong> دون خوادم وسيطة وتكلفة صفرية.
                </p>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-google-connect" onclick="VienixDrive.connect()">
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
              <span>تسجيل الدخول وربط Google Drive</span>
            </button>
          `}
        </div>

        <!-- Sync Settings & Options -->
        <div class="settings-group" style="margin-top:16px;">
          <label class="settings-label">خيارات المزامنة التلقائية</label>
          <div class="settings-toggle-row">
            <span class="settings-toggle-desc">المزامنة التلقائية الهادئة في الخلفية (كل دقيقتين بعد التعديل)</span>
            <label class="settings-toggle">
              <input type="checkbox" id="s-drive-auto-sync" ${this.autoSyncEnabled ? 'checked' : ''} onchange="VienixDrive.toggleAutoSync(this.checked)">
              <span class="settings-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Direct Push & Pull Controls -->
        ${(isConnected || hasSavedUser) ? `
          <div class="settings-group">
            <label class="settings-label">التحكم اليدوي المباشر في المزامنة</label>
            <p class="settings-hint">يمكنك فرض رفع مساحة العمل وتحديث السحابة الآن، أو استيراد ملفات السحابة وتحديث الجهاز.</p>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
              <button type="button" class="btn btn-primary" onclick="VienixDrive.syncAllToDrive({ force: true, interactive: true })" style="flex:1; display:flex; align-items:center; justify-content:center; gap:8px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <span>رفع وتحديث السحابة الآن (Push)</span>
              </button>
              <button type="button" class="settings-action-btn" onclick="VienixDrive.pullFromDrive({ force: false, interactive: true })" style="margin:0; flex:1;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>استيراد من Drive (Pull)</span>
              </button>
            </div>
            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:10px;">
              آخر مزامنة ناجحة: <strong style="color:var(--text-primary);">${lastSyncStr}</strong>
            </p>
          </div>
        ` : ''}
      `;
    }
  };

  // Expose globally
  window.VienixDrive = VienixDrive;

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VienixDrive.init());
  } else {
    VienixDrive.init();
  }

})();
