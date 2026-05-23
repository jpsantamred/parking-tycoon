/* Parking Tycoon — Service Worker
 * Cache strategy:
 *   - Core HTML / JS / CSS / icons → cache-first, network-fallback (precached at install)
 *   - Sprites (assets/*.png) → cache-first (precached + lazy)
 *   - Phaser CDN → cache-first
 *   - Everything else → network-first, cache-fallback
 *
 * Bump CACHE_VERSION when game.js or core assets change to invalidate clients.
 */

const CACHE_VERSION = 'pt-v1.02';
const CACHE_NAME = `parking-tycoon-${CACHE_VERSION}`;

// Files to precache at install (everything needed to boot offline)
// NOTE: v0.56 bundles Phaser locally (vendor/phaser.min.js) so the game
// works inside Capacitor WebView and offline without CDN.
const PRECACHE_URLS = [
    './',
    './index.html',
    './game.js',
    './manifest.json',
    './vendor/phaser.min.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
];

// Sprite assets are added to a separate list so installation doesn't fail
// if one is missing; they get fetched on first request anyway.
const SPRITE_PATHS = [
    'assets/tomas_south.png', 'assets/tomas_east.png',
    'assets/tomas_north.png', 'assets/tomas_west.png',
    'assets/ana_south.png', 'assets/ana_east.png',
    'assets/ana_north.png', 'assets/ana_west.png',
    'assets/ladron_south.png', 'assets/ladron_east.png',
    'assets/ladron_north.png', 'assets/ladron_west.png',
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Precache core (must succeed)
        await cache.addAll(PRECACHE_URLS);
        // Sprites — best-effort, individually
        await Promise.allSettled(SPRITE_PATHS.map(p => cache.add(p)));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        // Clear old caches from previous versions
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(k => k.startsWith('parking-tycoon-') && k !== CACHE_NAME)
                .map(k => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    // Cache-first for everything we know we own (same-origin + Phaser CDN)
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) {
            // Refresh in background (stale-while-revalidate) for same-origin assets
            if (url.origin === self.location.origin) {
                event.waitUntil((async () => {
                    try {
                        const fresh = await fetch(event.request);
                        if (fresh && fresh.ok) await cache.put(event.request, fresh.clone());
                    } catch (e) {}
                })());
            }
            return cached;
        }
        // Not in cache → fetch from network and cache for next time
        try {
            const fresh = await fetch(event.request);
            if (fresh && fresh.ok) await cache.put(event.request, fresh.clone());
            return fresh;
        } catch (e) {
            // Offline + not cached → return a basic offline message for HTML requests
            if (event.request.headers.get('Accept')?.includes('text/html')) {
                return new Response(
                    '<!DOCTYPE html><html><body style="background:#0f172a;color:#fff;font-family:monospace;padding:40px;"><h1>📵 Offline</h1><p>Parking Tycoon necesita conexión la primera vez para descargar los assets. Volvé a entrar con internet y luego podés jugar offline.</p></body></html>',
                    { headers: { 'Content-Type': 'text/html' } }
                );
            }
            throw e;
        }
    })());
});

// Allow the client to trigger an immediate update
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
