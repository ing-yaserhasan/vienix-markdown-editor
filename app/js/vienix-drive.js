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
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
  const GIS_SDK_URL = 'https://accounts.google.com/gsi/client';

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
    clientId: localStorage.getItem('vienix_google_client_id') || '',

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

              if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
                window.VienixStorage.showCustomModal({
                  title: 'تم الاتصال بـ Google Drive بنجاح! ☁️',
                  icon: '✅',
                  content: `<p style="color:var(--text-secondary);">أهلاً بك <strong>${this.userProfile ? this.userProfile.name : ''}</strong>! تم ربط حسابك السحابي، وأصبح بإمكانك مزامنة نصوصك وحجراتك مع مجلد <strong>Vienix Notes</strong> على Google Drive بأمان تام.</p>`,
                  confirmText: 'ابدأ المزامنة الآن',
                  onConfirm: () => { this.syncAllToDrive(); }
                });
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
        if (window.VienixStorage && typeof window.VienixStorage.showCustomModal === 'function') {
          window.VienixStorage.showCustomModal({
            title: 'مطلوب معرّف العميل (Google Client ID) 🔑',
            icon: 'ℹ️',
            content: `
              <p style="margin-bottom:12px; color:var(--text-secondary);">لضمان خصوصيتك 100% وتفادي قيود الحصص المشتركة، يرجى إدخال Google OAuth Client ID الخاص بك:</p>
              <div style="margin-bottom:12px;">
                <input type="text" id="modal-client-id-input" class="settings-input" placeholder="xxxx.apps.googleusercontent.com" style="width:100%; direction:ltr;" value="${this.clientId}">
              </div>
              <p style="font-size:0.78rem; color:var(--text-muted); line-height:1.6;">
                💡 لا تملك Client ID بعد؟ يمكنك إنشاء واحد مجاناً خلال دقيقتين عبر <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--accent-color); font-weight:600;">Google Cloud Console</a> باختيار Web Application وإضافة نطاق موقعك.
              </p>
            `,
            confirmText: 'حفظ ومتابعة تسجيل الدخول',
            onConfirm: () => {
              const input = document.getElementById('modal-client-id-input');
              if (input && input.value.trim()) {
                this.setClientId(input.value.trim());
                setTimeout(() => { this.connect(); }, 400);
              }
            }
          });
        } else {
          const id = prompt('أدخل Google Client ID الخاص بك:');
          if (id) {
            this.setClientId(id);
            this.connect();
          }
        }
        return;
      }

      if (!tokenClient) {
        this.initTokenClient();
      }

      if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: this.accessToken ? '' : 'select_account' });
      } else {
        alert('تعذر تحميل واجهة Google Identity Services. تأكد من اتصالك بالإنترنت.');
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
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        if (res.ok) {
          this.userProfile = await res.json();
          sessionStorage.setItem('vienix_drive_profile', JSON.stringify(this.userProfile));
        }
      } catch (err) {
        console.warn('[VienixDrive] Failed to fetch user profile:', err);
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
        for (let ch = 1; ch <= 8; ch++) {
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
    // 5. SYNC FROM DRIVE (PULL / RESTORE)
    // ─────────────────────────────────────────────────────────────
    pullFromDrive: async function () {
      if (!this.accessToken) {
        this.connect();
        return;
      }

      if (!confirm('هل ترغب باستيراد ملفاتك من Google Drive؟ سيتم دمج الحجرات المستلمة مع مساحة العمل الحالية.')) {
        return;
      }

      this.isSyncing = true;
      this.updateUI();

      try {
        const folderId = await this.ensureAppFolder();
        if (!folderId) throw new Error('App folder not found on Drive');

        // Check for manifest file first
        const manifestFile = await this.findFileInFolder('vienix_workspace_manifest.json');
        if (manifestFile) {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${manifestFile.id}?alt=media`, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
          });
          if (res.ok) {
            const manifest = await res.json();
            if (manifest && manifest.rawKeys && window.VienixStorage && typeof window.VienixStorage.applyRestore === 'function') {
              window.VienixStorage.applyRestore(manifest);
              return;
            }
          }
        }

        alert('لم يتم العثور على ملفات سابقة في مجلد Vienix Notes على Drive.');
      } catch (err) {
        alert('حدث خطأ أثناء الاستيراد من Google Drive: ' + err.message);
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
              <button type="button" class="btn btn-primary btn-sync-now ${this.isSyncing ? 'loading' : ''}" onclick="VienixDrive.syncAllToDrive()">
                ${this.isSyncing ? '🔄 جارٍ المزامنة...' : '☁️ مزامنة الآن'}
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

        <!-- Advanced Client ID Configuration -->
        <div class="settings-group" style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:16px;">
          <label class="settings-label" style="display:flex; align-items:center; justify-content:space-between;">
            <span>معرّف تطبيق Google (Client ID)</span>
            <span style="font-size:0.72rem; color:var(--text-muted); font-weight:normal;">للمطورين والمتقدمين</span>
          </label>
          <p class="settings-hint">يمكنك استخدام Client ID مخصص لك للتحكم الكامل بصلاحيات الوصول.</p>
          <div style="display:flex; gap:8px;">
            <input type="text" class="settings-input" id="s-google-client-id" value="${this.clientId}" placeholder="xxxx.apps.googleusercontent.com" style="direction:ltr; font-family:monospace; font-size:0.8rem; flex:1;" onchange="VienixDrive.setClientId(this.value)">
            <button class="settings-mini-btn" onclick="VienixDrive.setClientId(document.getElementById('s-google-client-id').value)">حفظ</button>
          </div>
        </div>
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
