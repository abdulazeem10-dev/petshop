const $ = s => document.querySelector(s);

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const inr = n =>
  '₹' + Number(n || 0).toLocaleString('en-IN');


// ============================================================
// STAR PETS BACKEND
// ============================================================

const API_BASE = 'http://44.205.21.20:3000';


// ============================================================
// CART
// ============================================================

const cart = {
  get() {
    try {
      return JSON.parse(localStorage.getItem('sp_cart')) || [];
    } catch {
      return [];
    }
  },

  set(c) {
    try {
      localStorage.setItem('sp_cart', JSON.stringify(c));
    } catch {}

    if ($('#cnt')) {
      $('#cnt').textContent = c.reduce(
        (n, i) => n + i.qty,
        0
      );
    }
  },

  total() {
    return this.get().reduce(
      (s, i) => s + i.price * i.qty,
      0
    );
  }
};


// ============================================================
// TOAST
// ============================================================

function toast(t) {
  const e = $('#toast');

  if (!e) return;

  e.textContent = t;
  e.classList.add('on');

  clearTimeout(toast.t);

  toast.t = setTimeout(
    () => e.classList.remove('on'),
    1800
  );
}


// ============================================================
// POST REQUEST
// ============================================================

async function post(path, body) {
  const r = await fetch(
    API_BASE + path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );

  const d =
    await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(
      d.error || 'Something went wrong'
    );
  }

  return d;
}


// ============================================================
// HEADER
// ============================================================

if ($('#top')) {
  $('#top').innerHTML = `
    <a class="brand" href="/">
      <span
        class="mark"
        role="img"
        aria-label="Star Pets logo">
      </span>

      <span>
        Star <i>Pets</i>
      </span>
    </a>

    <nav>
      <a href="/#products">Shop</a>
      <a href="dog.html">Dog</a>
      <a href="cat.html">Cat</a>
      <a href="about.html">About us</a>

      <a href="cart.html">
        Cart <b id="cnt">0</b>
      </a>
    </nav>
  `;
}


// ============================================================
// FOOTER
// ============================================================

if ($('#foot')) {
  $('#foot').innerHTML = `
    <span>© Star Pets</span>
    <a href="admin.html">Admin login</a>
  `;
}


// ============================================================
// TOAST ELEMENT
// ============================================================

document.body.insertAdjacentHTML(
  'beforeend',
  '<div id="toast" role="status"></div>'
);

cart.set(cart.get());


// ============================================================
// SHOP
// ============================================================

