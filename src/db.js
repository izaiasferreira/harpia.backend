require('dotenv').config();
const { Pool } = require('pg');

const cenos_pool = new Pool({
    connectionString: process.env.PG_CONNECTION,
});

const pi_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_PI,
});

const ma_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_MA,
});

const localizacoes_pi_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_LOCALIZACOES_PI,
});

module.exports = { cenos_pool, pi_pool, ma_pool, localizacoes_pi_pool };
