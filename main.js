(function(){
  "use strict";

  /* ---------- Navbar scroll state ---------- */
  var navbar = document.getElementById('navbar');
  var onScroll = function(){
    if (window.scrollY > 12) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav toggle ---------- */
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  toggle.addEventListener('click', function(){
    var open = links.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  links.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(){
      links.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Reveal on scroll ---------- */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting){
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('in'); });
  }

  /* ---------- Feature card cursor-glow ---------- */
  document.querySelectorAll('.feature-card').forEach(function(card){
    card.addEventListener('mousemove', function(e){
      var rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - rect.top) / rect.height * 100) + '%');
    });
  });

  /* ---------- Ambient floating particles ---------- */
  if (!reduceMotion){
    var field = document.getElementById('particles');
    var count = window.innerWidth < 720 ? 14 : 28;
    for (var i = 0; i < count; i++){
      var p = document.createElement('div');
      p.className = 'particle';
      var size = (Math.random() * 2.4 + 1).toFixed(1);
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (60 + Math.random() * 40) + '%';
      p.style.setProperty('--drift', (Math.random() * 80 - 40).toFixed(0) + 'px');
      p.style.animationDuration = (10 + Math.random() * 14).toFixed(1) + 's';
      p.style.animationDelay = '-' + (Math.random() * 20).toFixed(1) + 's';
      field.appendChild(p);
    }
  }

  /* ---------- Smooth-scroll for in-page anchors ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (target){
        e.preventDefault();
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    });
  });

  /* ---------- Demo auth-state (front-end only — see login.html for notes
     on wiring this to a real Roblox OAuth backend) ---------- */
  var navAuthBtn = document.getElementById('navAuthBtn');
  if (navAuthBtn){
    try{
      var session = JSON.parse(localStorage.getItem('wavelink_demo_session') || 'null');
      if (session && session.robloxUsername){
        navAuthBtn.textContent = 'Dashboard';
        navAuthBtn.href = 'dashboard.html';
      }
    } catch(e){ /* localStorage unavailable — leave default Login button */ }
  }
})();