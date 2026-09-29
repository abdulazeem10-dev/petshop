require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const db = require('./db');
const { Product, Order, Admin, User } = require('./models');

const app = express();

// ==================================================
// MIDDLEWARE
// ==================================================

app.use(express.json({ limit: '100kb' }));

// CORS - required because Amplify frontend and EC2 backend
// will be on different domains.
app.use((req, res, next) => {
    const origin = process.env.FRONTEND_URL || '*';

    res.header('Access-Control-Allow-Origin', origin);
    res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

// Keep local frontend serving for testing.
// Later Amplify will serve the frontend.
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================================================
// DATABASE CONNECTION
// ==================================================

let dbReady = false;

async function connectDB() {
    if (dbReady) {
        return;
    }

    const connection = await db.getConnection();

    try {
        await connection.ping();
        dbReady = true;
        console.log('MySQL/RDS connected');
    } finally {
        connection.release();
    }
}

// Connect database before API requests
app.use('/api', async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error('Database connection failed:', error.message);

        res.status(500).json({
            error: 'Database connection failed'
        });
    }
});

// ==================================================
// ERROR WRAPPER
// ==================================================

const wrap = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((error) => {
        console.error(error);

        // MySQL duplicate entry
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'An account with this email already exists'
            });
        }

        res.status(500).json({
            error: 'Something went wrong'
        });
    });
};

// ==================================================
// AUTHENTICATION
// ==================================================

const auth = (req, res, next) => {
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            error: 'Server authentication is not configured'
        });
    }

    try {
        const token = (req.headers.authorization || '')
            .replace('Bearer ', '')
            .trim();

        if (!token) {
            throw new Error('Token missing');
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (decoded.role !== 'admin') {
            throw new Error('Not an admin');
        }

        next();

    } catch (error) {
        return res.status(401).json({
            error: 'Please log in again'
        });
    }
};


// Customer authentication
const userAuth = (req, res, next) => {
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            error: 'Server authentication is not configured'
        });
    }

    try {
        const token = (req.headers.authorization || '')
            .replace('Bearer ', '')
            .trim();

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (decoded.role !== 'user') {
            throw new Error('Not a customer');
        }

        req.userId = decoded.id;

        next();

    } catch (error) {
        return res.status(401).json({
            error: 'Please log in again'
        });
    }
};

// ==================================================
// PRODUCT HELPER
// ==================================================

const pick = (body) => ({
    name: String(body.name || '').trim(),
    category: body.category,
    price: Number(body.price),
    stock: Number(body.stock),
    description: body.description || '',
    image: body.image || ''
});

// ==================================================
// RESPONSE FORMAT HELPERS
// ==================================================

function publicProduct(product) {
    if (!product) {
        return null;
    }

    return {
        _id: product.id,
        id: product.id,
        name: product.name,
        category: product.category,
        price: Number(product.price),
        stock: Number(product.stock),
        description: product.description || '',
        image: product.image || '',
        createdAt: product.created_at,
        updatedAt: product.updated_at
    };
}


function publicOrder(order) {
    if (!order) {
        return null;
    }

    return {
        _id: order.id,
        id: order.id,

        items: (order.items || []).map(item => ({
            _id: item.id,
            product: item.product_id,
            product_id: item.product_id,
            name: item.name,
            price: Number(item.price),
            qty: Number(item.qty)
        })),

        customer: {
            name: order.customer_name,
            phone: order.customer_phone,
            address: order.customer_address
        },

        total: Number(order.total),

        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,

        status: order.status,

        createdAt: order.created_at,
        updatedAt: order.updated_at
    };
}


// ==================================================
// ADMIN SEED
// ==================================================

async function seedAdmin() {
    const email = String(process.env.ADMIN_EMAIL || '')
        .trim()
        .toLowerCase();

    const password = String(process.env.ADMIN_PASSWORD || '');

    if (!email || !password) {
        console.log(
            'ADMIN_EMAIL or ADMIN_PASSWORD not configured. Skipping admin seed.'
        );

        return;
    }

    const existing = await Admin.findByEmail(email);

    if (!existing) {
        const passwordHash = await bcrypt.hash(
            password,
            10
        );

        await Admin.create(
            email,
            passwordHash
        );

        console.log('Admin user created:', email);
    }
}

