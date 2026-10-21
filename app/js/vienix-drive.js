/**
 * ============================================================================
 * Vienix Markdown Editor - Google Drive Cloud Sync Engine (Phase 2)
 * ============================================================================
 * Architecture: Local-First + Personal Cloud
 *  - Scope: https://www.googleapis.com/auth/drive.file (Strictly isolated to app files)
 *  - Google Identity Services (GIS) OAuth 2.0 Token Client
 *  - App Folder: 'Vienix Notes' on Google Drive
 *  - Automatic Drive Versioning (Free revision history on PATCH)
 *  - Debounced Auto-Sync (Prevents API quota limits)
 *  - Bi-directional Sync (Push to Cloud & Pull from Cloud)
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

  const VienixDrive = {
    accessToken: null,
    tokenExpiresAt: 0,
    userProfile: null,
    appFolderId: null,
    isSyncing: false,
    lastSyncTime: null,
    autoSyncEnabled: true,
    clientId: localStorage.getItem('vienix_google_client_id') || DEFAULT_CLIENT_ID,

    // ─────────────────────────────────────────────────────────────
    // 1. INITIALIZATION & SDK LOADER
    // ─────────────────────────────────────────────────────────────
    init: function () {
      // 1. Check if token was saved in sessionStorage (survives page refresh during active session)
      const savedToken = sessionStorage.getItem('vienix_drive_token');
      const savedExpiry = sessionStorage.getItem('vienix_drive_token_expires');
      const savedProfile = sessionStorage.getItem('vienix_drive_profile');
      const savedFolder = localStorage.getItem('vienix_drive_folder_id');

      if (savedFolder) this.appFolderId = savedFolder;

      if (savedToken && savedExpiry && Number(savedExpiry) > Date.now()) {
        this.accessToken = savedToken;
        this.tokenExpiresAt = Number(savedExpiry);
        if (savedProfile) {
          try { this.userProfile = JSON.parse(savedProfile); } catch (e) {}
        }
      }

      const autoSyncSetting = localStorage.getItem('vienix_drive_auto_sync');
      this.autoSyncEnabled = autoSyncSetting !== 'false';

      // 2. Load Google Identity Services SDK
      this.loadGoogleSDK();

      // 3. Update UI
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
              sessionStorage.setItem('vienix_drive_token', this.accessToken);
              sessionStorage.setItem('vienix_drive_token_expires', String(this.tokenExpiresAt));

              // Fetch user profile info
              await this.fetchUserProfile();

              // Ensure Vienix Notes folder exists on Drive
              await this.ensureAppFolder();

              this.updateUI();

              // Smart workspace check on connection
              const isLocalEmpty = this.isLocalWorkspaceEmpty();
              const driveStatus = await this.getDriveWorkspaceStatus();

              if (isLocalEmpty && driveStatus && driveStatus.hasRemoteData) {
                // Device is empty (e.g. mobile entering for first time), but Drive has user files!
                if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
                  window.VienixStorage.showCustomModal({
                    title: 'تم العثور على ملفاتك في Google Drive! ☁️📥',
                    icon: '📥',
                    content: `<p style="color:var(--text-secondary);">أهلاً بك <strong>${this.userProfile ? this.userProfile.name : ''}</strong>!<br>تم ربط حسابك، ووجدنا ملفاتك وحجراتك السابقة في مجلد <strong>Vienix Notes</strong> على Google Drive.<br><br>هل ترغب في <strong>استيراد وتنزيل ملفاتك</strong> إلى هذا الجهاز الآن؟</p>`,
                    confirmText: 'نعم، استيراد ملفاتي الآن',
                    cancelText: 'تخطي والبدء بصفحة فارغة',
                    onConfirm: () => { this.pullFromDrive({ force: true }); }
                  });
                } else {
                  if (confirm('تم العثور على ملفاتك في Google Drive. هل ترغب في استيرادها وتنزيلها الآن؟')) {
                    this.pullFromDrive({ force: true });
                  }
                }
              } else if (!isLocalEmpty && (!driveStatus || !driveStatus.hasRemoteData)) {
                // Local has data, Drive is fresh
                if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
                  window.VienixStorage.showCustomModal({
                    title: 'تم الاتصال بـ Google Drive بنجاح! ☁️',
                    icon: '✅',
                    content: `<p style="color:var(--text-secondary);">أهلاً بك <strong>${this.userProfile ? this.userProfile.name : ''}</strong>! تم ربط حسابك السحابي، وأصبح بإمكانك مزامنة نصوصك وحجراتك مع مجلد <strong>Vienix Notes</strong> على Google Drive بأمان تام.</p>`,
                    confirmText: 'ابدأ المزامنة الآن',
                    onConfirm: () => { this.syncAllToDrive(); }
                  });
                }
              } else {
                // Both have data or both are empty -> offer smart sync
                if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
                  window.VienixStorage.showCustomModal({
                    title: 'تم الاتصال بـ Google Drive بنجاح! ☁️',
                    icon: '✅',
                    content: `<p style="color:var(--text-secondary);">أهلاً بك <strong>${this.userProfile ? this.userProfile.name : ''}</strong>! تم ربط حسابك السحابي بنجاح.</p>`,
                    confirmText: 'مزامنة ذكية الآن',
                    onConfirm: () => { this.smartSync(); }
                  });
                }
              }
            }
          }
        });
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
    // 2. AUTHENTICATION (LOGIN / LOGOUT)
    // ─────────────────────────────────────────────────────────────
    connect: function () {
      if (!this.clientId) {
        this.clientId = DEFAULT_CLIENT_ID;
      }

      if (!window.google || !window.google.accounts) {
        this.loadGoogleSDK();
        setTimeout(() => { this.connect(); }, 400);
        return;
      }

      if (!tokenClient) {
        this.initTokenClient();
      }

      if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: this.accessToken ? '' : 'consent' });
      } else {
        alert('تعذر تحميل واجهة Google Identity Services. تأكد من اتصالك بالإنترنت.');
      }
    },

    handleCloudBtnClick: function () {
      if (!this.accessToken) {
        this.connect();
      } else {
        this.smartSync();
      }
    },

    disconnect: function () {
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
      sessionStorage.removeItem('vienix_drive_token');
      sessionStorage.removeItem('vienix_drive_token_expires');
      sessionStorage.removeItem('vienix_drive_profile');

      this.updateUI();

      if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
        window.VienixStorage.showCustomModal({
          title: 'تم تسجيل الخروج وفصل Google Drive',
          icon: '👋',
          content: '<p style="color:var(--text-secondary);">تم إلغاء الاتصال بالسحابة بنجاح. تبقى جميع بياناتك مخزنة محلياً على جهازك في IndexedDB.</p>',
          confirmText: 'حسناً'
        });
      }
    },

    fetchUserProfile: async function () {
      if (!this.accessToken) return;
      try {
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            this.userProfile = {
              name: data.user.displayName || 'مستخدم Google Drive',
              email: data.user.emailAddress || '',
              picture: data.user.photoLink || ''
            };
            sessionStorage.setItem('vienix_drive_profile', JSON.stringify(this.userProfile));
          }
        }
      } catch (err) {
        console.warn('[VienixDrive] Failed to fetch user profile via Drive about:', err);
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 3. DRIVE API CORE HELPERS
    // ─────────────────────────────────────────────────────────────
    ensureAppFolder: async function () {
      if (this.appFolderId) {
        // Quick verify if folder still exists
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${this.appFolderId}?fields=id,trashed`, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.trashed) return this.appFolderId;
          }
        } catch (e) {}
      }

      // Search for folder by name
      try {
        const q = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            this.appFolderId = searchData.files[0].id;
            localStorage.setItem('vienix_drive_folder_id', this.appFolderId);
            return this.appFolderId;
          }
        }

        // Create folder if not found
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: DRIVE_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            description: 'Vienix Markdown Editor Workspace Sync Folder'
          })
        });

        if (createRes.ok) {
          const folderData = await createRes.json();
          this.appFolderId = folderData.id;
          localStorage.setItem('vienix_drive_folder_id', this.appFolderId);
          return this.appFolderId;
        }
      } catch (err) {
        console.error('[VienixDrive] Error ensuring app folder:', err);
      }
      return null;
    },

    findFileInFolder: async function (filename) {
      if (!this.appFolderId) await this.ensureAppFolder();
      if (!this.appFolderId) return null;

      try {
        const q = `'${this.appFolderId}' in parents and name='${filename}' and trashed=false`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          return data.files && data.files.length > 0 ? data.files[0] : null;
        }
      } catch (e) {}
      return null;
    },

    uploadOrUpdateFile: async function (filename, content, mimeType = 'text/markdown') {
      if (!this.accessToken) return null;
      const folderId = await this.ensureAppFolder();
      if (!folderId) return null;

      const existingFile = await this.findFileInFolder(filename);

      if (existingFile) {
        // PATCH existing file -> Triggers Google Drive Automatic Version History!
        const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': mimeType
          },
          body: content
        });
        if (updateRes.ok) return await updateRes.json();
      } else {
        // Multipart POST to create new file with metadata in parents folder
        const metadata = {
          name: filename,
          parents: [folderId]
        };
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelimiter = "\r\n--" + boundary + "--";

        const multipartBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: ' + mimeType + '\r\n\r\n' +
          content +
          closeDelimiter;

        const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        });
        if (createRes.ok) return await createRes.json();
      }
      return null;
    },

    // ─────────────────────────────────────────────────────────────
    // 4. SYNC TO DRIVE (PUSH)
    // ─────────────────────────────────────────────────────────────
    syncAllToDrive: async function () {
      if (!this.accessToken) {
        this.connect();
        return;
      }

      if (this.isSyncing) return;
      this.isSyncing = true;
      this.updateUI();

      try {
        console.log('[VienixDrive] Starting full workspace sync to Google Drive...');
        let syncedCount = 0;

        // 1. Sync all active Chambers as individual .md files
        const maxCh = typeof window.VienixGetTotalChambers === 'function' ? window.VienixGetTotalChambers() : 8;
        for (let ch = 1; ch <= maxCh; ch++) {
          let content = '';
          let meta = null;

          if (window.VienixIDB && typeof window.VienixIDB.getSync === 'function') {
            content = window.VienixIDB.getSync('vienix_chamber_' + ch, 'yaser_chamber_' + ch) || '';
            const raw = window.VienixIDB.getSync('vienix_chamber_meta_' + ch, 'yaser_chamber_meta_' + ch);
            if (raw) {
              try { meta = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
            }
          } else {
            content = localStorage.getItem('vienix_chamber_' + ch) || localStorage.getItem('yaser_chamber_' + ch) || '';
          }

          if (ch === 1 && !content) {
            content = localStorage.getItem('vienix_md_content') || '';
          }

          if (content.trim().length > 0) {
            const title = (meta && meta.customTitle) ? meta.customTitle.replace(/[/\\?%*:|"<>]/g, '_') : `Chamber_${ch}`;
            const filename = `Chamber_${ch}_${title}.md`;

            await this.uploadOrUpdateFile(filename, content, 'text/markdown; charset=utf-8');
            syncedCount++;
          }
        }

        // 2. Upload full workspace snapshot (JSON Manifest)
        if (window.VienixStorage && typeof window.VienixStorage.getStats === 'function') {
          // Generate backup package
          const manifest = {
            app: 'Vienix Markdown Editor',
            timestamp: new Date().toISOString(),
            rawKeys: {}
          };

          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('vienix_') || k.startsWith('yaser_'))) {
              manifest.rawKeys[k] = localStorage.getItem(k);
            }
          }

          if (window.VienixIDB && window.VienixIDB.memoryCache) {
            Object.keys(window.VienixIDB.memoryCache).forEach(k => {
              manifest.rawKeys[k] = window.VienixIDB.memoryCache[k];
            });
          }

          await this.uploadOrUpdateFile('vienix_workspace_manifest.json', JSON.stringify(manifest, null, 2), 'application/json');
        }

        this.lastSyncTime = new Date();
        localStorage.setItem('vienix_drive_last_sync', this.lastSyncTime.toISOString());
        console.log(`[VienixDrive] Sync finished: ${syncedCount} chambers and manifest updated on Drive.`);

        if (window.VienixStorage && typeof window.VienixStorage.updateStatusMeter === 'function') {
          window.VienixStorage.updateStatusMeter();
        }
      } catch (err) {
        console.error('[VienixDrive] Sync error:', err);
      } finally {
        this.isSyncing = false;
        this.updateUI();
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 5. WORKSPACE INSPECTION HELPERS
    // ─────────────────────────────────────────────────────────────
    isLocalWorkspaceEmpty: function () {
      const maxCh = typeof window.VienixGetTotalChambers === 'function' ? window.VienixGetTotalChambers() : 8;
      let totalLength = 0;
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
        totalLength += (content || '').trim().length;
      }

      // Check custom folders
      try {
        const rawFolders = localStorage.getItem('vienix_custom_folders');
        if (rawFolders) {
          const parsed = JSON.parse(rawFolders);
          if (Array.isArray(parsed) && parsed.length > 0) {
            totalLength += parsed.length * 10;
          }
        }
      } catch (e) {}

      return totalLength === 0;
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
      const lastSync = localStorage.getItem('vienix_drive_last_sync');
      if (lastSync) {
        const st = new Date(lastSync).getTime();
        if (!isNaN(st) && st > maxTime) maxTime = st;
      }
      return maxTime;
    },

    getDriveWorkspaceStatus: async function () {
      if (!this.accessToken) return null;
      const folderId = await this.ensureAppFolder();
      if (!folderId) return null;

      try {
        const q = `'${folderId}' in parents and trashed=false`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,size)&pageSize=50`, {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const files = data.files || [];

        const manifestFile = files.find(f => f.name === 'vienix_workspace_manifest.json');
        const chamberFiles = files.filter(f => /^Chamber_\d+.*\.md$/i.test(f.name));

        let remoteTime = 0;
        if (manifestFile && manifestFile.modifiedTime) {
          remoteTime = new Date(manifestFile.modifiedTime).getTime();
        }
        chamberFiles.forEach(f => {
          if (f.modifiedTime) {
            const mt = new Date(f.modifiedTime).getTime();
            if (mt > remoteTime) remoteTime = mt;
          }
        });

        const hasRemoteData = (manifestFile && Number(manifestFile.size || 0) > 20) || chamberFiles.length > 0;

        return {
          folderId,
          files,
          manifestFile,
          chamberFiles,
          remoteTime,
          hasRemoteData
        };
      } catch (err) {
        console.warn('[VienixDrive] Failed to get drive workspace status:', err);
        return null;
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 6. SYNC FROM DRIVE (PULL / RESTORE)
    // ─────────────────────────────────────────────────────────────
    pullFromDrive: async function (options = {}) {
      if (!this.accessToken) {
        this.connect();
        return;
      }

      if (!options.force && !confirm('هل ترغب باستيراد ملفاتك من Google Drive؟ سيتم دمج وتحديث الحجرات مع مساحة العمل الحالية.')) {
        return;
      }

      this.isSyncing = true;
      this.updateUI();

      try {
        const folderId = await this.ensureAppFolder();
        if (!folderId) throw new Error('App folder not found on Drive');

        const driveStatus = await this.getDriveWorkspaceStatus();
        let manifest = null;

        // 1. Try to read manifest if available
        if (driveStatus && driveStatus.manifestFile) {
          try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveStatus.manifestFile.id}?alt=media`, {
              headers: { Authorization: `Bearer ${this.accessToken}` }
            });
            if (res.ok) {
              manifest = await res.json();
            }
          } catch (e) {
            console.warn('[VienixDrive] Could not parse manifest:', e);
          }
        }

        if (!manifest) {
          manifest = { app: 'Vienix Markdown Editor', rawKeys: {} };
        }
        if (!manifest.rawKeys) manifest.rawKeys = {};

        // 2. Check if manifest has any chambers with content
        let hasChambers = false;
        Object.keys(manifest.rawKeys).forEach(k => {
          if (k.includes('chamber') && !k.includes('meta') && String(manifest.rawKeys[k]).trim().length > 0) {
            hasChambers = true;
          }
        });

        // 3. Fallback / Enhancement: read any Chamber_*.md files directly from Drive folder
        if (driveStatus && driveStatus.chamberFiles && driveStatus.chamberFiles.length > 0) {
          for (const file of driveStatus.chamberFiles) {
            const match = file.name.match(/^Chamber_(\d+)(?:_(.*))?\.md$/i);
            if (match) {
              const chNum = parseInt(match[1], 10);
              const title = match[2] ? match[2].replace(/_/g, ' ') : '';
              const existingContent = manifest.rawKeys['vienix_chamber_' + chNum] || manifest.rawKeys['yaser_chamber_' + chNum];

              // If missing or empty in manifest, fetch it directly
              if (!existingContent || String(existingContent).trim().length === 0) {
                try {
                  const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                    headers: { Authorization: `Bearer ${this.accessToken}` }
                  });
                  if (contentRes.ok) {
                    const text = await contentRes.text();
                    if (text && text.trim().length > 0) {
                      manifest.rawKeys['vienix_chamber_' + chNum] = text;
                      manifest.rawKeys['yaser_chamber_' + chNum] = text;
                      if (chNum === 1) {
                        manifest.rawKeys['vienix_md_content'] = text;
                        manifest.rawKeys['yaser_md_content'] = text;
                      }
                      if (title && !manifest.rawKeys['vienix_chamber_meta_' + chNum]) {
                        const metaObj = { customTitle: title, folder: 'book', updatedAt: Date.now() };
                        manifest.rawKeys['vienix_chamber_meta_' + chNum] = JSON.stringify(metaObj);
                        manifest.rawKeys['yaser_chamber_meta_' + chNum] = JSON.stringify(metaObj);
                      }
                      hasChambers = true;
                    }
                  }
                } catch (e) {
                  console.warn('[VienixDrive] Failed reading chamber file:', file.name, e);
                }
              } else {
                hasChambers = true;
              }
            }
          }
        }

        if (hasChambers && window.VienixStorage && typeof window.VienixStorage.applyRestore === 'function') {
          window.VienixStorage.applyRestore(manifest);
          return;
        }

        if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
          window.VienixStorage.showCustomModal({
            title: 'تنبيه الاستيراد',
            icon: '⚠️',
            content: '<p style="color:var(--text-secondary);">لم يتم العثور على ملفات أو نصوص سابقة في مجلد Vienix Notes على Google Drive.</p>',
            confirmText: 'حسناً'
          });
        } else {
          alert('لم يتم العثور على ملفات سابقة في مجلد Vienix Notes على Google Drive.');
        }
      } catch (err) {
        alert('حدث خطأ أثناء الاستيراد من Google Drive: ' + err.message);
      } finally {
        this.isSyncing = false;
        this.updateUI();
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 7. SMART BI-DIRECTIONAL SYNC
    // ─────────────────────────────────────────────────────────────
    smartSync: async function (options = {}) {
      if (!this.accessToken) {
        this.connect();
        return;
      }

      if (this.isSyncing) return;
      this.isSyncing = true;
      this.updateUI();

      try {
        const isLocalEmpty = this.isLocalWorkspaceEmpty();
        const driveStatus = await this.getDriveWorkspaceStatus();

        // 1. Local is completely empty, and Drive has files -> Auto PULL
        if (isLocalEmpty && driveStatus && driveStatus.hasRemoteData) {
          console.log('[VienixDrive] SmartSync: Local is empty and Drive has files -> Pulling from Drive...');
          this.isSyncing = false;
          await this.pullFromDrive({ force: true });
          return;
        }

        // 2. Drive has no data, Local has data -> Auto PUSH
        if (!isLocalEmpty && (!driveStatus || !driveStatus.hasRemoteData)) {
          console.log('[VienixDrive] SmartSync: Drive is empty and Local has files -> Pushing to Drive...');
          this.isSyncing = false;
          await this.syncAllToDrive();
          return;
        }

        // 3. Both are empty
        if (isLocalEmpty && (!driveStatus || !driveStatus.hasRemoteData)) {
          console.log('[VienixDrive] SmartSync: Both local and Drive are empty.');
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
        const remoteTime = (driveStatus && driveStatus.remoteTime) ? driveStatus.remoteTime : 0;

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
                this.pullFromDrive({ force: true });
              },
              onCancel: () => {
                this.syncAllToDrive();
              }
            });
          } else {
            if (confirm(`توجد نسخة أحدث على Google Drive بتاريخ ${dateStr}. هل ترغب في تنزيلها؟`)) {
              await this.pullFromDrive({ force: true });
            } else {
              await this.syncAllToDrive();
            }
          }
          return;
        }

        // Local is newer or equal -> Push local changes to Drive
        console.log('[VienixDrive] SmartSync: Local is up-to-date or newer -> Pushing to Drive...');
        this.isSyncing = false;
        await this.syncAllToDrive();
      } catch (err) {
        console.error('[VienixDrive] SmartSync error:', err);
      } finally {
        this.isSyncing = false;
        this.updateUI();
      }
    },

    // ─────────────────────────────────────────────────────────────
    // 6. DEBOUNCED AUTO-SYNC TRIGGER
    // ─────────────────────────────────────────────────────────────
    triggerAutoSync: function () {
      if (!this.autoSyncEnabled || !this.accessToken) return;

      if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = setTimeout(() => {
        this.syncAllToDrive();
      }, 120000); // 2 minutes debounce
    },

    toggleAutoSync: function (enabled) {
      this.autoSyncEnabled = enabled;
      localStorage.setItem('vienix_drive_auto_sync', enabled ? 'true' : 'false');
      this.updateUI();
    },

    // ─────────────────────────────────────────────────────────────
    // 7. UI CONTROLLERS & BINDINGS
    // ─────────────────────────────────────────────────────────────
    updateUI: function () {
      // 1. Top bar cloud icon
      const syncBtn = document.getElementById('btn-cloud-sync');
      const dot = document.getElementById('cloud-sync-dot');

      if (dot) {
        dot.className = 'cloud-sync-status-dot';
        if (this.isSyncing) {
          dot.classList.add('status-syncing');
          dot.title = 'جارٍ المزامنة السحابية...';
        } else if (this.accessToken) {
          dot.classList.add('status-connected');
          dot.title = `متصل بـ Google Drive (${this.userProfile ? this.userProfile.name : ''})`;
        } else {
          dot.classList.add('status-disconnected');
          dot.title = 'Google Drive غير متصل';
        }
      }

      // 2. Settings Modal Cloud Panel
      const panel = document.getElementById('settings-panel-cloud');
      if (!panel) return;

      const isConnected = !!this.accessToken;
      const lastSyncStr = this.lastSyncTime ? this.lastSyncTime.toLocaleTimeString('ar-SA') : 'لم تتم بعد';

      panel.innerHTML = `
        <h3 class="settings-section-title">
          <svg class="ui-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path></svg>
          <span>المزامنة السحابية (Google Drive)</span>
        </h3>

        <!-- Connection Card -->
        <div class="cloud-account-card">
          ${isConnected && this.userProfile ? `
            <div class="cloud-profile-wrap">
              <img src="${this.userProfile.picture || 'assets/icons/google-drive.svg'}" class="cloud-avatar" alt="Avatar">
              <div class="cloud-profile-info">
                <span class="cloud-user-name">${this.userProfile.name}</span>
                <span class="cloud-user-email">${this.userProfile.email}</span>
                <span class="cloud-badge-connected">✓ متصل ومفعل</span>
              </div>
            </div>
            <div class="cloud-card-actions">
              <button type="button" class="btn btn-primary btn-sync-now ${this.isSyncing ? 'loading' : ''}" onclick="VienixDrive.smartSync()">
                ${this.isSyncing ? '🔄 جارٍ المزامنة...' : '☁️ مزامنة ذكية الآن'}
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
          <label class="settings-label">خيارات المزامنة الذكية</label>
          <div class="settings-toggle-row">
            <span class="settings-toggle-desc">المزامنة التلقائية الهادئة في الخلفية (كل دقيقتين بعد التعديل)</span>
            <label class="settings-toggle">
              <input type="checkbox" id="s-drive-auto-sync" ${this.autoSyncEnabled ? 'checked' : ''} onchange="VienixDrive.toggleAutoSync(this.checked)">
              <span class="settings-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Cloud Actions & Pull -->
        ${isConnected ? `
          <div class="settings-group">
            <label class="settings-label">الاستيراد والاسترجاع السحابي</label>
            <p class="settings-hint">تنزيل ودمج الحجرات والمستندات المحفوظة على Google Drive إلى هذا الجهاز.</p>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button type="button" class="settings-action-btn" onclick="VienixDrive.pullFromDrive()" style="margin:0; flex:1;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                استيراد مساحة العمل من Drive
              </button>
            </div>
            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">
              آخر مزامنة ناجحة: <strong>${lastSyncStr}</strong>
            </p>
          </div>
        ` : ''}
      `;
    }
  };

  // Expose to window
  window.VienixDrive = VienixDrive;

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VienixDrive.init());
  } else {
    VienixDrive.init();
  }

})();
