// Apply the saved theme before first paint to avoid a flash. A file (not inline) so the CSP can be script-src 'self'.
try {
  var t = localStorage.getItem('dsol-theme');
  var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