// ==================================================
// STOREFRONT PRODUCTS
// ==================================================

app.get(
    '/api/products',
    wrap(async (req, res) => {

        const products = await Product.findAll();

        res.json(
            products.map(publicProduct)
        );
    })
);

// ==================================================
// CREATE ORDER
// ==================================================

app.post(
    '/api/orders',
    wrap(async (req, res) => {

        const {
            items,
            customer,
            paymentMethod
        } = req.body;

        const bad = (message) => {
            return res.status(400).json({
                error: message
            });
        };

        if (!Array.isArray(items) || !items.length) {
            return bad('Your cart is empty');
        }

        if (
            !customer?.name?.trim() ||
            !/^\d{10}$/.test(customer.phone || '') ||
            !customer.address?.trim()
        ) {
            return bad(
                'Enter your name, a 10-digit phone number and your address'
            );
        }

        if (!['cod', 'upi', 'card'].includes(paymentMethod)) {
            return bad('Choose a payment method');
        }

        const connection = await db.getConnection();

        try {

            await connection.beginTransaction();

            const done = [];

            // ------------------------------------------
            // CHECK AND REDUCE STOCK
            // ------------------------------------------

            for (const item of items) {

                const qty = Math.floor(
                    Number(item.qty)
                );

                if (!(qty >= 1)) {
                    await connection.rollback();

                    return bad(
                        'An item in your cart is invalid'
                    );
                }

                const [rows] = await connection.query(
                    `SELECT *
                     FROM products
                     WHERE id = ?
                     FOR UPDATE`,
                    [item.id]
                );

                const product = rows[0];

                if (!product) {
                    await connection.rollback();

                    return bad(
                        'An item in your cart is no longer available'
                    );
                }

                if (product.stock < qty) {
                    await connection.rollback();

                    return bad(
                        `Not enough stock for ${product.name}`
                    );
                }

                await connection.query(
                    `UPDATE products
                     SET stock = stock - ?
                     WHERE id = ?`,
                    [qty, product.id]
                );

                done.push({
                    product: product.id,
                    name: product.name,
                    price: Number(product.price),
                    qty
                });
            }

            // ------------------------------------------
            // CALCULATE TOTAL
            // ------------------------------------------

            const total = done.reduce(
                (sum, line) =>
                    sum + line.price * line.qty,
                0
            );

            // ------------------------------------------
            // CREATE ORDER
            // ------------------------------------------

            const [orderResult] = await connection.query(
                `INSERT INTO orders
                (
                    customer_name,
                    customer_phone,
                    customer_address,
                    total,
                    payment_method,
                    payment_status,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    customer.name.trim(),
                    customer.phone,
                    customer.address.trim(),
                    total,
                    paymentMethod,
                    'pending',
                    'placed'
                ]
            );

            const orderId = orderResult.insertId;

            // ------------------------------------------
            // CREATE ORDER ITEMS
            // ------------------------------------------

            for (const item of done) {

                await connection.query(
                    `INSERT INTO order_items
                    (
                        order_id,
                        product_id,
                        name,
                        price,
                        qty
                    )
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        orderId,
                        item.product,
                        item.name,
                        item.price,
                        item.qty
                    ]
                );
            }

            await connection.commit();

            res.status(201).json({
                orderId,
                total
            });

        } catch (error) {

            await connection.rollback();

            throw error;

        } finally {

            connection.release();
        }
    })
);

// ==================================================
// DEMO PAYMENT
// ==================================================

app.post(
    '/api/orders/:id/pay',
    wrap(async (req, res) => {

        const order = await Order.findById(
            req.params.id
        );

        if (!order) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        if (order.payment_method !== 'cod') {

            const updated = await Order.markPaid(
                req.params.id
            );

            return res.json({
                orderId: updated.id,
                paymentStatus: updated.payment_status
            });
        }

        res.json({
            orderId: order.id,
            paymentStatus: order.payment_status
        });
    })
);

