/* PrintBook 5.23.2 — owner-only admin access + reliable mobile web-app admin restore. */
(() => {
  const ADMIN_AUTH_URL="https://dljauobtomijmtaxvkvv.supabase.co/functions/v1/admin-authorize";
  const MOBILE_ADMIN_PREF="printbook_mobile_admin_device_v1";
  const params=new URLSearchParams(location.search);
  const mobileDevice=window.matchMedia?.("(max-width: 760px)")?.matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent||"");
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone===true;
  const explicitStore=params.get("store")==="1";
  const explicitAdmin=params.get("admin")==="1" || /\/admin\/?$/.test(location.pathname);
  let rememberedMobileAdmin=false;
  try{rememberedMobileAdmin=mobileDevice&&localStorage.getItem(MOBILE_ADMIN_PREF)==="1"}catch{}
  if(explicitStore){try{localStorage.removeItem(MOBILE_ADMIN_PREF)}catch{}}
  const adminRoute=!explicitStore&&(explicitAdmin||rememberedMobileAdmin);
  let gateBusy=false;

  if(adminRoute&&!explicitAdmin&&rememberedMobileAdmin){
    try{
      const url=new URL(location.href);
      url.searchParams.delete("store");
      url.searchParams.set("admin","1");
      history.replaceState({},"",url.pathname+url.search+url.hash);
    }catch{}
  }

  function rememberThisMobileAsAdmin(){
    if(!mobileDevice)return;
    try{localStorage.setItem(MOBILE_ADMIN_PREF,"1")}catch{}
  }
  function forgetMobileAdmin(){try{localStorage.removeItem(MOBILE_ADMIN_PREF)}catch{}}
  function openCustomerStoreFromAdmin(){forgetMobileAdmin();location.href="./?store=1";}
  function ensureMobileStoreExit(){
    if(!mobileDevice||$("mobileAdminStoreExit"))return;
    const drawer=$("sideDrawer");if(!drawer)return;
    const wrap=document.createElement("div");wrap.id="mobileAdminStoreExit";wrap.className="mobile-admin-store-exit";
    const btn=document.createElement("button");btn.type="button";btn.textContent="View Customer Store";btn.onclick=openCustomerStoreFromAdmin;
    wrap.appendChild(btn);drawer.appendChild(wrap);
  }

  function hideSignup(){
    const btn=$("signUpBtn");if(btn){btn.classList.add("hidden");btn.remove();}
    document.querySelectorAll('button').forEach(button=>{
      const t=String(button.textContent||"").trim().toLowerCase();
      if(t==="create account"||t==="sign up"||t==="create admin account")button.remove();
    });
  }

  async function ensureSupabaseReady(){
    if(supabaseClient)return supabaseClient;
    if((!settings.supabaseUrl||!settings.supabaseKey) && typeof getPublicSupabaseConfig==="function"){
      const cfg=await getPublicSupabaseConfig();
      settings.supabaseUrl=cfg.supabase_url;settings.supabaseKey=cfg.anon_key;
      try{localStorage.setItem(K.settings,JSON.stringify(settings))}catch{}
    }
    if(typeof setupSupabase==="function")await setupSupabase();
    if(!supabaseClient)throw new Error("Admin login could not connect to the account server.");
    return supabaseClient;
  }

  async function authorizeSession(){
    await ensureSupabaseReady();
    const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;
    const session=data?.session;
    if(!session?.access_token||!session?.user)return {authorized:false,user:null};
    let res;
    try{res=await fetch(ADMIN_AUTH_URL,{method:"GET",headers:{Authorization:`Bearer ${session.access_token}`,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(8000)})}
    catch{throw new Error("Could not verify owner access. Please try again.")}
    let payload={};try{payload=await res.json()}catch{}
    if(!res.ok||payload?.authorized!==true)return {authorized:false,user:session.user};
    return {authorized:true,user:session.user};
  }

  function removeGate(){$("printbookAdminGate")?.remove();document.body.classList.remove("admin-auth-locked");}
  function showGate(message="Sign in with the PrintBook owner account."){
    document.body.classList.add("admin-auth-locked");
    let gate=$("printbookAdminGate");
    if(!gate){
      gate=document.createElement("div");gate.id="printbookAdminGate";gate.className="printbook-admin-gate";
      gate.innerHTML=`<div class="printbook-admin-login-card"><div class="printbook-admin-mark">KP</div><p>PRINTBOOK</p><h1>Owner Login</h1><span id="printbookAdminGateMessage"></span><label>Email<input id="printbookAdminEmail" type="email" autocomplete="username" placeholder="Owner email"></label><label>Password<input id="printbookAdminPassword" type="password" autocomplete="current-password" placeholder="Password"></label><button id="printbookAdminLoginBtn" type="button">Sign in to PrintBook</button><a href="./?store=1" id="printbookBackToStore">← Back to store</a></div>`;
      document.body.appendChild(gate);
      $("printbookAdminLoginBtn").onclick=adminGateLogin;
      $("printbookAdminPassword").addEventListener("keydown",e=>{if(e.key==="Enter")adminGateLogin()});
      $("printbookBackToStore").onclick=()=>forgetMobileAdmin();
    }
    $("printbookAdminGateMessage").textContent=message;
    setTimeout(()=>$("printbookAdminEmail")?.focus(),50);
  }

  async function unlockAdmin(user){
    currentUser=user;
    if(typeof deactivatePublicVisitorMode==="function")deactivatePublicVisitorMode();
    customerMode=false;publicVisitorMode=false;document.body.classList.remove("public-visitor");
    if(typeof updateCloudUI==="function")updateCloudUI();
    if(typeof startRealtime==="function")startRealtime();
    rememberThisMobileAsAdmin();removeGate();ensureMobileStoreExit();
    if(typeof renderAll==="function")renderAll();
    setTimeout(()=>{if(typeof pullCloud==="function")pullCloud(false).catch(()=>{})},0);
  }

  async function rejectUnauthorized(user){
    try{if(supabaseClient)await supabaseClient.auth.signOut()}catch{}
    currentUser=null;if(typeof stopRealtime==="function")stopRealtime();
    showGate(user?"That account is valid, but it is not authorized to access this PrintBook admin.":"Sign in with the PrintBook owner account.");
  }

  async function adminGateLogin(){
    if(gateBusy)return;
    const email=$("printbookAdminEmail")?.value.trim()||"",password=$("printbookAdminPassword")?.value||"";
    if(!email||!password){showGate("Enter the owner email and password.");return}
    gateBusy=true;const btn=$("printbookAdminLoginBtn"),old=btn?.textContent||"Sign in to PrintBook";
    if(btn){btn.disabled=true;btn.textContent="Verifying owner…"}
    try{
      await ensureSupabaseReady();
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error)throw error;if(!data?.user)throw new Error("Sign-in did not return a user.");
      const check=await authorizeSession();if(!check.authorized){await rejectUnauthorized(data.user);return}
      await unlockAdmin(check.user||data.user);if(typeof toast==="function")toast("Owner access verified");
    }catch(err){console.error("Owner gate login failed",err);showGate(err?.message||"Could not sign in.")}
    finally{gateBusy=false;if(btn&&document.body.contains(btn)){btn.disabled=false;btn.textContent=old}}
  }

  async function tryStandaloneOwnerSession(){
    if(!mobileDevice||!standalone||explicitStore||explicitAdmin||rememberedMobileAdmin)return false;
    try{
      const check=await authorizeSession();
      if(!check.authorized)return false;
      try{
        const url=new URL(location.href);url.searchParams.set("admin","1");url.searchParams.delete("store");
        history.replaceState({},"",url.pathname+url.search+url.hash);
      }catch{}
      await unlockAdmin(check.user);
      return true;
    }catch(err){console.warn("Standalone owner-session restore skipped",err);return false}
  }

  function installMobileAdminShortcut(){
    if(!mobileDevice)return;
    let timer=null;
    const start=e=>{
      const target=e.target?.closest?.("#brandOwnerTrigger,.storefront-brand,.store-brand,.customer-store-brand,.brand-copy,.brand-lockup");
      if(!target)return;
      clearTimeout(timer);
      timer=setTimeout(()=>{location.href="./?admin=1"},900);
    };
    const cancel=()=>{clearTimeout(timer);timer=null};
    document.addEventListener("touchstart",start,{passive:true});
    document.addEventListener("touchend",cancel,{passive:true});
    document.addEventListener("touchcancel",cancel,{passive:true});
  }

  try{signUp=function(){toast("Account creation is disabled on this store.")}}catch{}
  hideSignup();installMobileAdminShortcut();

  if(adminRoute){
    document.body.classList.add("admin-auth-locked");showGate("Checking owner access…");
    setTimeout(async()=>{
      try{const check=await authorizeSession();if(check.authorized)await unlockAdmin(check.user);else await rejectUnauthorized(check.user)}
      catch(err){console.error("Owner session verification failed",err);showGate(err?.message||"Could not verify owner access.")}
    },0);
  }else if(!explicitStore&&mobileDevice&&standalone){
    // Home Screen apps may drop query parameters. Before committing to customer mode,
    // check whether this installed app already has the real owner session.
    setTimeout(async()=>{
      const restored=await tryStandaloneOwnerSession();
      if(!restored){
        try{openOwnerLogin=function(){}}catch{}
        if(typeof activatePublicVisitorMode==="function")activatePublicVisitorMode().catch(()=>{});
      }
    },0);
  }else{
    try{openOwnerLogin=function(){}}catch{}
    document.addEventListener("click",event=>{
      if(event.target?.closest?.("#brandOwnerTrigger,#ownerLoginBtn,#signUpBtn")){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    setTimeout(()=>{hideSignup();if(typeof activatePublicVisitorMode==="function")activatePublicVisitorMode().catch(()=>{})},0);
  }

  const style=document.createElement("style");
  style.textContent=`body.admin-auth-locked>.app-shell{visibility:hidden!important;pointer-events:none!important}.printbook-admin-gate{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 50% 15%,rgba(139,92,246,.15),transparent 40%),#0b0910;color:#f7f3fb;font-family:inherit}.printbook-admin-login-card{width:min(100%,390px);padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:#14101b;box-shadow:0 24px 80px rgba(0,0,0,.45)}.printbook-admin-mark{display:grid;place-items:center;width:54px;height:54px;margin-bottom:18px;border-radius:16px;background:#8b5cf6;font-weight:950;font-size:1.05rem}.printbook-admin-login-card>p{margin:0 0 5px;color:#a78bfa;font-size:.68rem;font-weight:950;letter-spacing:.16em}.printbook-admin-login-card h1{margin:0 0 8px;font-size:1.7rem}.printbook-admin-login-card>span{display:block;min-height:36px;margin-bottom:17px;color:#aaa2b2;font-size:.82rem;line-height:1.45}.printbook-admin-login-card label{display:block;margin:11px 0;color:#cfc7d8;font-size:.74rem;font-weight:800}.printbook-admin-login-card input{box-sizing:border-box;width:100%;margin-top:6px;padding:12px 13px;border:1px solid rgba(255,255,255,.11);border-radius:11px;background:#0d0a12;color:#fff;font:inherit;outline:none}.printbook-admin-login-card input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.13)}.printbook-admin-login-card button{width:100%;min-height:46px;margin-top:9px;border:0;border-radius:12px;background:#8b5cf6;color:#fff;font:inherit;font-weight:900;cursor:pointer}.printbook-admin-login-card button:disabled{opacity:.6}.printbook-admin-login-card a{display:block;margin-top:15px;text-align:center;color:#aaa2b2;font-size:.78rem;text-decoration:none}.mobile-admin-store-exit{display:none}@media(max-width:760px){.mobile-admin-store-exit{display:block;padding:14px 16px 22px}.mobile-admin-store-exit button{width:100%;min-height:44px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.045);color:#cfc7d8;font:inherit;font-weight:800}}`;
  document.head.appendChild(style);window.PRINTBOOK_BUILD="5.23.2";
})();
