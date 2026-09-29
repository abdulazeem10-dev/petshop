const db = require('./db');

// ===============================
// PRODUCTS
// ===============================

const Product = {

    async findAll() {
        const [rows] = await db.query(
            `SELECT * FROM products ORDER BY category, name`
        );
        return rows;
    },

    async findById(id) {
        const [rows] = await db.query(
            `SELECT * FROM products WHERE id = ?`,
            [id]
        );
        return rows[0] || null;
    },

    async create(data) {
        const [result] = await db.query(
            `INSERT INTO products
            (name, category, price, stock, description, image)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                data.name,
                data.category,
                data.price,
                data.stock,
                data.description || null,
                data.image || null
            ]
        );

        return this.findById(result.insertId);
    },

    async update(id, data) {
        await db.query(
            `UPDATE products
             SET name = ?,
                 category = ?,
                 price = ?,
                 stock = ?,
                 description = ?,
                 image = ?
             WHERE id = ?`,
            [
                data.name,
                data.category,
                data.price,
                data.stock,
                data.description || null,
                data.image || null,
                id
            ]
        );

        return this.findById(id);
    },

    async delete(id) {
        await db.query(
            `DELETE FROM products WHERE id = ?`,
            [id]
        );
    }
};


// ===============================
// ORDERS
// ===============================

const Order = {

    async create(data) {

        const connection = await db.getConnection();

        try {

            await connection.beginTransaction();

            const [orderResult] = await connection.query(
                `INSERT INTO orders
                (customer_name,
                 customer_phone,
                 customer_address,
                 total,
                 payment_method,
                 payment_status,
                 status)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.customer.name,
                    data.customer.phone,
                    data.customer.address,
                    data.total,
                    data.paymentMethod,
                    'pending',
                    'placed'
                ]
            );

            const orderId = orderResult.insertId;

            for (const item of data.items) {

                await connection.query(
                    `INSERT INTO order_items
                    (order_id, product_id, name, price, qty)
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

            return {
                id: orderId,
                total: data.total
            };

        } catch (error) {

            await connection.rollback();
            throw error;

        } finally {

            connection.release();

        }
    },

    async findById(id) {

        const [orders] = await db.query(
            `SELECT * FROM orders WHERE id = ?`,
            [id]
        );

        if (!orders.length) {
            return null;
        }

        const order = orders[0];

        const [items] = await db.query(
            `SELECT * FROM order_items WHERE order_id = ?`,
            [id]
        );

        order.items = items;

        return order;
    },

    async findAll() {

        const [orders] = await db.query(
            `SELECT * FROM orders
             ORDER BY created_at DESC
             LIMIT 200`
        );

        for (const order of orders) {

            const [items] = await db.query(
                `SELECT * FROM order_items
                 WHERE order_id = ?`,
                [order.id]
            );

            order.items = items;
        }

        return orders;
    },

    async updateStatus(id, status) {

        const [result] = await db.query(
            `UPDATE orders
             SET status = ?
             WHERE id = ?`,
            [status, id]
        );

        if (!result.affectedRows) {
            return null;
        }

        return this.findById(id);
    },

    async markPaid(id) {

        await db.query(
            `UPDATE orders
             SET payment_status = 'paid'
             WHERE id = ?`,
            [id]
        );

        return this.findById(id);
    }
};


// ===============================
// ADMIN
// ===============================

const Admin = {

    async findByEmail(email) {

        const [rows] = await db.query(
            `SELECT * FROM admins
             WHERE email = ?`,
            [email]
        );

        return rows[0] || null;
    },

    async create(email, passwordHash) {

        const [result] = await db.query(
            `INSERT INTO admins
             (email, password_hash)
             VALUES (?, ?)`,
            [email, passwordHash]
        );

        return {
            id: result.insertId,
            email
        };
    }
};


// ===============================
// USER
// ===============================

const User = {

    async findByEmail(email) {

        const [rows] = await db.query(
            `SELECT * FROM users
             WHERE email = ?`,
            [email]
        );

        return rows[0] || null;
    },

    async findById(id) {

        const [rows] = await db.query(
            `SELECT * FROM users
             WHERE id = ?`,
            [id]
        );

        return rows[0] || null;
    },

    async create(data) {

        const [result] = await db.query(
            `INSERT INTO users
            (name, email, phone, password_hash)
            VALUES (?, ?, ?, ?)`,
            [
                data.name,
                data.email,
                data.phone || null,
                data.passwordHash
            ]
        );

        return this.findById(result.insertId);
    }
};


module.exports = {
    Product,
    Order,
    Admin,
    User
};