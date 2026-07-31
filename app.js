// app.js — Frontend scaffold for SanityOS: Supabase auth, simple router, and UI bindings
(function(){
  // Read Supabase settings injected via meta tags (to be replaced during deployment)
  const SUPABASE_URL = document.querySelector('meta[name="supabase-url"]').content || window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = document.querySelector('meta[name="supabase-key"]').content || window.SUPABASE_ANON_KEY;

  // Minimal runtime checks
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    console.warn('Supabase configuration missing. Set meta tags supabase-url and supabase-key');
  }

  // Load supabase-js from CDN if available (defer to hosted runtime). This is non-blocking and optional.
  async function createSupabaseClient(){
    if(window.supabase) return window.supabase;
    try{
      // Prefer @supabase/supabase-js via unpkg
      const module = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
      window.supabase = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {auth:{persistSession:false}});
      return window.supabase;
    }catch(e){
      console.warn('Could not load supabase client from CDN; UI will still render but auth will not function.');
      return null;
    }
  }

  // Public API used by pages
  window.SanityAuth = {
    async signIn({email,password}){
      const supabase = await createSupabaseClient();
      if(!supabase) return alert('Auth is unavailable in this environment.');
      const {error, data} = await supabase.auth.signInWithPassword({email, password});
      if(error) return alert(error.message);
      // Redirect on success
      window.location.href = '/dashboard.html';
    },
    async signUp({email,password,name}){
      const supabase = await createSupabaseClient();
      if(!supabase) return alert('Auth is unavailable in this environment.');
      const {data, error} = await supabase.auth.signUp({email, password, options:{data:{full_name: name}}});
      if(error) return alert(error.message);
      alert('Check your email for a verification link.');
    },
    async resetPassword(email){
      const supabase = await createSupabaseClient();
      if(!supabase) return;
      await supabase.auth.resetPasswordForEmail(email);
    },
    async signOut(){
      const supabase = await createSupabaseClient();
      if(!supabase) return (window.location.href = '/');
      await supabase.auth.signOut();
      window.location.href = '/';
    }
  };

  // Dashboard helpers — runs only when dashboard.html is open
  async function initDashboard(){
    if(!document.body.classList.contains('dashboard-shell')) return;
    const supabase = await createSupabaseClient();
    // Attempt to read session and user profile
    if(!supabase) return;

    const { data: { user } } = await supabase.auth.getUser().catch(()=>({data:{user:null}}));
    if(!user){
      // Not signed in — send to login
      window.location.href = '/login.html';
      return;
    }

    const userId = user.id;
    // Fetch profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    document.getElementById('display-name').innerText = profile?.full_name || user.email || 'User';
    document.getElementById('user-email').innerText = user.email || '';
    document.getElementById('welcome-name').innerText = profile?.full_name || '—';
    document.getElementById('credit-count').innerText = profile?.credits ?? 0;
    document.getElementById('license-key').innerText = profile?.license_key ?? 'SOS-XXXXXX-XXXXXX';

    // Recent activity — lightweight implementation
    const activityLog = document.getElementById('activity-log');
    activityLog.innerHTML = '';
    (profile?.recent_activity || []).slice(0,6).forEach(item => {
      const li = document.createElement('li'); li.innerText = item; activityLog.appendChild(li);
    });

    // Plugin telemetry — placeholder logic for when real telemetry is available
    const telemetry = document.getElementById('plugin-telemetry');
    telemetry.querySelector('.status').innerText = profile?.plugin_connected ? 'Connected' : 'Disconnected';
    telemetry.querySelector('.version').innerText = profile?.plugin_version ?? '—';
    telemetry.querySelector('.last-sync').innerText = profile?.plugin_last_sync ?? '—';
    telemetry.querySelector('.workspace').innerText = profile?.workspace_name ?? '—';
    telemetry.querySelector('.connected-since').innerText = profile?.plugin_connected_at ?? '—';

    // Save profile edits
    document.getElementById('save-profile')?.addEventListener('click', async () => {
      const name = document.getElementById('profile-name').value;
      const company = document.getElementById('profile-company').value;
      const updates = {full_name: name, company};
      const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
      if(error) return alert(error.message);
      alert('Profile updated');
    });
  }

  // Initialize on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    // Bind waitlist form (index.html)
    const waitlist = document.getElementById('waitlist-form');
    waitlist?.addEventListener('submit', e => {
      e.preventDefault();
      const email = e.target.email.value;
      // In production, send email to backend / mailing list
      alert(`Thanks! We'll notify ${email} when we launch.`);
    });

    // Prefill profile inputs if present
    const nameInput = document.getElementById('profile-name');
    if(nameInput && localStorage.getItem('profile_name')) nameInput.value = localStorage.getItem('profile_name');

    // Run dashboard init
    initDashboard();
  });
})();
