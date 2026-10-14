/* Light and dark mode: follows the device unless the visitor picks one, which is remembered. */
(function () {
  'use strict';
  var KEY = 'subfinder.theme';
  var root = document.documentElement;

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function apply(theme) {
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
  }
  function current() {
    var chosen = root.getAttribute('data-theme');
    if (chosen) return chosen;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Runs in <head>, before the page draws, so there's no flash of the wrong colours
  apply(saved());

  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.querySelector('.top-inner');
    if (!bar) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    function label() {
      var dark = current() === 'dark';
      button.textContent = dark ? '☀︎ Light mode' : '☾︎ Dark mode';
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    button.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* still switches for this visit */ }
      label();
    });
    label();
    bar.appendChild(button);
  });
})();
