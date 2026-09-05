/* PrintBook 5.23.0 — owner-only admin access. Public storefront never grants admin access just because a Supabase account exists. */
(() => {
  const ADMIN_AUTH_URL="https://dljauobtomijmtaxvkvv.supabase.co/functions/v1/admin-authorize";
  const params=new URLSearchParams(location.search);
  const adminRoute=params.get("admin")==="1" || /\/admin\/?$/.test(location.pathname);
  let gateBusy=false;

  function hideSignup(){
    const btn=$("signUpBtn");
    if(btn){btn.classList.add("hidden");btn.remove();}
    document.querySelectorAll('button').forEach(button=>{
      const t=String(button.textContent||"").trim().toLowerCase();
      if(t==="create account"||t==="sign up"||t==="create admin account")button.remove();
    });
  }

  async function ensureSupabaseReady(){
    if(supabaseClient)return supabaseClient;
    if((!settings.supabaseUrl||!settings.supabaseKey) && typeof getPublicSupabaseConfig==="function"){
      const cfg=await getPublicSupabaseConfig();
      settings.supabaseUrl=cfg.supabase_url;
      settings.supabaseKey=cfg.anon_key;
      try{localStorage.setItem(K.settings,JSON.stringify(settings))}catch{}
    }
    if(typeof setupSupabase==="function")await setupSupabase();
    if(!supabaseClient)throw new Error("Admin login could not connect to the account server.");
    return supabaseClient;
  }

  async function authorizeSession(){
    await ensureSupabaseReady();
    const {data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    const session=data?.session;
    if(!session?.access_token||!session?.user)return {authorized:false,user:null};
    let res;
    try{
      res=await fetch(ADMIN_AUTH_URL,{method:"GET",headers:{Authorization:`Bearer ${session.access_token}`,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(8000)});
    }catch(err){throw new Error("Could not verify owner access. Please try again.")}
    let payload={};try{payload=await res.json()}catch{}
    if(!res.ok||payload?.authorized!==true)return {authorized:false,user:session.user};
    return {authorized:true,user:session.user};
  }

  function removeGate(){
    $("printbookAdminGate")?.remove();
    document.body.classList.remove("admin-auth-locked");
  }

  function showGate(message="Sign in with the PrintBook owner account."){
    document.body.classList.add("admin-auth-locked");
    let gate=$("printbookAdminGate");
    if(!gate){
      gate=document.createElement("div");gate.id="printbookAdminGate";gate.className="printbook-admin-gate";
      gate.innerHTML=`<div class="printbook-admin-login-card"><div class="printbook-admin-mark">KP</div><p>PRINTBOOK</p><h1>Owner Login</h1><span id="printbookAdminGateMessage"></span><label>Email<input id="printbookAdminEmail" type="email" autocomplete="username" placeholder="Owner email"></label><label>Password<input id="printbookAdminPassword" type="password" autocomplete="current-password" placeholder="Password"></label><button id="printbookAdminLoginBtn" type="button">Sign in to PrintBook</button><a href="./">← Back to store</a></div>`;
      document.body.appendChild(gate);
      $("printbookAdminLoginBtn").onclick=adminGateLogin;
      $("printbookAdminPassword").addEventListener("keydown",e=>{if(e.key==="Enter")adminGateLogin()});
    }
    $("printbookAdminGateMessage").textContent=message;
    setTimeout(()=>$("printbookAdminEmail")?.focus(),50);
  }

  async function unlockAdmin(user){
    currentUser=user;
    if(typeof deactivatePublicVisitorMode==="function")deactivatePublicVisitorMode();
    customerMode=false;
    publicVisitorMode=false;
    document.body.classList.remove("public-visitor");
    if(typeof updateCloudUI==="function")updateCloudUI();
    if(typeof startRealtime==="function")startRealtime();
    removeGate();
    if(typeof renderAll==="function")renderAll();
    setTimeout(()=>{if(typeof pullCloud==="function")pullCloud(false).catch(()=>{})},0);
  }

  async function rejectUnauthorized(user){
    try{if(supabaseClient)await supabaseClient.auth.signOut()}catch{}
    currentUser=null;
    if(typeof stopRealtime==="function")stopRealtime();
    showGate(user?"That account is valid, but it is not authorized to access this PrintBook admin.":"Sign in with the PrintBook owner account.");
  }

  async function adminGateLogin(){
    if(gateBusy)return;
    const email=$("printbookAdminEmail")?.value.trim()||"";
    const password=$("printbookAdminPassword")?.value||"";
    if(!email||!password){showGate("Enter the owner email and password.");return}
    gateBusy=true;
    const btn=$("printbookAdminLoginBtn"),old=btn?.textContent||"Sign in to PrintBook";
    if(btn){btn.disabled=true;btn.textContent="Verifying owner…"}
    try{
      await ensureSupabaseReady();
      const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error)throw error;
      if(!data?.user)throw new Error("Sign-in did not return a user.");
      const check=await authorizeSession();
      if(!check.authorized){await rejectUnauthorized(data.user);return}
      await unlockAdmin(check.user||data.user);
      if(typeof toast==="function")toast("Owner access verified");
    }catch(err){
      console.error("Owner gate login failed",err);
      showGate(err?.message||"Could not sign in.");
    }finally{
      gateBusy=false;
      if(btn&&document.body.contains(btn)){btn.disabled=false;btn.textContent=old}
    }
  }

  // Production signup is intentionally disabled. New Supabase users are not PrintBook admins.
  try{signUp=function(){toast("Account creation is disabled on this store.")}}catch{}
  hideSignup();

  // The normal storefront does not expose an owner-login path.
  if(!adminRoute){
    try{openOwnerLogin=function(){}}catch{}
    document.addEventListener("click",event=>{
      if(event.target?.closest?.("#brandOwnerTrigger,#ownerLoginBtn,#signUpBtn")){
        event.preventDefault();event.stopImmediatePropagation();
      }
    },true);
    setTimeout(()=>{
      hideSignup();
      if(typeof activatePublicVisitorMode==="function")activatePublicVisitorMode().catch(()=>{});
    },0);
  }else{
    // Keep every admin surface covered until the server confirms the session belongs to the owner.
    document.body.classList.add("admin-auth-locked");
    showGate("Checking owner access…");
    setTimeout(async()=>{
      try{
        const check=await authorizeSession();
        if(check.authorized)await unlockAdmin(check.user);
        else await rejectUnauthorized(check.user);
      }catch(err){
        console.error("Owner session verification failed",err);
        showGate(err?.message||"Could not verify owner access.");
      }
    },0);
  }

  const style=document.createElement("style");
  style.textContent=`
    body.admin-auth-locked>.app-shell{visibility:hidden!important;pointer-events:none!important}.printbook-admin-gate{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 50% 15%,rgba(139,92,246,.15),transparent 40%),#0b0910;color:#f7f3fb;font-family:inherit}.printbook-admin-login-card{width:min(100%,390px);padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:#14101b;box-shadow:0 24px 80px rgba(0,0,0,.45)}.printbook-admin-mark{display:grid;place-items:center;width:54px;height:54px;margin-bottom:18px;border-radius:16px;background:#8b5cf6;font-weight:950;font-size:1.05rem}.printbook-admin-login-card>p{margin:0 0 5px;color:#a78bfa;font-size:.68rem;font-weight:950;letter-spacing:.16em}.printbook-admin-login-card h1{margin:0 0 8px;font-size:1.7rem}.printbook-admin-login-card>span{display:block;min-height:36px;margin-bottom:17px;color:#aaa2b2;font-size:.82rem;line-height:1.45}.printbook-admin-login-card label{display:block;margin:11px 0;color:#cfc7d8;font-size:.74rem;font-weight:800}.printbook-admin-login-card input{box-sizing:border-box;width:100%;margin-top:6px;padding:12px 13px;border:1px solid rgba(255,255,255,.11);border-radius:11px;background:#0d0a12;color:#fff;font:inherit;outline:none}.printbook-admin-login-card input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.13)}.printbook-admin-login-card button{width:100%;min-height:46px;margin-top:9px;border:0;border-radius:12px;background:#8b5cf6;color:#fff;font:inherit;font-weight:900;cursor:pointer}.printbook-admin-login-card button:disabled{opacity:.6}.printbook-admin-login-card a{display:block;margin-top:15px;text-align:center;color:#aaa2b2;font-size:.78rem;text-decoration:none}
  `;
  document.head.appendChild(style);
  window.PRINTBOOK_BUILD="5.23.0";
})();
