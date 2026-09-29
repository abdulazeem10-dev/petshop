// auth-nav.js — adds Log in / Sign up (or "Hi, name" + Log out) to your header.
// Add before </body> on any page: <script src="js/auth-nav.js"></script>

(function () {

  // ============================================================
  // STAR PETS BACKEND
  // ============================================================

  var API_BASE = 'http://44.205.21.20:3000';


  // ============================================================
  // STYLES
  // ============================================================

  var css = document.createElement('style');

  css.textContent =
    '.sp-auth{display:flex;align-items:center;gap:.5rem;margin-left:auto;font-family:inherit}' +
    '.sp-auth a,.sp-auth button{font:inherit;font-size:.92rem;padding:.45rem .9rem;border-radius:999px;text-decoration:none;cursor:pointer;border:1px solid #2c8c86;color:inherit;background:transparent}' +
    '.sp-auth .sp-solid{background:#2c8c86;color:#fff;font-weight:700}' +
    '.sp-auth .sp-hi{border:0;padding:0 .3rem;cursor:default}' +
    '.sp-fixed{position:fixed;top:.8rem;right:.8rem;z-index:50;background:#fff;color:#1c3557;padding:.4rem;border-radius:999px;box-shadow:0 2px 10px rgba(28,53,87,.2)}' +
    '@media(max-width:560px){.sp-auth .sp-hi{display:none}}';

  document.head.appendChild(css);


  // ============================================================
  // AUTH CONTAINER
  // ============================================================

  var box = document.createElement('div');

  box.className = 'sp-auth';


  var header =
    document.querySelector('header');


  if (header) {

    header.appendChild(box);


    // Your app.js draws the header;
    // put the buttons back if it redraws it.

    new MutationObserver(function () {

      if (!header.contains(box)) {
        header.appendChild(box);
      }

    }).observe(
      header,
      {
        childList: true
      }
    );

  }

  else {

    box.classList.add('sp-fixed');

    document.body.appendChild(box);

  }


  // ============================================================
  // ESCAPE HTML
  // ============================================================

  function esc(s) {

    return String(s).replace(
      /[&<>"']/g,
      function (c) {

        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[c];

      }
    );

  }


  // ============================================================
  // LOGGED OUT
  // ============================================================

  function loggedOut() {

    var next =
      encodeURIComponent(
        location.pathname +
        location.search
      );


    box.innerHTML =

      '<a href="login.html?next=' +
      next +
      '">Log in</a>' +

      '<a class="sp-solid" href="login.html?next=' +
      next +
      '#register">Sign up</a>';

  }


  // ============================================================
  // LOGGED IN
  // ============================================================

  function loggedIn(user) {

    var first =
      esc(
        (user.name || 'there')
          .split(' ')[0]
      );


    box.innerHTML =

      '<span class="sp-hi">' +
      'Hi, ' +
      first +
      '</span>' +

      '<button type="button">' +
      'Log out' +
      '</button>';


    box
      .querySelector('button')
      .onclick = function () {

        localStorage.removeItem(
          'sp_user_token'
        );

        localStorage.removeItem(
          'sp_user'
        );

        loggedOut();

      };

  }


  // ============================================================
  // CHECK TOKEN
  // ============================================================

  var token =
    localStorage.getItem(
      'sp_user_token'
    );


  if (!token) {

    return loggedOut();

  }


  // ============================================================
  // SHOW SAVED USER IMMEDIATELY
  // ============================================================

  try {

    loggedIn(
      JSON.parse(
        localStorage.getItem(
          'sp_user'
        ) || '{}'
      )
    );

  }

  catch (e) {

    loggedOut();

  }


  // ============================================================
  // VERIFY TOKEN WITH EC2 BACKEND
  // ============================================================

  fetch(
    API_BASE + '/api/auth/me',
    {
      headers: {
        Authorization:
          'Bearer ' + token
      }
    }
  )

    .then(function (r) {

      if (r.status === 401) {
        throw new Error('expired');
      }

      return r.ok
        ? r.json()
        : null;

    })

    .then(function (u) {

      if (u) {
        loggedIn(u);
      }

    })

    .catch(function () {

      localStorage.removeItem(
        'sp_user_token'
      );

      localStorage.removeItem(
        'sp_user'
      );

      loggedOut();

    });

})();