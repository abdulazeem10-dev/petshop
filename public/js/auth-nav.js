// auth-nav.js — adds Log in / Sign up (or "Hi, name" + Log out) to your header.
// Add before </body> on any page:  <script src="js/auth-nav.js"></script>
(function () {
  var css = document.createElement('style');
  css.textContent =
    '.sp-auth{display:flex;align-items:center;gap:.5rem;margin-left:auto;font-family:inherit}' +
    '.sp-auth a,.sp-auth button{font:inherit;font-size:.92rem;padding:.45rem .9rem;border-radius:999px;text-decoration:none;cursor:pointer;border:1px solid #2c8c86;color:inherit;background:transparent}' +
    '.sp-auth .sp-solid{background:#2c8c86;color:#fff;font-weight:700}' +
    '.sp-auth .sp-hi{border:0;padding:0 .3rem;cursor:default}' +
    '.sp-fixed{position:fixed;top:.8rem;right:.8rem;z-index:50;background:#fff;color:#1c3557;padding:.4rem;border-radius:999px;box-shadow:0 2px 10px rgba(28,53,87,.2)}' +
    '@media(max-width:560px){.sp-auth .sp-hi{display:none}}';
  document.head.appendChild(css);

  var box = document.createElement('div');
  box.className = 'sp-auth';

  var header = document.querySelector('header');
  if (header) {
    header.appendChild(box);
    // your app.js draws the header; put the buttons back if it redraws it
    new MutationObserver(function () {
      if (!header.contains(box)) header.appendChild(box);
    }).observe(header, { childList: true });
  }
  else { box.classList.add('sp-fixed'); document.body.appendChild(box); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loggedOut() {
    var next = encodeURIComponent(location.pathname + location.search);
    box.innerHTML =
      '<a href="login.html?next=' + next + '">Log in</a>' +
      '<a class="sp-solid" href="login.html?next=' + next + '#register">Sign up</a>';
  }

  function loggedIn(user) {
    var first = esc((user.name || 'there').split(' ')[0]);
    box.innerHTML = '<span class="sp-hi">Hi, ' + first + '</span><button type="button">Log out</button>';
    box.querySelector('button').onclick = function () {
      localStorage.removeItem('sp_user_token');
      localStorage.removeItem('sp_user');
      loggedOut();
    };
  }

  var token = localStorage.getItem('sp_user_token');
  if (!token) return loggedOut();

  // Show the saved name right away, then confirm the token is still valid
  try { loggedIn(JSON.parse(localStorage.getItem('sp_user') || '{}')); } catch (e) { loggedOut(); }

  fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (r) {
      if (r.status === 401) throw new Error('expired');
      return r.ok ? r.json() : null;
    })
    .then(function (u) { if (u) loggedIn(u); })
    .catch(function () {
      localStorage.removeItem('sp_user_token');
      localStorage.removeItem('sp_user');
      loggedOut();
    });
})();