async function pShop() {
  const g = $('#grid');

  let all = [];

  const cat =
    document.body.dataset.cat || 'All';


  // Get products from EC2 backend
  try {
    const r = await fetch(
      API_BASE + '/api/products'
    );

    if (!r.ok) {
      throw new Error(
        'Products request failed'
      );
    }

    all = await r.json();

  } catch {
    g.innerHTML = `
      <p class="err">
        Products could not load.
        Refresh to try again.
      </p>
    `;

    return;
  }


  // Filter products by category
  const catList = all.filter(
    p => cat === 'All' || p.category === cat
  );


  const state = {
    brand: new Set(),
    breed: new Set(),
    age: new Set(),
    avail: new Set(),
    min: null,
    max: null
  };


  const uniq = key =>
    [
      ...new Set(
        catList
          .map(p => p[key])
          .filter(
            v =>
              v !== undefined &&
              v !== null &&
              v !== ''
          )
      )
    ];


  const count = (key, val) =>
    catList.filter(
      p => p[key] === val
    ).length;


  const ageLabel = a =>
    a <= 1
      ? '1 Year Or Less'
      : `${a} Years`;


  const prices = catList
    .map(p => Number(p.price))
    .filter(n => !isNaN(n));


  const priceMin =
    prices.length
      ? Math.min(...prices)
      : 0;


  const priceMax =
    prices.length
      ? Math.max(...prices)
      : 0;


  // ==========================================================
  // CHECKLIST
  // ==========================================================

  const checklist = (
    title,
    key,
    opts,
    labelFn = v => v
  ) => {
    if (!opts.length) return '';

    return `
      <details open>
        <summary>
          ${esc(title)}
        </summary>

        ${opts.map(v => `
          <label class="opt">
            <span>
              <input
                type="checkbox"
                data-facet="${key}"
                value="${esc(v)}">

              ${esc(labelFn(v))}
            </span>

            <span>
              ${count(key, v)}
            </span>
          </label>
        `).join('')}
      </details>
    `;
  };


  // ==========================================================
  // FILTERS
  // ==========================================================

  const drawFilters = () => {
    $('#filters').innerHTML = `
      <details open>
        <summary>
          Price
        </summary>

        <div class="price-row">
          <input
            type="number"
            id="pmin"
            placeholder="${priceMin}">

          to

          <input
            type="number"
            id="pmax"
            placeholder="${priceMax}">
        </div>
      </details>

      ${checklist(
        'Brand',
        'brand',
        uniq('brand')
      )}

      ${checklist(
        'Availability',
        'stock',
        [1, 0],
        v => v
          ? 'In Stock'
          : 'Out Of Stock'
      )
        .replace(
          /data-facet="stock" value="1"/,
          'data-facet="avail" value="in"'
        )
        .replace(
          /data-facet="stock" value="0"/,
          'data-facet="avail" value="out"'
        )}

      ${checklist(
        'Breed',
        'breed',
        uniq('breed')
      )}

      ${checklist(
        'Age',
        'age',
        uniq('age').sort(
          (a, b) => a - b
        ),
        ageLabel
      )}
    `;


    $('#pmin').oninput = e => {
      state.min =
        e.target.value === ''
          ? null
          : Number(e.target.value);

      draw();
    };


    $('#pmax').oninput = e => {
      state.max =
        e.target.value === ''
          ? null
          : Number(e.target.value);

      draw();
    };


    $('#filters')
      .querySelectorAll(
        'input[data-facet]'
      )
      .forEach(cb => {
        cb.onchange = e => {
          const set =
            state[
              e.target.dataset.facet
            ];

          e.target.checked
            ? set.add(e.target.value)
            : set.delete(e.target.value);

          draw();
        };
      });
  };


  // ==========================================================
  // DRAW PRODUCTS
  // ==========================================================

  const draw = () => {
    const list =
      catList.filter(p => {

        if (
          state.min !== null &&
          Number(p.price) < state.min
        ) {
          return false;
        }


        if (
          state.max !== null &&
          Number(p.price) > state.max
        ) {
          return false;
        }


        if (
          state.brand.size &&
          !state.brand.has(
            String(p.brand)
          )
        ) {
          return false;
        }


        if (
          state.breed.size &&
          !state.breed.has(
            String(p.breed)
          )
        ) {
          return false;
        }


        if (
          state.age.size &&
          !state.age.has(
            String(p.age)
          )
        ) {
          return false;
        }


        if (state.avail.size) {
          const bucket =
            p.stock > 0
              ? 'in'
              : 'out';

          if (
            !state.avail.has(bucket)
          ) {
            return false;
          }
        }


        return true;
      });


    g.innerHTML = list.length

      ? list.map(p => `
          <article class="card">

            <div
              class="pic ${esc(p.category)}">

              ${
                /^(https?:)?\/\//.test(
                  p.image || ''
                )

                  ? `
                    <img
                      src="${esc(p.image)}"
                      alt=""
                      loading="lazy">
                  `

                  : esc(
                      p.name
                        ? p.name[0]
                        : ''
                    )
              }

            </div>


            <div class="body">

              <h3>
                ${esc(p.name)}
              </h3>

              <p>
                ${esc(p.description)}
              </p>


              <div class="row">

                <b>
                  ${inr(p.price)}
                </b>


                <button
                  data-id="${p._id}"
                  ${p.stock < 1 ? 'disabled' : ''}>

                  ${
                    p.stock < 1
                      ? 'Sold out'
                      : 'Add to cart'
                  }

                </button>

              </div>

            </div>

          </article>
        `).join('')

      : `
          <p>
            No products match these filters.
          </p>
        `;
  };


  // ==========================================================
  // ADD TO CART
  // ==========================================================

  g.onclick = e => {
    const id =
      e.target.dataset.id;

    if (!id) return;


    const p =
      all.find(
        x => x._id === id
      );

    if (!p) return;


    const c = cart.get();


    const i =
      c.find(
        x => x.id === id
      );


    if (
      i &&
      i.qty >= p.stock
    ) {
      return toast(
        'That is all we have in stock'
      );
    }


    i
      ? i.qty++
      : c.push({
          id,
          name: p.name,
          price: p.price,
          qty: 1
        });


    cart.set(c);

    toast('Added to cart');
  };


  drawFilters();

  draw();
}


// ============================================================
// CART PAGE
// ============================================================

