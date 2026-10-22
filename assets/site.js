/* andromedaho.com page logic: faction switching, galaxy seed, and the privacy modal.
 * The privacy modal also works without JavaScript: /privacy/ ships it open, and CLOSE is a link to /. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  var CHANNELS = { imperium: 'IMPERIAL COMMAND', corsair: 'CORSAIR BAND', voidborn: 'VOID SIGNAL' };
  var galaxy = null;

  function setFaction(f) {
    if (!CHANNELS[f]) return;
    root.setAttribute('data-faction', f);
    document.querySelectorAll('[data-channel]').forEach(function (el) { el.textContent = '// ' + CHANNELS[f]; });
    document.querySelectorAll('.emblem').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-for') === f)); });
    if (galaxy) galaxy.setFaction(f);
  }

  // ---- Privacy modal routing: /privacy/ and #privacy open it; closing returns to / ----
  var modal = document.getElementById('privacy');
  var lastFocus = null;
  function isPrivacyUrl() { return /\/privacy\/?$/.test(location.pathname) || location.hash === '#privacy'; }
  function showModal(open) {
    if (!modal) return;
    if (open === !modal.hidden) return;
    modal.hidden = !open;
    document.body.classList.toggle('pp-open', open);
    if (open) {
      lastFocus = document.activeElement;
      var close = modal.querySelector('.pp-close');
      if (close) close.focus({ preventScroll: true });
    } else if (lastFocus && lastFocus.focus) {
      lastFocus.focus({ preventScroll: true });
    }
  }
  function openPrivacy(push) {
    if (push && !isPrivacyUrl()) history.pushState({ privacy: true }, '', '/privacy/');
    showModal(true);
  }
  function closePrivacy(push) {
    if (push && isPrivacyUrl()) history.pushState({}, '', '/');
    showModal(false);
  }

  document.addEventListener('DOMContentLoaded', function () {
    setFaction(root.getAttribute('data-faction') || 'imperium');

    var host = document.querySelector('.galaxy');
    if (host && window.AndromedaGalaxy) {
      galaxy = window.AndromedaGalaxy.start(host, document.getElementById('galaxy-gl'), document.getElementById('galaxy-overlay'),
        root.getAttribute('data-faction'));
      var seed = document.getElementById('seed');
      if (seed) seed.textContent = galaxy.seedHex();
      var reroll = document.getElementById('reroll');
      if (reroll) reroll.addEventListener('click', function () { galaxy.reroll(); seed.textContent = galaxy.seedHex(); });
    }

    document.querySelectorAll('.emblem').forEach(function (b) {
      b.addEventListener('click', function () { setFaction(b.getAttribute('data-for')); });
    });

    document.querySelectorAll('a[data-open-privacy]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); openPrivacy(true); });
    });
    if (modal) {
      modal.querySelector('.pp-close').addEventListener('click', function (e) { e.preventDefault(); closePrivacy(true); });
      modal.addEventListener('click', function (e) { if (e.target === modal) closePrivacy(true); });
      modal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closePrivacy(true); }
        if (e.key === 'Tab') { // keep focus inside the dialog
          var f = modal.querySelectorAll('a[href], button, [tabindex="0"]');
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
    }
    if (isPrivacyUrl()) showModal(true);
    window.addEventListener('popstate', function () { showModal(isPrivacyUrl()); });
  });
})();
