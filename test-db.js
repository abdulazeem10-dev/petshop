const db = require('./db');

async function testConnection() {
    try {
        const [rows] = await db.query('SELECT DATABASE() AS database_name');
        console.log('Database connected:', rows[0].database_name);
    } catch (error) {
        console.error('Database connection failed:', error.message);
    } finally {
        await db.end();
    }
}

testConnection();