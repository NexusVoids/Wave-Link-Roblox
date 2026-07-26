/*
  WaveLink — Communities page
  ---------------------------------------------------------------
  Uses window.WaveLinkSession (set by app-shell.js) for the session
  token, calls the Worker's /api/groups to list the user's Roblox
  groups (with icons + rank), and lets group OWNERS create a WaveLink
  community for a group that doesn't have one yet.

  SETUP REQUIRED: set WORKER_URL to your deployed Worker's base URL.
*/
(function(){
  "use strict";

  var WORKER_URL = "https://wavelink-verify.YOUR-SUBDOMAIN.workers.dev";

  var session = window.WaveLinkSession;
  if (!session) return;

  var container = document.getElementById('groupsContainer');
  if (!container) return;

  function escapeHtml(str){
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderLoading(){
    container.innerHTML =
      '<div class="loading-state"><div class="spinner" aria-hidden="true"></div>Loading your Roblox groups…</div>';
  }

  function renderError(message){
    container.innerHTML = '<div class="error-state">' + escapeHtml(message) + '</div>';
  }

  function renderGroups(groups){
    if (!groups.length){
      container.innerHTML = '<div class="empty-state">You\'re not in any Roblox groups yet.</div>';
      return;
    }

    var html = '<div class="groups-list">';
    groups.forEach(function(g){
      var iconHtml = g.iconUrl
        ? '<img class="group-icon" src="' + escapeHtml(g.iconUrl) + '" alt="">'
        : '<div class="group-icon placeholder"><svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.7"/></svg></div>';

      var actionHtml;
      if (g.community){
        actionHtml = '<a href="#" class="btn btn-primary" data-community-id="' + escapeHtml(g.community.id) + '">Open Community</a>';
      } else if (g.isOwner){
        actionHtml = '<button class="btn btn-primary" data-create-group="' + escapeHtml(g.groupId) + '" type="button">Create Community</button>';
      } else {
        actionHtml = '<span style="font-size:12.5px; color: var(--text-faint);">No community yet</span>';
      }

      html +=
        '<div class="group-card">' +
          iconHtml +
          '<div class="group-info">' +
            '<div class="name">' + escapeHtml(g.groupName) + '</div>' +
            '<div class="meta">' +
              '<span>' + escapeHtml(g.roleName) + '</span>' +
              '<span class="dot"></span>' +
              '<span>' + g.memberCount.toLocaleString() + ' members</span>' +
              (g.isOwner ? '<span class="owner-tag">Owner</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="group-actions">' + actionHtml + '</div>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-create-group]').forEach(function(btn){
      btn.addEventListener('click', function(){ createCommunity(btn.getAttribute('data-create-group'), btn); });
    });
  }

  async function createCommunity(groupId, btn){
    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = 'Creating…';

    try{
      var res = await fetch(WORKER_URL + '/api/communities/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.sessionToken
        },
        body: JSON.stringify({ groupId: groupId })
      });
      var data = await res.json();

      if (!res.ok){
        btn.disabled = false;
        btn.textContent = originalText;
        alert(data.error || 'Could not create the community.');
        return;
      }

      loadGroups(); // refresh the list so this group now shows "Open Community"
    } catch(e){
      btn.disabled = false;
      btn.textContent = originalText;
      alert('Network error — please try again.');
    }
  }

  async function loadGroups(){
    renderLoading();
    try{
      var res = await fetch(WORKER_URL + '/api/groups', {
        headers: { 'Authorization': 'Bearer ' + session.sessionToken }
      });
      if (res.status === 401){
        try{ localStorage.removeItem('wavelink_demo_session'); } catch(e){}
        window.location.href = 'login.html';
        return;
      }
      if (!res.ok) throw new Error('bad response');
      var data = await res.json();
      renderGroups(data.groups || []);
    } catch(e){
      renderError("Couldn't load your Roblox groups. Please try again shortly.");
    }
  }

  loadGroups();
})();