// ==================================================
// CUSTOMER ACCOUNTS
// ==================================================

const userToken = (user) => {

    return jwt.sign(
        {
            id: user.id,
            role: 'user'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '30d'
        }
    );
};


const publicUser = (user) => ({
    name: user.name,
    email: user.email,
    phone: user.phone || ''
});


// ==================================================
// REGISTER
// ==================================================

app.post(
    '/api/auth/register',
    wrap(async (req, res) => {

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                error: 'Server authentication is not configured'
            });
        }

        const name = String(
            req.body.name || ''
        ).trim();

        const email = String(
            req.body.email || ''
        ).trim().toLowerCase();

        const phone = String(
            req.body.phone || ''
        ).trim();

        const password = String(
            req.body.password || ''
        );

        const bad = (message) => {
            return res.status(400).json({
                error: message
            });
        };

        if (!name) {
            return bad('Enter your name');
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return bad(
                'Enter a valid email address'
            );
        }

        if (
            phone &&
            !/^\d{10}$/.test(phone)
        ) {
            return bad(
                'Phone number must be 10 digits'
            );
        }

        if (password.length < 8) {
            return bad(
                'Password must be at least 8 characters'
            );
        }

        const existing = await User.findByEmail(
            email
        );

        if (existing) {
            return res.status(409).json({
                error:
                    'An account with this email already exists'
            });
        }

        const passwordHash = await bcrypt.hash(
            password,
            10
        );

        const user = await User.create({
            name,
            email,
            phone,
            passwordHash
        });

        res.status(201).json({
            token: userToken(user),
            user: publicUser(user)
        });
    })
);

// ==================================================
// LOGIN
// ==================================================

app.post(
    '/api/auth/login',
    wrap(async (req, res) => {

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                error:
                    'Server authentication is not configured'
            });
        }

        const email = String(
            req.body.email || ''
        ).trim().toLowerCase();

        const password = String(
            req.body.password || ''
        );

        const user = await User.findByEmail(
            email
        );

        if (
            !user ||
            !(await bcrypt.compare(
                password,
                user.password_hash
            ))
        ) {
            return res.status(401).json({
                error:
                    'Email or password is incorrect'
            });
        }

        res.json({
            token: userToken(user),
            user: publicUser(user)
        });
    })
);

// ==================================================
// CURRENT USER
// ==================================================

app.get(
    '/api/auth/me',
    userAuth,
    wrap(async (req, res) => {

        const user = await User.findById(
            req.userId
        );

        if (!user) {
            return res.status(401).json({
                error: 'Please log in again'
            });
        }

        res.json(
            publicUser(user)
        );
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
                error:
                    'Server authentication is not configured'
            });
        }

        const email = String(
            req.body.email || ''
        ).trim().toLowerCase();

        const password = String(
            req.body.password || ''
        );

        const admin = await Admin.findByEmail(
            email
        );

        if (
            !admin ||
            !(await bcrypt.compare(
                password,
                admin.password_hash
            ))
        ) {
            return res.status(401).json({
                error:
                    'Email or password is incorrect'
            });
        }

        const token = jwt.sign(
            {
                id: admin.id,
                role: 'admin'
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '8h'
            }
        );

        res.json({
            token,
            email
        });
    })
);

// ==================================================
// ADMIN DASHBOARD STATS
// ==================================================

