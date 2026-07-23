require('dotenv').config();
const { Pool } = require('pg');

const POOL_CONFIG = {
    max: 25,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000, // 10s
    connectionTimeoutMillis: 15000, // Aumentado para suportar latência de banco remoto
    options: '-c timezone=UTC',
};

const cenos_pool = new Pool({
    connectionString: process.env.PG_CONNECTION,
    ...POOL_CONFIG,
});

const pi_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_PI,
    ...POOL_CONFIG,
});

const ma_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_MA,
    ...POOL_CONFIG,
});

const localizacoes_pi_pool = new Pool({
    connectionString: process.env.PG_CONNECTION_LOCALIZACOES_PI,
    ...POOL_CONFIG,
});

module.exports = { cenos_pool, pi_pool, ma_pool, localizacoes_pi_pool };

