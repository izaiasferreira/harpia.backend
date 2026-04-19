const { pi_pool, ma_pool } = require('../../db');

async function createAdminTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS admin_users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            nome TEXT NOT NULL,
            estado TEXT DEFAULT 'pi',
            nivel TEXT DEFAULT 'admin',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            ultimo_login TIMESTAMP,
            ativo BOOLEAN DEFAULT true
        );
    `;
    await pi_pool.query(query);
}

async function createAdmin({
    email,
    senha,
    nome,
    estado = 'pi',
    nivel = 'admin'
}) {
    await createAdminTable();

    const checkQuery = `SELECT id FROM admin_users WHERE email = $1`;
    const checkResult = await pi_pool.query(checkQuery, [email.toLowerCase()]);
    if (checkResult.rows.length > 0) {
        throw new Error('Admin já existe com este email');
    }

    const insertQuery = `
        INSERT INTO admin_users (email, senha, nome, estado, nivel)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, nome, estado, nivel, ativo;
    `;
    const { rows } = await pi_pool.query(insertQuery, [
        email.toLowerCase(),
        senha,
        nome,
        estado.toLowerCase(),
        nivel
    ]);
    return rows[0];
}

async function verifyAdmin(email, senha) {
    const query = `
        SELECT id, email, nome, estado, nivel, ativo
        FROM admin_users 
        WHERE email = $1 AND senha = $2 AND ativo = true
    `;
    const { rows } = await pi_pool.query(query, [email.toLowerCase(), senha]);
    return rows[0] || null;
}

async function getAdminById(id) {
    const query = `
        SELECT id, email, nome, estado, nivel, ativo, created_at, ultimo_login
        FROM admin_users 
        WHERE id = $1 AND ativo = true
    `;
    const { rows } = await pi_pool.query(query, [id]);
    return rows[0] || null;
}

async function updateLastLogin(id) {
    const query = `
        UPDATE admin_users 
        SET ultimo_login = NOW() 
        WHERE id = $1
    `;
    await pi_pool.query(query, [id]);
}

async function listAdmins(estado = 'all') {
    let query = `
        SELECT id, email, nome, estado, nivel, ativo, created_at, ultimo_login
        FROM admin_users 
        ORDER BY nome
    `;
    let params = [];

    if (estado && estado !== 'all') {
        query = `
            SELECT id, email, nome, estado, nivel, ativo, created_at, ultimo_login
            FROM admin_users 
            WHERE estado = $1
            ORDER BY nome
        `;
        params = [estado.toLowerCase()];
    }

    const { rows } = await pi_pool.query(query, params);
    return rows;
}

async function updateAdmin(id, data) {
    const { nome, estado, nivel, ativo } = data;
    
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (nome) {
        updates.push(`nome = $${paramIndex}`);
        params.push(nome);
        paramIndex++;
    }
    if (estado) {
        updates.push(`estado = $${paramIndex}`);
        params.push(estado.toLowerCase());
        paramIndex++;
    }
    if (nivel) {
        updates.push(`nivel = $${paramIndex}`);
        params.push(nivel);
        paramIndex++;
    }
    if (typeof ativo === 'boolean') {
        updates.push(`ativo = $${paramIndex}`);
        params.push(ativo);
        paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    
    params.push(id);
    const query = `
        UPDATE admin_users 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, email, nome, estado, nivel, ativo;
    `;
    
    const { rows } = await pi_pool.query(query, params);
    return rows[0] || null;
}

async function changePassword(id, novaSenha) {
    const query = `
        UPDATE admin_users 
        SET senha = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id;
    `;
    const { rows } = await pi_pool.query(query, [novaSenha, id]);
    return rows[0] || null;
}

async function deleteAdmin(id) {
    const query = `
        UPDATE admin_users 
        SET ativo = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id;
    `;
    const { rows } = await pi_pool.query(query, [id]);
    return rows[0] ? true : false;
}

module.exports = {
    createAdminTable,
    createAdmin,
    verifyAdmin,
    getAdminById,
    updateLastLogin,
    listAdmins,
    updateAdmin,
    changePassword,
    deleteAdmin
};