app.get(
    '/api/admin/stats',
    auth,
    wrap(async (req, res) => {

        const [
            [productCount],
            [orderCount],
            [pendingCount],
            [revenueRows],
            [lowStock]
        ] = await Promise.all([

            db.query(
                `SELECT COUNT(*) AS count
                 FROM products`
            ),

            db.query(
                `SELECT COUNT(*) AS count
                 FROM orders`
            ),

            // "Placed" is the initial pending-work state
            // in our MySQL order status enum.
            db.query(
                `SELECT COUNT(*) AS count
                 FROM orders
                 WHERE status = 'placed'`
            ),

            db.query(
                `SELECT COALESCE(
                    SUM(
                        CASE
                            WHEN status != 'cancelled'
                            THEN total
                            ELSE 0
                        END
                    ), 0
                 ) AS revenue
                 FROM orders`
            ),

            db.query(
                `SELECT id, name, stock
                 FROM products
                 WHERE stock <= 5
                 ORDER BY stock ASC
                 LIMIT 10`
            )
        ]);

        res.json({
            products: productCount[0].count,
            orders: orderCount[0].count,
            pending: pendingCount[0].count,
            revenue: Number(
                revenueRows[0].revenue
            ),
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

        const orders = await Order.findAll();

        res.json(
            orders.map(publicOrder)
        );
    })
);


// ==================================================
// UPDATE ORDER STATUS
// ==================================================

app.patch(
    '/api/admin/orders/:id',
    auth,
    wrap(async (req, res) => {

        const allowedStatuses = [
            'placed',
            'packed',
            'shipped',
            'delivered',
            'cancelled'
        ];

        const status = req.body.status;

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                error: 'Invalid order status'
            });
        }

        const order = await Order.updateStatus(
            req.params.id,
            status
        );

        if (!order) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        res.json(
            publicOrder(order)
        );
    })
);

// ==================================================
// ADMIN PRODUCTS
// ==================================================

app.get(
    '/api/admin/products',
    auth,
    wrap(async (req, res) => {

        const products = await Product.findAll();

        products.sort(
            (a, b) =>
                new Date(b.created_at) -
                new Date(a.created_at)
        );

        res.json(
            products.map(publicProduct)
        );
    })
);


// ==================================================
// CREATE PRODUCT
// ==================================================

app.post(
    '/api/admin/products',
    auth,
    wrap(async (req, res) => {

        const data = pick(req.body);

        if (!data.name) {
            return res.status(400).json({
                error: 'Product name is required'
            });
        }

        if (
            !['Dog', 'Cat', 'Accessories']
                .includes(data.category)
        ) {
            return res.status(400).json({
                error: 'Invalid product category'
            });
        }

        if (
            !Number.isFinite(data.price) ||
            data.price < 0
        ) {
            return res.status(400).json({
                error: 'Invalid product price'
            });
        }

        if (
            !Number.isInteger(data.stock) ||
            data.stock < 0
        ) {
            return res.status(400).json({
                error: 'Invalid product stock'
            });
        }

        const product = await Product.create(
            data
        );

        res.status(201).json(
            publicProduct(product)
        );
    })
);


// ==================================================
// UPDATE PRODUCT
// ==================================================

app.put(
    '/api/admin/products/:id',
    auth,
    wrap(async (req, res) => {

        const data = pick(req.body);

        if (!data.name) {
            return res.status(400).json({
                error: 'Product name is required'
            });
        }

        if (
            !['Dog', 'Cat', 'Accessories']
                .includes(data.category)
        ) {
            return res.status(400).json({
                error: 'Invalid product category'
            });
        }

        const product = await Product.update(
            req.params.id,
            data
        );

        if (!product) {
            return res.status(404).json({
                error: 'Product not found'
            });
        }

        res.json(
            publicProduct(product)
        );
    })
);


// ==================================================
// DELETE PRODUCT
// ==================================================

app.delete(
    '/api/admin/products/:id',
    auth,
    wrap(async (req, res) => {

        await Product.delete(
            req.params.id
        );

        res.json({
            ok: true
        });
    })
);

// ==================================================
// EXPORT
// ==================================================

module.exports = app;

// ==================================================
// START SERVER
// ==================================================

if (require.main === module) {

    const PORT =
        process.env.PORT || 3000;

    connectDB()
        .then(async () => {

            await seedAdmin();

            app.listen(
                PORT,
                '0.0.0.0',
                () => {
                    console.log(
                        `Star Pets backend running on port ${PORT}`
                    );
                }
            );
        })
        .catch(error => {

            console.error(
                'MySQL connection failed:',
                error.message
            );

            process.exit(1);
        });
}