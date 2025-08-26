diff --git a/sw.js b/sw.js
index f7d65a4ca3badd3cf8b1df7e3484739e0bfd501f..575793bda638f2b65e68be85fb2c6e0182f3ab94 100644
--- a/sw.js
+++ b/sw.js
@@ -1,33 +1,34 @@
 // A simple cache-first service worker
 const CACHE_NAME = 'pgr-roster-cache-v2';
-const urlsToCache = [
-  '/',
-  'index.html',
-  'manifest.webmanifest'
-  // Icons are not cached here but can be added if you create them
-];
+const urlsToCache = [
+  '/',
+  'index.html',
+  'manifest.webmanifest',
+  'icon-192.png',
+  'icon-512.png'
+];
 
 self.addEventListener('install', event => {
   event.waitUntil(
     caches.open(CACHE_NAME)
       .then(cache => {
         console.log('Opened cache');
         return cache.addAll(urlsToCache);
       })
   );
   self.skipWaiting();
 });
 
 self.addEventListener('activate', event => {
   const cacheWhitelist = [CACHE_NAME];
   event.waitUntil(
     caches.keys().then(cacheNames => {
       return Promise.all(
         cacheNames.map(cacheName => {
           if (cacheWhitelist.indexOf(cacheName) === -1) {
             return caches.delete(cacheName);
           }
         })
       );
     })
   );
