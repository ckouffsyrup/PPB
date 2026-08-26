const CACHE="printbook-v1";
const ASSETS=["./","index.html","styles.css","app.js","manifest.webmanifest","assets/icon.svg","assets/first-print.jpeg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("fetch",e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