function pCart() {
  const box = $('#lines');
  const sum = $('#sum');


  const draw = () => {
    const c = cart.get();


    if (!c.length) {
      box.innerHTML = `
        <p>
          Your cart is empty.
        </p>

        <a
          class="btn"
          href="/#products">
          Browse products
        </a>
      `;

      sum.innerHTML = '';

      return;
    }


    box.innerHTML = c.map(
      (i, n) => `
        <div class="line">

          <div>
            <b>
              ${esc(i.name)}
            </b>

            <br>

            ${inr(i.price)}
          </div>


          <div>

            <button
              class="alt"
              data-a="-"
              data-n="${n}"
              aria-label="Decrease quantity">
              −
            </button>

            <b>
              ${i.qty}
            </b>

            <button
              class="alt"
              data-a="+"
              data-n="${n}"
              aria-label="Increase quantity">
              +
            </button>

          </div>


          <div>

            <b>
              ${inr(
                i.price * i.qty
              )}
            </b>

            <button
              class="alt"
              data-a="x"
              data-n="${n}">
              Remove
            </button>

          </div>

        </div>
      `
    ).join('');


    sum.innerHTML = `
      <p class="row">

        <span>
          Total
        </span>

        <b>
          ${inr(cart.total())}
        </b>

      </p>

      <a
        class="btn"
        href="checkout.html">
        Go to checkout
      </a>
    `;
  };


  box.onclick = e => {
    const {
      a,
      n
    } = e.target.dataset;

    if (!a) return;


    const c = cart.get();


    if (
      a === 'x' ||
      (
        a === '-' &&
        c[n].qty === 1
      )
    ) {
      c.splice(n, 1);
    } else {
      c[n].qty +=
        a === '+'
          ? 1
          : -1;
    }


    cart.set(c);

    draw();
  };


  draw();
}


// ============================================================
// CHECKOUT
// ============================================================

function pCheckout() {
  const f = $('#f');

  const c = cart.get();

  const v = n =>
    f.elements[n].value.trim();


  if (!c.length) {
    location.replace(
      'cart.html'
    );

    return;
  }


  $('#tot').textContent =
    inr(cart.total());


  // Payment method UI
  const sync = () => {
    const m = v('pay');

    $('#upi').hidden =
      m !== 'upi';

    $('#card').hidden =
      m !== 'card';

    $('#go').textContent =
      m === 'cod'
        ? 'Place order'
        : 'Pay ' + inr(cart.total());
  };


  f.addEventListener(
    'change',
    sync
  );

  sync();


  // Submit order
  f.onsubmit = async e => {
    e.preventDefault();


    const err = $('#err');

    const m = v('pay');

    err.textContent = '';


    // UPI validation
    if (
      m === 'upi' &&
      !/^[\w.-]{2,}@[a-z]{2,}$/i.test(
        v('upi')
      )
    ) {
      return err.textContent =
        'Enter a valid UPI ID, like name@bank';
    }


    // Card validation
    if (
      m === 'card' &&
      !(
        /^\d{12,19}$/.test(
          v('cn').replace(/\s/g, '')
        )

        &&

        /^(0[1-9]|1[0-2])\/\d{2}$/.test(
          v('exp')
        )

        &&

        /^\d{3,4}$/.test(
          v('cvv')
        )
      )
    ) {
      return err.textContent =
        'Check your card number, expiry (MM/YY) and CVV';
    }


    $('#go').disabled = true;


    const name =
      v('fullname');


    try {

      // Create order
      const o = await post(
        '/api/orders',
        {
          items: c.map(
            i => ({
              id: i.id,
              qty: i.qty
            })
          ),

          customer: {
            name,
            phone: v('phone'),
            address: v('address')
          },

          paymentMethod: m
        }
      );


      // Mark payment
      const p = await post(
        `/api/orders/${o.orderId}/pay`,
        {}
      );


      // Clear cart
      cart.set([]);


      $('main').className = '';

      $('main').style.maxWidth =
        '640px';


      $('main').innerHTML = `
        <div
          class="panel"
          style="margin-top:2rem">

          <h1>
            Order placed
          </h1>

          <p>
            Thank you,
            ${esc(name)}.

            Your order

            <b>
              #${esc(
                String(o.orderId)
                  .slice(-6)
                  .toUpperCase()
              )}
            </b>

            for

            ${inr(o.total)}

            is confirmed.

            ${
              p.paymentStatus === 'paid'
                ? 'Payment received.'
                : 'Pay when it arrives.'
            }
          </p>


          <a
            class="btn"
            href="/">
            Keep shopping
          </a>

        </div>
      `;


    } catch (x) {

      err.textContent =
        x.message;

      $('#go').disabled = false;

    }

  };
}


// ============================================================
// PAGE ROUTER
// ============================================================

({
  shop: pShop,
  cart: pCart,
  checkout: pCheckout
})[
  document.body.dataset.page
]?.();