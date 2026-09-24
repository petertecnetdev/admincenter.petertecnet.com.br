const CACHE_VERSION = 'petertecnet-admin-pwa-v6';
const ADMIN_CACHE_PREFIX = 'petertecnet-admin-pwa-';

const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#02080c">
  <title>Admin Center indisponível</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#02080c;color:#effcff}
    *{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0,rgba(53,223,242,.1),transparent 38%),#02080c}
    main{width:min(520px,100%);padding:28px;border:1px solid rgba(116,217,234,.16);border-radius:22px;background:rgba(5,20,29,.96);box-shadow:0 26px 80px rgba(0,0,0,.35)}
    small{color:#35dff2;font-weight:800;letter-spacing:.16em;text-transform:uppercase}h1{margin:10px 0 12px;font-size:clamp(26px,6vw,38px)}p{margin:0 0 20px;color:#91adb5;line-height:1.6}a{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:0 18px;border-radius:12px;background:#dffbff;color:#041217;font-weight:900;text-decoration:none}
  </style>
</head>
<body><main><small>Peter Tecnet</small><h1>Admin Center temporariamente offline</h1><p>Para proteger a integridade do painel, uma versão antiga não será carregada do cache. Reconecte-se e tente novamente.</p><a href="/">Tentar novamente</a></main></body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(ADMIN_CACHE_PREFIX) && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => new Response(OFFLINE_HTML, {
        status: 503,
        statusText: 'Admin Center offline',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }))
    );
    return;
  }

  if (!url.pathname.startsWith('/assets/')) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
