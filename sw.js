const CACHE_NAME = 'sonata-cache-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Handle Share Target POST request
    if (event.request.method === 'POST' && url.pathname.includes('index.html')) {
        event.respondWith(
            (async () => {
                const formData = await event.request.formData();
                sharedFile = formData.get('file'); // Store in memory

                return Response.redirect('/index.html?shared=true', 303);
            })()
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_SHARED_FILE') {
        if (sharedFile) {
            event.source.postMessage({
                type: 'SHARED_FILE',
                file: sharedFile
            });
            sharedFile = null; // Clear after sending
        }
    }
});
