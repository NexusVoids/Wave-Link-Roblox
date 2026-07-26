/*
  WaveLink — shared logged-in app shell
  ---------------------------------------------------------------
  Used by every page behind login (dashboard.html, communities.html, ...).
  Guards the route, exposes the session as window.WaveLinkSession, and
  wires up the parts every one of those pages has in common: the
  sidebar user card, the logout button, and the mobile menu toggle.

  Include this AFTER main.js and BEFORE the page's own script, e.g.:
    <script src="main.js" defer></script>
    <script src="app-shell.js" defer></script>
    <script src="communities.js" defer></script>
  (defer scripts run in document order, so communities.js can safely
  read window.WaveLinkSession as soon as it starts.)
*/
(function(){
  "use strict";

  var session = null;
  try{
    session = JSON.parse(localStorage.getItem('wavelink_demo_session') || 'null');
  } catch(e){ /* localStorage unavailable */ }

  if (!session || !session.robloxUsername){
    window.location.href = 'login.html';
    return;
  }

  window.WaveLinkSession = session;

  var displayName = session.robloxDisplayName || session.robloxUsername;

  var sidebarUsername = document.getElementById('sidebarUsername');
  if (sidebarUsername) sidebarUsername.textContent = displayName;

  var sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarAvatar && session.avatarUrl){
    sidebarAvatar.innerHTML = '';
    var img = document.createElement('img');
    img.src = session.avatarUrl;
    img.alt = displayName;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = 'inherit';
    sidebarAvatar.appendChild(img);
  }

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn){
    logoutBtn.addEventListener('click', function(){
      try{ localStorage.removeItem('wavelink_demo_session'); } catch(e){}
      window.location.href = 'index.html';
    });
  }

  var sidebar = document.getElementById('appSidebar');
  var menuBtn = document.getElementById('mobileMenuBtn');
  var scrim = document.getElementById('sidebarScrim');
  function closeSidebar(){ sidebar.classList.remove('open'); scrim.classList.remove('open'); }
  if (menuBtn){
    menuBtn.addEventListener('click', function(){
      sidebar.classList.add('open');
      scrim.classList.add('open');
    });
  }
  if (scrim) scrim.addEventListener('click', closeSidebar);
})();
