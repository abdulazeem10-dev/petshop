const $ = s => document.querySelector(s);

const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );

const inr = n => '₹' + Number(n).toLocaleString('en-IN');

const tok = () => sessionStorage.getItem('sp_admin');

const API_BASE = 'http://44.205.21.20:3000';

const F = ['name', 'category', 'price', 'stock', 'image', 'description'];

let prods = [];

async function api(u, o = {}) {
  const r = await fetch(API_BASE + u, {
    ...o,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + tok()
    }
  });

  const d = await r.json().catch(() => ({}));

  if (r.status === 401 && !u.endsWith('login')) {
    logout();
    throw new Error(d.error);
  }

  if (!r.ok) {
    throw new Error(d.error || 'Request failed');
  }

  return d;
}

const fail = x => tok() && alert(x.message);

function show() {
  const on = !!tok();

  $('#login').hidden = on;
  $('#dash').hidden = !on;
  $('#out').hidden = !on;

  if (on) load();
}

function logout() {
  sessionStorage.removeItem('sp_admin');
  show();
}

const clr = () => {
  $('#pf').reset();
  $('#pf').elements.pid.value = '';
  $('#pfh').textContent = 'Add product';
};

async function load() {
  try {
    prods = await api('/api/products');

    $('#pt').innerHTML =
      '<tr><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>' +
      prods
        .map(
          (p, i) =>
            `<tr>
              <td>
                ${esc(p.name)}<br>
                <small>${esc(p.category)}</small>
              </td>
              <td>${inr(p.price)}</td>
              <td>${p.stock}</td>
              <td>
                <button class="alt" data-e="${i}">Edit</button>
                <button class="alt" data-d="${p.id}">Delete</button>
              </td>
            </tr>`
        )
        .join('');

    const os = await api('/api/admin/orders');

    $('#ot').innerHTML =
      '<tr><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr>' +
      (os
        .map(
          o =>
            `<tr>
              <td>${new Date(o.createdAt).toLocaleString()}</td>
              <td>
                ${esc(o.customer.name)}<br>
                ${esc(o.customer.phone)}<br>
                <small>${esc(o.customer.address)}</small>
              </td>
              <td>
                ${o.items
                  .map(i => `${esc(i.name)} × ${i.qty}`)
                  .join('<br>')}
              </td>
              <td>${inr(o.total)}</td>
              <td>
                ${esc(String(o.paymentMethod).toUpperCase())}<br>
                ${esc(o.paymentStatus)}
              </td>
              <td>
                <select data-o="${o.id}">
                  ${[
                    'placed',
                    'packed',
                    'shipped',
                    'delivered',
                    'cancelled'
                  ]
                    .map(
                      s =>
                        `<option${
                          s === o.status ? ' selected' : ''
                        }>${s}</option>`
                    )
                    .join('')}
                </select>
              </td>
            </tr>`
        )
        .join('') ||
        '<tr><td colspan="6">No orders yet.</td></tr>');
  } catch (x) {
    fail(x);
  }
}

$('#out').onclick = logout;

$('#clr').onclick = clr;

$('#lf').onsubmit = async e => {
  e.preventDefault();

  $('#lerr').textContent = '';

  const f = e.target.elements;

  try {
    const d = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        email: f.email.value,
        password: f.password.value
      })
    });

    sessionStorage.setItem('sp_admin', d.token);

    e.target.reset();

    show();
  } catch (x) {
    $('#lerr').textContent = x.message;
  }
};

$('#pt').onclick = async e => {
  const { e: i, d } = e.target.dataset;
  const f = $('#pf').elements;

  if (i !== undefined) {
    const p = prods[i];

    F.forEach(k => {
      f[k].value = p[k] ?? '';
    });

    f.pid.value = p.id;

    $('#pfh').textContent = 'Edit product';
  }

  if (d && confirm('Delete this product?')) {
    try {
      await api('/api/admin/products/' + d, {
        method: 'DELETE'
      });

      load();
    } catch (x) {
      fail(x);
    }
  }
};

$('#pf').onsubmit = async e => {
  e.preventDefault();

  const f = e.target.elements;
  const body = {};
  const id = f.pid.value;

  F.forEach(k => {
    body[k] = f[k].value;
  });

  try {
    await api('/api/admin/products' + (id ? '/' + id : ''), {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });

    clr();
    load();
  } catch (x) {
    fail(x);
  }
};

$('#ot').onchange = async e => {
  if (!e.target.dataset.o) return;

  try {
    await api('/api/admin/orders/' + e.target.dataset.o, {
      method: 'PATCH',
      body: JSON.stringify({
        status: e.target.value
      })
    });
  } catch (x) {
    fail(x);
  }
};

show();