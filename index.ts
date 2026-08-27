import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const SHOP_OWNER_USER_ID=Deno.env.get("SHOP_OWNER_USER_ID")??"";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Cache-Control":"no-store"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(s:unknown,max:number)=>String(s??"").trim().slice(0,max);

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(!SUPABASE_URL||!SERVICE_ROLE||!SHOP_OWNER_USER_ID)return json({error:"Public storefront is not configured."},503);
  const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});

  if(req.method==="GET"){
    const [pr,fr]=await Promise.all([
      db.from("prints").select("id,name,category,price,hours,notes,favorite,photo_url,variants,deal_qty,deal_price,out_of_stock_behavior,made_qty,sold_qty,created_at,updated_at").eq("user_id",SHOP_OWNER_USER_ID),
      db.from("filaments").select("id,brand,material,color,visual_color,remaining,spool_size").eq("user_id",SHOP_OWNER_USER_ID)
    ]);
    const err=pr.error||fr.error;if(err){console.error(err);return json({error:"Could not load storefront."},500)}
    const products=(pr.data??[]).map((p:any)=>{
      const variants=Array.isArray(p.variants)?p.variants.map((v:any)=>({id:v.id,name:clean(v.name,120),price:v.price===""||v.price==null?"":Number(v.price),stock:Math.max(0,Number(v.stock??0)),colorway_id:clean(v.colorway_id,80)})):[];
      return {...p,price:Number(p.price??0),variants,deal_qty:Number(p.deal_qty??0),deal_price:Number(p.deal_price??0),made_qty:Number(p.made_qty??0),sold_qty:Number(p.sold_qty??0)}
    }).filter((p:any)=>{
      const stock=p.variants.length?p.variants.reduce((n:number,v:any)=>n+Number(v.stock??0),0):Math.max(0,p.made_qty-p.sold_qty);
      return !(stock<=0&&p.out_of_stock_behavior==="hide")
    });
    const filaments=(fr.data??[]).filter((f:any)=>Number(f.remaining??0)>0).map((f:any)=>{
      const remaining=Number(f.remaining??0),size=Math.max(1,Number(f.spool_size??1000));
      return {id:f.id,brand:f.brand,material:f.material,color:f.color,visual_color:f.visual_color,available:true,low_stock:remaining<=100||(remaining/size*100)<=15}
    });
    return json({products,filaments,synced_at:new Date().toISOString()})
  }

  if(req.method==="POST"){
    let body:any={};try{body=await req.json()}catch{return json({error:"Invalid request."},400)}
    if(body.action!=="request_print")return json({error:"Unknown action."},400);
    const printId=clean(body.print_id,80),variantId=clean(body.variant_id,80),filamentId=clean(body.filament_id,80),customer=clean(body.customer,80),contact=clean(body.contact,200),notes=clean(body.notes,1000),quantity=Math.min(50,Math.max(1,Number(body.quantity??1)||1));
    if(!printId||!customer)return json({error:"Name and product are required."},400);

    const {data:product,error:pe}=await db.from("prints").select("id,name,price,variants").eq("id",printId).eq("user_id",SHOP_OWNER_USER_ID).maybeSingle();
    if(pe||!product)return json({error:"That product is not available."},404);
    const variants=Array.isArray(product.variants)?product.variants:[],variant=variantId?variants.find((v:any)=>String(v.id)===variantId):null;
    if(variantId&&!variant)return json({error:"That product version is not available."},400);

    let filamentText="No preference";
    if(filamentId){
      const {data:f}=await db.from("filaments").select("id,brand,material,color,remaining").eq("id",filamentId).eq("user_id",SHOP_OWNER_USER_ID).gt("remaining",0).maybeSingle();
      if(!f)return json({error:"That filament is no longer available."},400);
      filamentText=[f.color,f.material,f.brand].filter(Boolean).join(" · ")
    }

    const unitPrice=variant&&variant.price!==""&&variant.price!=null?Number(variant.price):Number(product.price??0),estimate=Math.max(0,unitPrice*quantity);
    const detail=["Public website request",`Version: ${variant?clean(variant.name,120):"Standard"}`,`Preferred filament: ${filamentText}`,contact?`Contact: ${contact}`:"",notes?`Customer notes: ${notes}`:""].filter(Boolean).join("\n");
    const {data:inserted,error:ie}=await db.from("orders").insert({user_id:SHOP_OWNER_USER_ID,customer,status:"Requested",item:product.name,quantity,quoted_price:estimate,due_date:null,print_id:product.id,notes:detail,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}).select("id").single();
    if(ie){console.error(ie);return json({error:"Could not submit the request."},500)}
    return json({ok:true,request_id:inserted.id,estimated_price:estimate})
  }

  return json({error:"Method not allowed."},405)
});
