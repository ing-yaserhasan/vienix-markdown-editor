/**
 * Vienix Markdown Editor - Service Worker
 * Version: 1.0.8
 * Provides offline capabilities, instant caching, and PWA support.
 */

const CACHE_NAME = 'vienix-pwa-v1.0.8';
const RUNTIME_CACHE = 'vienix-runtime-v1.0.8';

// Core assets required for 100% offline functionality
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './initcontent.md',
  './app/css/style.css',
  './app/css/classic.css',
  './assets/fonts/tajawal.css',
  './assets/fonts/tajawal-400.ttf',
  './assets/fonts/tajawal-500.ttf',
  './assets/fonts/tajawal-700.ttf',
  './app/js/rtlmd.js',
  './app/js/storage-backup.js',
  './app/js/vienix-drive.js',
  './app/js/vienix-idb.js',
  './app/js/autogrow.js',
  './assets/icons/twemoji/twemoji_data.js',
  './assets/vendor/marked.min.js',
  './assets/vendor/mermaid.min.js',
  './assets/vendor/prism.min.js',
  './assets/vendor/html2pdf.bundle.min.js',
  './assets/vendor/html-docx.js',
  './assets/vendor/turndown.js',
  './assets/vendor/turndown-plugin-gfm.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-maskable.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png'
];

// Domains that should always bypass cache (APIs, OAuth, AI calls)
const BYPASS_DOMAINS = [
  'generativelanguage.googleapis.com',
  'accounts.google.com',
  'www.googleapis.com',
  'content.googleapis.com'
];

// 1. Install Event: Cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Use map + catch to ensure one failed asset doesn't abort the entire service worker installation
      const promises = PRECACHE_ASSETS.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response && response.ok) {
            await cache.put(url, response);
          }
        } catch (err) {
          console.warn('[Vienix SW] Failed to precache:', url, err);
        }
      });
      await Promise.all(promises);
      return self.skipWaiting();
    })
  );
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[Vienix SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Intelligent Caching & Fallback
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 1. Only handle standard HTTP/HTTPS GET requests; pass everything else straight to network
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. Ignore non-http(s) schemes (e.g. blob:, data:, chrome-extension:)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // 3. COMPLETE ISOLATION: Never touch or cache Google Drive, Google APIs, OAuth, or Gemini AI
  // This guarantees 100% zero interference with cloud uploads, downloads, syncing, or file operations
  if (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('google.com') ||
    url.hostname.endsWith('googleusercontent.com')
  ) {
    return;
  }

  // 4. Handle Third-Party Domains: Only Google Fonts are cached for offline rendering; ignore all others
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(
        caches.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          }).catch(() => null);

          return cachedResponse || fetchPromise;
        })
      );
    }
    return;
  }

  // A. Navigation Requests (Opening or Reloading index.html)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // If offline, return cached index.html
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return caches.match('./index.html') || caches.match('/');
        })
    );
    return;
  }

  // B. Local App Static Assets (CSS, JS, Fonts, Images, Icons)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback handled by cachedResponse if available
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Message Event: Allow skip waiting from frontend if update available
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
