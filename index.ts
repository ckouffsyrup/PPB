import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const SHOP_OWNER_USER_ID=Deno.env.get("SHOP_OWNER_USER_ID")??"";
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")??"";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Cache-Control":"no-store"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(s:unknown,max:number)=>String(s??"").trim().slice(0,max);

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  const reqUrl=new URL(req.url);
  if(req.method==="GET"&&reqUrl.searchParams.get("config")==="1"){
    if(!SUPABASE_URL||!SUPABASE_ANON_KEY){
      return json({error:"Admin login config is unavailable."},503);
    }
    return json({supabase_url:SUPABASE_URL,anon_key:SUPABASE_ANON_KEY});
  }

  const missing:string[]=[];
  if(!SUPABASE_URL)missing.push("SUPABASE_URL");
  if(!SERVICE_ROLE)missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if(!SHOP_OWNER_USER_ID)missing.push("SHOP_OWNER_USER_ID");
  if(missing.length){
    console.error("Public storefront missing configuration:",missing);
    return json({
      error:"Public storefront is not configured.",
      missing,
      hint:"Add the missing secret/environment value, then redeploy or retry the function."
    },503);
  }
  const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});

  if(req.method==="GET"&&reqUrl.searchParams.get("health")==="1"){
    return json({ok:true,configured:true,owner_user_id_present:!!SHOP_OWNER_USER_ID});
  }

  if(req.method==="GET"){
    const [pr,fr,cr]=await Promise.all([
      db.from("prints").select("id,name,category,price,hours,notes,favorite,photo_url,variants,filament_usage,multicolor_capable,deal_qty,deal_price,out_of_stock_behavior,made_qty,sold_qty,created_at,updated_at").eq("user_id",SHOP_OWNER_USER_ID),
      db.from("filaments").select("id,brand,material,color,visual_color,remaining,spool_size").eq("user_id",SHOP_OWNER_USER_ID),
      db.from("colorways").select("id,usage").eq("user_id",SHOP_OWNER_USER_ID)
    ]);
    const err=pr.error||fr.error||cr.error;if(err){console.error(err);return json({error:"Could not load storefront."},500)}
    const colorwayMap=new Map((cr.data??[]).map((c:any)=>[String(c.id),Array.isArray(c.usage)?c.usage:[]]));
    const products=(pr.data??[]).map((p:any)=>{
      const baseUsage=Array.isArray(p.filament_usage)?p.filament_usage:[];
      const variants=Array.isArray(p.variants)?p.variants.map((v:any)=>{
        const variantUsage=Array.isArray(v.filament_usage)&&v.filament_usage.length
          ?v.filament_usage
          :(v.colorway_id?colorwayMap.get(String(v.colorway_id))||[]:[]);
        return {
          id:v.id,
          name:clean(v.name,120),
          price:v.price===""||v.price==null?"":Number(v.price),
          stock:Math.max(0,Number(v.stock??0)),
          colorway_id:clean(v.colorway_id,80),
          multicolor_capable:variantUsage.length>1
        };
      }):[];
      const multicolor_capable=!!p.multicolor_capable;
      const {filament_usage,...safeProduct}=p;
      return {...safeProduct,price:Number(p.price??0),variants,multicolor_capable,deal_qty:Number(p.deal_qty??0),deal_price:Number(p.deal_price??0),made_qty:Number(p.made_qty??0),sold_qty:Number(p.sold_qty??0)}
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
    const colorMode=body.color_mode==="multi"?"multi":"single";
    const colorIds=Array.isArray(body.color_ids)?[...new Set(body.color_ids.map((x:any)=>clean(x,80)).filter(Boolean))].slice(0,8):[];
    if(!printId||!customer)return json({error:"Name and product are required."},400);

    const {data:product,error:pe}=await db.from("prints").select("id,name,price,variants,filament_usage,multicolor_capable").eq("id",printId).eq("user_id",SHOP_OWNER_USER_ID).maybeSingle();
    if(pe||!product)return json({error:"That product is not available."},404);
    const variants=Array.isArray(product.variants)?product.variants:[],variant=variantId?variants.find((v:any)=>String(v.id)===variantId):null;
    if(variantId&&!variant)return json({error:"That product version is not available."},400);

    let variantUsage:any[]=[];
    if(variant){
      if(Array.isArray(variant.filament_usage)&&variant.filament_usage.length){
        variantUsage=variant.filament_usage;
      }else if(variant.colorway_id){
        const {data:cw}=await db.from("colorways").select("usage").eq("id",variant.colorway_id).eq("user_id",SHOP_OWNER_USER_ID).maybeSingle();
        variantUsage=Array.isArray(cw?.usage)?cw.usage:[];
      }
    }
    if(colorMode==="multi"&&!product.multicolor_capable){
      return json({error:"This product is not available for multicolor requests."},400);
    }
    if(colorMode==="multi"&&colorIds.length<2){
      return json({error:"Choose at least 2 colors."},400);
    }

    let filamentText="No preference";
    if(colorMode==="multi"){
      const {data:selectedColors,error:colorErr}=await db.from("filaments")
        .select("id,brand,material,color,remaining")
        .in("id",colorIds)
        .eq("user_id",SHOP_OWNER_USER_ID)
        .gt("remaining",0);
      if(colorErr||!selectedColors||selectedColors.length!==colorIds.length){
        return json({error:"One or more selected colors are no longer available."},400);
      }
      filamentText=selectedColors.map((f:any)=>[f.color,f.material].filter(Boolean).join(" · ")).join(" + ");
    }else if(filamentId){
      const {data:f}=await db.from("filaments").select("id,brand,material,color,remaining").eq("id",filamentId).eq("user_id",SHOP_OWNER_USER_ID).gt("remaining",0).maybeSingle();
      if(!f)return json({error:"That filament is no longer available."},400);
      filamentText=[f.color,f.material,f.brand].filter(Boolean).join(" · ")
    }

    const unitPrice=variant&&variant.price!==""&&variant.price!=null?Number(variant.price):Number(product.price??0),estimate=Math.max(0,unitPrice*quantity);
    const colorDetail=colorMode==="multi"?`Multicolor: ${filamentText}`:`Preferred filament: ${filamentText}`;
    const detail=["Public website request",`Version: ${variant?clean(variant.name,120):"Standard"}`,colorDetail,contact?`Contact: ${contact}`:"",notes?`Customer notes: ${notes}`:""].filter(Boolean).join("\n");
    const now=new Date().toISOString();
    const order={
      id:crypto.randomUUID(),
      user_id:SHOP_OWNER_USER_ID,
      customer,
      status:"Requested",
      item:product.name,
      quantity,
      quoted_price:estimate,
      // This column is a Postgres DATE. Empty string is invalid for DATE,
      // so unscheduled customer requests must store NULL.
      due_date:null,
      print_id:product.id,
      notes:detail,
      created_at:now,
      updated_at:now
    };

    const {data:inserted,error:ie}=await db.from("orders")
      .insert(order)
      .select("id,user_id,customer,status,item,quantity,quoted_price,due_date,print_id,notes,created_at,updated_at")
      .single();

    if(ie){
      console.error("Public request insert failed",{
        code:ie.code,
        message:ie.message,
        details:ie.details,
        hint:ie.hint
      });
      return json({
        error:"Could not submit the request.",
        code:ie.code||"",
        detail:ie.message||"Database insert failed."
      },500);
    }

    console.log("Public request created",inserted.id);
    return json({
      ok:true,
      request_id:inserted.id,
      estimated_price:estimate,
      status:"Requested"
    })
  }

  return json({error:"Method not allowed."},405)
});
