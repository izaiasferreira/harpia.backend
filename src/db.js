require('dotenv').config();
const { Pool } = require('pg');

const pi_pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT) || 5432,
    database: process.env.PG_DATABASE_PI,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
});

const ma_pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT) || 5432,
    database: process.env.PG_DATABASE_MA,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
});

module.exports = { pi_pool, ma_pool };
