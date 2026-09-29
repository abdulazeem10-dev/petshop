require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Admin } = require('./models');

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const email = 'admin@starpets.com';
        const password = 'Admin@123';

        const passwordHash = await bcrypt.hash(password, 10);

        await Admin.findOneAndUpdate(
            { email },
            { email, passwordHash },
            { upsert: true, new: true }
        );

        console.log('Admin created successfully');
        console.log('Email:', email);
        console.log('Password:', password);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

createAdmin();