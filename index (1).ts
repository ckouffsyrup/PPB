import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webPush from "npm:web-push@3.6.7";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const VAPID_PUBLIC_KEY=Deno.env.get("VAPID_PUBLIC_KEY")??"";
const VAPID_PRIVATE_KEY=Deno.env.get("VAPID_PRIVATE_KEY")??"";
const VAPID_SUBJECT=Deno.env.get("VAPID_SUBJECT")??"";
const PUSH_INTERNAL_SECRET=Deno.env.get("PUSH_INTERNAL_SECRET")??"";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-printbook-push-secret",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Cache-Control":"no-store"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

function configured(){
  return !!(SUPABASE_URL&&SERVICE_ROLE&&VAPID_PUBLIC_KEY&&VAPID_PRIVATE_KEY&&VAPID_SUBJECT);
}
function bearer(req:Request){
  const raw=req.headers.get("authorization")||"";
  return raw.toLowerCase().startsWith("bearer ")?raw.slice(7).trim():"";
}
function errStatus(err:any){
  return Number(err?.statusCode||err?.status||err?.response?.statusCode||0)||0;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});

  if(req.method==="GET"){
    if(new URL(req.url).searchParams.get("health")==="1"){
      return json({
        ok:true,
        configured:{
          ready:configured(),
          supabase:!!(SUPABASE_URL&&SERVICE_ROLE),
          vapid_public:!!VAPID_PUBLIC_KEY,
          vapid_private:!!VAPID_PRIVATE_KEY,
          vapid_subject:!!VAPID_SUBJECT,
          internal_secret:!!PUSH_INTERNAL_SECRET
        },
        publicKey:VAPID_PUBLIC_KEY||null
      });
    }
    if(!VAPID_PUBLIC_KEY)return json({error:"VAPID public key is not configured."},503);
    return json({publicKey:VAPID_PUBLIC_KEY,configured:configured()});
  }

  if(req.method!=="POST")return json({error:"Method not allowed."},405);
  if(!configured())return json({error:"Push backend is not fully configured. Check VAPID secrets."},503);

  const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};
  try{body=await req.json()}catch{return json({error:"Invalid JSON body."},400)}

  let userId="";
  let payload:any=null;

  if(body.action==="test"){
    const token=bearer(req);
    if(!token)return json({error:"Sign in first."},401);
    const {data,error}=await db.auth.getUser(token);
    if(error||!data?.user)return json({error:"Your session is invalid or expired."},401);
    userId=data.user.id;
    payload={
      title:"PrintBook test notification",
      body:"Push is working on this device. You're ready for customer order alerts.",
      tag:`printbook-test-${Date.now()}`,
      type:"test",
      url:"./?open=orders",
      renotify:true
    };
  }else if(body.action==="order_request"){
    const supplied=req.headers.get("x-printbook-push-secret")||"";
    if(!PUSH_INTERNAL_SECRET||supplied!==PUSH_INTERNAL_SECRET)return json({error:"Forbidden."},403);
    userId=String(body.user_id||"");
    if(!userId)return json({error:"Missing notification owner."},400);
    const customer=String(body.customer||"Customer").slice(0,80);
    const item=String(body.item||"print").slice(0,120);
    const quantity=Math.max(1,Number(body.quantity||1)||1);
    const orderId=String(body.order_id||"");
    const detail=String(body.detail||"").slice(0,160);
    payload={
      title:"New Print Request",
      body:`${customer} requested ${quantity}× ${item}${detail?` · ${detail}`:""}`,
      tag:`printbook-order-${orderId||Date.now()}`,
      type:"order_request",
      order_id:orderId||null,
      url:"./?open=orders",
      renotify:true,
      requireInteraction:true
    };
  }else{
    return json({error:"Unknown push action."},400);
  }

  webPush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);

  const {data:rows,error:subError}=await db.from("push_subscriptions")
    .select("endpoint,subscription,device_name,active")
    .eq("user_id",userId).eq("active",true);
  if(subError){console.error("Subscription lookup failed",subError);return json({error:"Could not load registered devices."},500)}

  let sent=0,failed=0,expired=0;
  const failures:any[]=[];
  for(const row of rows??[]){
    try{
      await webPush.sendNotification(row.subscription,JSON.stringify(payload),{TTL:300,urgency:"high"});
      sent++;
      await db.from("push_subscriptions").update({last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString(),active:true})
        .eq("user_id",userId).eq("endpoint",row.endpoint);
    }catch(err:any){
      const status=errStatus(err);
      console.error("Push send failed",{status,device:row.device_name,endpoint:String(row.endpoint).slice(0,70),message:err?.message});
      if(status===404||status===410){
        expired++;
        await db.from("push_subscriptions").delete().eq("user_id",userId).eq("endpoint",row.endpoint);
      }else{
        failed++;
        failures.push({status,message:String(err?.message||"Push failed").slice(0,160),device:row.device_name||"Web device"});
      }
    }
  }

  return json({ok:true,total:(rows??[]).length,sent,failed,expired,failures:body.action==="test"?failures:undefined});
});
