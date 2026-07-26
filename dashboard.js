/*
  WaveLink — dashboard page content
  ---------------------------------------------------------------
  Auth guard, sidebar user info, logout, and mobile menu now live in
  app-shell.js (shared with communities.html and any future page).
  This file only fills in content specific to the dashboard itself.
*/
(function(){
  "use strict";

  var session = window.WaveLinkSession;
  if (!session) return; // app-shell.js already redirected to login if missing

  var displayName = session.robloxDisplayName || session.robloxUsername;

  var verifyUsername = document.getElementById('verifyUsername');
  if (verifyUsername) verifyUsername.textContent = displayName;

  var verifyAvatar = document.getElementById('verifyAvatar');
  if (verifyAvatar && session.avatarUrl){
    verifyAvatar.innerHTML = '';
    var img = document.createElement('img');
    img.src = session.avatarUrl;
    img.alt = displayName;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = 'inherit';
    verifyAvatar.appendChild(img);
  }

  var welcomeHeading = document.getElementById('welcomeHeading');
  if (welcomeHeading) welcomeHeading.textContent = 'Welcome back, ' + displayName;

  var activityUsername = document.getElementById('activityUsername');
  if (activityUsername) activityUsername.textContent = displayName;

  var verifyTimestamp = document.getElementById('verifyTimestamp');
  if (verifyTimestamp && session.connectedAt){
    try{
      var d = new Date(session.connectedAt);
      verifyTimestamp.textContent = 'connected ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch(e){}
  }
})();
