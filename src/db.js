require('dotenv').config();
const { Pool } = require('pg');

const pi_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_PI,
});

const ma_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_MA,
});

const localizacoes_pi_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_LOCALIZACOES_PI,
});

module.exports = { pi_pool, ma_pool, localizacoes_pi_pool };
