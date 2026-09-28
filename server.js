require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const { Product, Order, Admin } = require('./models');

const app = express();

// ==================================================
// MIDDLEWARE
// ==================================================

app.use(express.json({ limit: '100kb' }));

// Serve frontend files from /public (admin panel lives at /admin)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================================================
// MONGODB CONNECTION
// ==================================================

let mongoPromise = null;

// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if it doesn't exist yet
async function seedAdmin() {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

    const email = ADMIN_EMAIL.toLowerCase();

    if (!(await Admin.findOne({ email }))) {
        await Admin.create({
            email,
            passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10)
        });
        console.log('Admin user created:', email);
    }
}

function connectDB() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI environment variable is missing');
    }

    if (!mongoPromise) {
        mongoPromise = mongoose
            .connect(process.env.MONGO_URI)
            .then(async () => {
                console.log('MongoDB connected');
                await seedAdmin().catch((e) =>
                    console.error('Admin seed failed:', e.message)
                );
            })
            .catch((error) => {
                mongoPromise = null;
                console.error('MongoDB connection failed:', error.message);
                throw error;
            });
    }

    return mongoPromise;
}

// Connect database before API requests
app.use('/api', async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error('Database connection failed:', error.message);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// ==================================================
// ERROR WRAPPER
// ==================================================

const wrap = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((error) => {
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ error: error.message });
        }
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    });
};

// ==================================================
// AUTHENTICATION
// ==================================================

const auth = (req, res, next) => {
    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET environment variable is missing');
        return res.status(500).json({
            error: 'Server authentication is not configured'
        });
    }

    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Please log in again' });
    }
};

// ==================================================
// PRODUCT HELPER
// ==================================================

const pick = (body) => ({
    name: body.name,
    category: body.category,
    price: Number(body.price),
    stock: Number(body.stock),
    description: body.description,
    image: body.image
});

// ==================================================
// STOREFRONT
// ==================================================

app.get(
    '/api/products',
    wrap(async (req, res) => {
        res.json(await Product.find().sort('category name'));
    })
);

// ==================================================
// CREATE ORDER
// ==================================================

app.post(
    '/api/orders',
    wrap(async (req, res) => {
        const { items, customer, paymentMethod } = req.body;

        const bad = (message) => res.status(400).json({ error: message });

        if (!Array.isArray(items) || !items.length) {
            return bad('Your cart is empty');
        }

        if (
            !customer?.name?.trim() ||
            !/^\d{10}$/.test(customer.phone || '') ||
            !customer.address?.trim()
        ) {
            return bad('Enter your name, a 10-digit phone number and your address');
        }

        if (!['cod', 'upi', 'card'].includes(paymentMethod)) {
            return bad('Choose a payment method');
        }

        const done = [];

        // Put stock back if the order fails part-way
        const rollback = () =>
            Promise.all(
                done.map((line) =>
                    Product.updateOne(
                        { _id: line.product },
                        { $inc: { stock: line.qty } }
                    )
                )
            );

        for (const item of items) {
            const qty = Math.floor(Number(item.qty));

            const product = await Product.findById(item.id).catch(() => null);

            if (!product || !(qty >= 1)) {
                await rollback();
                return bad('An item in your cart is no longer available');
            }

            const result = await Product.updateOne(
                { _id: product._id, stock: { $gte: qty } },
                { $inc: { stock: -qty } }
            );

            if (!result.modifiedCount) {
                await rollback();
                return bad(`Not enough stock for ${product.name}`);
            }

            done.push({
                product: product._id,
                name: product.name,
                price: product.price,
                qty
            });
        }

        const total = done.reduce((sum, line) => sum + line.price * line.qty, 0);

        const order = await Order.create({
            items: done,
            customer: {
                name: customer.name.trim(),
                phone: customer.phone,
                address: customer.address.trim()
            },
            total,
            paymentMethod
        });

        res.status(201).json({ orderId: order._id, total });
    })
);

// ==================================================
// DEMO PAYMENT
// ==================================================

app.post(
    '/api/orders/:id/pay',
    wrap(async (req, res) => {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.paymentMethod !== 'cod') {
            order.paymentStatus = 'paid';
            await order.save();
        }

        res.json({ orderId: order._id, paymentStatus: order.paymentStatus });
    })
);

// ==================================================
// ADMIN LOGIN
// ==================================================

app.post(
    '/api/admin/login',
    wrap(async (req, res) => {
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                error: 'Server authentication is not configured'
            });
        }

        const email = String(req.body.email || '').toLowerCase();

        const admin = await Admin.findOne({ email });

        if (
            !admin ||
            !(await bcrypt.compare(String(req.body.password || ''), admin.passwordHash))
        ) {
            return res.status(401).json({
                error: 'Email or password is incorrect'
            });
        }

        const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, {
            expiresIn: '8h'
        });

        res.json({ token, email });
    })
);

// ==================================================
// ADMIN DASHBOARD STATS
// ==================================================

app.get(
    '/api/admin/stats',
    auth,
    wrap(async (req, res) => {
        const [products, orders, pending, revenue, lowStock] = await Promise.all([
            Product.countDocuments(),
            Order.countDocuments(),
            Order.countDocuments({ status: 'pending' }),
            // Revenue = all orders except cancelled ones
            Order.aggregate([
                { $match: { status: { $ne: 'cancelled' } } },
                { $group: { _id: null, sum: { $sum: '$total' } } }
            ]),
            Product.find({ stock: { $lte: 5 } })
                .select('name stock')
                .sort('stock')
                .limit(10)
        ]);

        res.json({
            products,
            orders,
            pending,
            revenue: revenue[0]?.sum || 0,
            lowStock
        });
    })
);

// ==================================================
// ADMIN ORDERS
// ==================================================

app.get(
    '/api/admin/orders',
    auth,
    wrap(async (req, res) => {
        res.json(await Order.find().sort('-createdAt').limit(200));
    })
);

app.patch(
    '/api/admin/orders/:id',
    auth,
    wrap(async (req, res) => {
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status: req.body.status },
            { new: true, runValidators: true }
        );

        if (!order) return res.status(404).json({ error: 'Order not found' });

        res.json(order);
    })
);

// ==================================================
// ADMIN PRODUCTS
// ==================================================

app.get(
    '/api/admin/products',
    auth,
    wrap(async (req, res) => {
        res.json(await Product.find().sort('-createdAt'));
    })
);

app.post(
    '/api/admin/products',
    auth,
    wrap(async (req, res) => {
        res.status(201).json(await Product.create(pick(req.body)));
    })
);

app.put(
    '/api/admin/products/:id',
    auth,
    wrap(async (req, res) => {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            pick(req.body),
            { new: true, runValidators: true }
        );

        if (!product) return res.status(404).json({ error: 'Product not found' });

        res.json(product);
    })
);

app.delete(
    '/api/admin/products/:id',
    auth,
    wrap(async (req, res) => {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    })
);

// ==================================================
// VERCEL EXPORT
// ==================================================

module.exports = app;

// ==================================================
// LOCAL SERVER
// ==================================================

if (require.main === module) {
    const PORT = process.env.PORT || 3000;

    connectDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Star Pets running at http://localhost:${PORT}`);
            });
        })
        .catch((error) => {
            console.error('MongoDB connection failed:', error.message);
            process.exit(1);
        });
}
