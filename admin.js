// admin.js — Star Pets admin API
// npm i express mongoose bcryptjs jsonwebtoken
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { Schema, model, models } = mongoose;

// If you already have Product/Order models, these are skipped and yours are used.
const Admin = models.Admin || model('Admin', new Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
}));

const Product = models.Product || model('Product', new Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ['Food', 'Accessories'], default: 'Food' },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  image: String,
  description: String,
  active: { type: Boolean, default: true },
}, { timestamps: true }));

const Order = models.Order || model('Order', new Schema({
  customerName: String, email: String, phone: String, address: String,
  items: [{ name: String, price: Number, qty: Number }],
  total: Number,
  status: { type: String, enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
}, { timestamps: true }));

const PRODUCT_FIELDS = ['name', 'category', 'price', 'stock', 'image', 'description', 'active'];
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
const wrap = fn => (req, res) => fn(req, res).catch(err => {
  console.error(err);
  res.status(err.name === 'ValidationError' ? 400 : 500).json({ error: err.message });
});

// Creates the first admin from .env (ADMIN_EMAIL / ADMIN_PASSWORD) if none exists
async function seedAdmin() {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: pass } = process.env;
  if (!email || !pass) return;
  if (!(await Admin.findOne({ email }))) {
    await Admin.create({ email, passwordHash: await bcrypt.hash(pass, 10) });
    console.log('Admin user created:', email);
  }
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again' });
  }
}

const router = express.Router();

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email });
  if (!admin || !(await bcrypt.compare(password || '', admin.passwordHash))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  const token = jwt.sign({ id: admin._id, email }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, email });
}));

router.use(requireAdmin); // everything below needs a valid token

router.get('/stats', wrap(async (req, res) => {
  const [products, orders, pending, revenue, lowStock] = await Promise.all([
    Product.countDocuments(),
    Order.countDocuments(),
    Order.countDocuments({ status: 'pending' }),
    Order.aggregate([{ $match: { status: { $in: ['paid', 'shipped', 'delivered'] } } }, { $group: { _id: null, sum: { $sum: '$total' } } }]),
    Product.find({ stock: { $lte: 5 } }).select('name stock').sort('stock').limit(10),
  ]);
  res.json({ products, orders, pending, revenue: revenue[0]?.sum || 0, lowStock });
}));

router.get('/products', wrap(async (req, res) => res.json(await Product.find().sort('-createdAt'))));
router.post('/products', wrap(async (req, res) => res.status(201).json(await Product.create(pick(req.body, PRODUCT_FIELDS)))));
router.put('/products/:id', wrap(async (req, res) => {
  const p = await Product.findByIdAndUpdate(req.params.id, pick(req.body, PRODUCT_FIELDS), { new: true, runValidators: true });
  p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
}));
router.delete('/products/:id', wrap(async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

router.get('/orders', wrap(async (req, res) => res.json(await Order.find().sort('-createdAt').limit(200))));
router.patch('/orders/:id', wrap(async (req, res) => {
  const o = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
  o ? res.json(o) : res.status(404).json({ error: 'Order not found' });
}));

module.exports = { router, seedAdmin };
