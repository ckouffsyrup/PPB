const CACHE="printbook-v5.2.6-customer-mode-push";
const CORE_ASSETS=["./","./index.html","./styles.css","./app.js"];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE_ASSETS.map(async asset=>{
      try{
        const req=new Request(asset,{cache:"reload"});
        const res=await fetch(req);
        if(res.ok)await cache.put(req,res.clone());
      }catch(err){console.warn("PrintBook cache skipped",asset,err)}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  if(event.request.mode==="navigate"){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(event.request);
        const cache=await caches.open(CACHE);
        cache.put("./index.html",fresh.clone()).catch(()=>{});
        return fresh;
      }catch{
        return (await caches.match(event.request))||
               (await caches.match("./index.html"))||
               new Response("PrintBook is offline.",{status:503,headers:{"Content-Type":"text/plain"}});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    try{
      const fresh=await fetch(event.request);
      if(fresh.ok){
        const cache=await caches.open(CACHE);
        cache.put(event.request,fresh.clone()).catch(()=>{});
      }
      return fresh;
    }catch{
      return new Response("",{status:504,statusText:"Offline"});
    }
  })());
});

self.addEventListener("push",event=>{
  let payload={title:"PrintBook",body:"You have a new PrintBook alert.",tag:"printbook",url:"./"};
  try{if(event.data)payload={...payload,...event.data.json()}}
  catch{try{payload.body=event.data.text()}catch{}}
  const url=new URL(payload.url||"./",self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(payload.title||"PrintBook",{
    body:payload.body||"",
    icon:new URL("./assets/icon-180.png",self.registration.scope).href,
    badge:new URL("./assets/icon-180.png",self.registration.scope).href,
    tag:payload.tag||"printbook",renotify:payload.renotify!==false,
    requireInteraction:payload.requireInteraction===true,
    data:{url,order_id:payload.order_id||null,type:payload.type||"general"}
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

self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
