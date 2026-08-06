const { cenos_pool } = require('../../db');
const crypto = require('crypto');

const TOKEN_PREFIX = 'gedai_';
const IDENTIFIER_LENGTH = 16;

function generateToken() {
    const raw = crypto.randomUUID().replace(/-/g, '') + crypto.randomBytes(16).toString('hex');
    return TOKEN_PREFIX + raw;
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function generateIdentifier() {
    return crypto.randomBytes(IDENTIFIER_LENGTH).toString('base64url').slice(0, IDENTIFIER_LENGTH);
}

async function initApiTokensTable() {
    const pool = cenos_pool;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS api_tokens (
            id SERIAL PRIMARY KEY,
            token_identifier VARCHAR(16) NOT NULL UNIQUE,
            token_hash TEXT NOT NULL,
            label VARCHAR(255) NOT NULL,
            created_by VARCHAR(50) NOT NULL,
            created_by_name VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP DEFAULT NULL,
            revoked_at TIMESTAMP DEFAULT NULL,
            revoked_by VARCHAR(50) DEFAULT NULL,
            last_used_at TIMESTAMP DEFAULT NULL,
            last_used_ip VARCHAR(45) DEFAULT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS api_token_usage (
            id SERIAL PRIMARY KEY,
            token_id INTEGER NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
            endpoint VARCHAR(255) NOT NULL,
            method VARCHAR(10) NOT NULL,
            ip VARCHAR(45) DEFAULT NULL,
            user_agent TEXT DEFAULT NULL,
            accessed_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_api_tokens_identifier ON api_tokens(token_identifier)
    `).catch(() => {});
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_api_token_usage_token_id ON api_token_usage(token_id)
    `).catch(() => {});
}

async function createToken({ createdBy, createdByName, label, expiresAt }) {
    const pool = cenos_pool;
    await initApiTokensTable();

    const rawToken = generateToken();
    const hashed = hashToken(rawToken);
    const identifier = generateIdentifier();

    const { rows } = await pool.query(`
        INSERT INTO api_tokens (token_identifier, token_hash, label, created_by, created_by_name, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, token_identifier, label, created_by, created_by_name, created_at, expires_at, revoked_at, last_used_at
    `, [identifier, hashed, label, createdBy, createdByName || null, expiresAt || null]);

    return { ...rows[0], raw_token: rawToken };
}

async function listTokens() {
    const pool = cenos_pool;
    await initApiTokensTable();

    const { rows } = await pool.query(`
        SELECT id, token_identifier, label, created_by, created_by_name,
               created_at, expires_at, revoked_at, revoked_by, last_used_at, last_used_ip
        FROM api_tokens
        ORDER BY created_at DESC
    `);
    return rows;
}

async function revokeToken(tokenId, revokedBy) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        UPDATE api_tokens SET revoked_at = NOW(), revoked_by = $1
        WHERE id = $2 AND revoked_at IS NULL
        RETURNING id, token_identifier, label, revoked_at, revoked_by
    `, [revokedBy, tokenId]);
    return rows[0] || null;
}

async function unrevokeToken(tokenId) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        UPDATE api_tokens SET revoked_at = NULL, revoked_by = NULL
        WHERE id = $1
        RETURNING id, token_identifier, label, revoked_at
    `, [tokenId]);
    return rows[0] || null;
}

async function deleteToken(tokenId) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        DELETE FROM api_tokens WHERE id = $1 RETURNING id
    `, [tokenId]);
    return rows[0] || null;
}

async function validateToken(rawToken) {
    const pool = cenos_pool;

    if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) {
        return null;
    }

    const hashed = hashToken(rawToken);

    const { rows } = await pool.query(`
        SELECT id, token_identifier, label, created_by, created_by_name,
               created_at, expires_at, revoked_at
        FROM api_tokens
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
    `, [hashed]);

    if (rows.length === 0) return null;

    const token = rows[0];

    // Atualizar last_used_at
    await pool.query(`
        UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1
    `, [token.id]);

    return token;
}

async function logUsage({ tokenId, endpoint, method, ip, userAgent }) {
    const pool = cenos_pool;
    await pool.query(`
        INSERT INTO api_token_usage (token_id, endpoint, method, ip, user_agent)
        VALUES ($1, $2, $3, $4, $5)
    `, [tokenId, endpoint, method, ip || null, userAgent || null]);

    // Atualizar last_used_ip
    await pool.query(`
        UPDATE api_tokens SET last_used_ip = $1 WHERE id = $2
    `, [ip || null, tokenId]);
}

async function getUsageLogs(tokenId, page = 1, limit = 50) {
    const pool = cenos_pool;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(`
        SELECT COUNT(*) as total FROM api_token_usage WHERE token_id = $1
    `, [tokenId]);
    const total = parseInt(countResult.rows[0].total, 10);

    const { rows } = await pool.query(`
        SELECT id, endpoint, method, ip, user_agent, accessed_at
        FROM api_token_usage
        WHERE token_id = $1
        ORDER BY accessed_at DESC
        LIMIT $2 OFFSET $3
    `, [tokenId, limit, offset]);

    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

module.exports = {
    initApiTokensTable,
    createToken,
    listTokens,
    revokeToken,
    unrevokeToken,
    deleteToken,
    validateToken,
    logUsage,
    getUsageLogs,
    hashToken
};
