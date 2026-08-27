const CACHE="printbook-v4.3.1-request-print";
const ASSETS=["./","index.html","styles.css","app.js","manifest.webmanifest","assets/icon.svg","assets/icon-180.png","assets/first-print.jpeg"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>r))));

self.addEventListener("push",event=>{
  let payload={title:"PrintBook",body:"You have a new PrintBook alert.",tag:"printbook",url:"./"};
  try{if(event.data)payload={...payload,...event.data.json()}}
  catch{try{payload.body=event.data.text()}catch{}}
  const url=new URL(payload.url||"./",self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(payload.title||"PrintBook",{
    body:payload.body||"",icon:"assets/icon-180.png",badge:"assets/icon-180.png",
    tag:payload.tag||"printbook",renotify:false,data:{url}
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification?.data?.url||self.registration.scope;
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows){
      if("focus" in client){
        try{if("navigate" in client)await client.navigate(target)}catch{}
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
