// ============================================================
// Service Worker — 离线壳缓存 + 资源 stale-while-revalidate
// 静态资源走缓存优先 (拿到立刻显示, 后台再拉新版本更新缓存)
// API 完全走网络 (实时数据)
// 版本号变更时清掉所有旧缓存
// ============================================================

const VERSION = 'v1';
const CACHE = `chanhuilou-${VERSION}`;

// 首装时预缓存的静态壳 — 离线打开页面至少能看到主页
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/config.js',
  '/app.js',
  '/favicon.svg',
  '/manifest.json',
];

// install: 预缓存壳 + 立刻接管 (skipWaiting 让新版本不等待旧 tab 关闭)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// activate: 清掉所有旧版本缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// fetch: API 不拦 (默认走网络); 其他走 stale-while-revalidate
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    const network = fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => cached);
    return cached || network;
  })());
});
