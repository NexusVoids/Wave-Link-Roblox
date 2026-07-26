/*
  WaveLink — Roblox OAuth login
  ---------------------------------------------------------------
  Two things happen on this page, depending on how it was loaded:

  A) Fresh visit: clicking "Continue with Roblox" sends the browser
     to the Worker's /api/oauth/start, which redirects to Roblox's
     real login/consent screen. The user never leaves Roblox's own
     domain to enter credentials.

  B) Returning from Roblox: the Worker sends the browser back here
     with either ?ticket=... (success) or ?oauth_error=... (failure).
     If there's a ticket, we fetch the real profile it points to,
     save it as the session, and go to the dashboard.

  SETUP REQUIRED: replace WORKER_URL below with your deployed Worker's
  base URL (see /wavelink-worker/SETUP.md).
*/
(function(){
  "use strict";

   var WORKER_URL = "https://wavelink-verify.waveware-wavelink.workers.dev";

  var loginBtn = document.getElementById('robloxLoginBtn');
  var errorBox = document.getElementById('authError');

  if (!loginBtn) return;

  function showError(message){
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.add('visible');
  }

  var ERROR_MESSAGES = {
    access_denied: "You cancelled the Roblox login.",
    state_expired: "That login link expired — please try again.",
    token_exchange_failed: "Roblox couldn't confirm that login — please try again.",
    userinfo_failed: "Couldn't fetch your Roblox profile — please try again.",
    missing_code_or_state: "That login link was incomplete — please try again."
  };

  async function handleReturnFromRoblox(){
    var params = new URLSearchParams(window.location.search);
    var ticket = params.get('ticket');
    var oauthError = params.get('oauth_error');

    if (oauthError){
      showError(ERROR_MESSAGES[oauthError] || "Something went wrong signing in with Roblox.");
      history.replaceState(null, '', 'login.html');
      return;
    }

    if (!ticket) return;

    loginBtn.classList.add('loading');
    loginBtn.disabled = true;
    loginBtn.querySelector('.btn-label').textContent = 'Signing you in…';

    try{
      var res = await fetch(WORKER_URL + '/api/oauth/session?ticket=' + encodeURIComponent(ticket));
      if (!res.ok) throw new Error('session fetch failed');
      var profile = await res.json();

      var session = {
        robloxUserId: profile.robloxUserId,
        robloxUsername: profile.username,
        robloxDisplayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        sessionToken: profile.sessionToken,
        connectedAt: new Date().toISOString()
      };
      try{ localStorage.setItem('wavelink_demo_session', JSON.stringify(session)); } catch(e){}

      window.location.href = 'dashboard.html';
    } catch(e){
      loginBtn.classList.remove('loading');
      loginBtn.disabled = false;
      loginBtn.querySelector('.btn-label').textContent = 'Continue with Roblox';
      showError("Couldn't complete sign-in — that link may have expired. Please try again.");
      history.replaceState(null, '', 'login.html');
    }
  }

  loginBtn.addEventListener('click', function(){
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;
    loginBtn.querySelector('.btn-label').textContent = 'Redirecting to Roblox…';
    window.location.href = WORKER_URL + '/api/oauth/start';
  });

  handleReturnFromRoblox();
})();
