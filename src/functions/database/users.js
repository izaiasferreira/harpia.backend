const { cenos_pool } = require('../../db');
const bcrypt = require('bcrypt');

async function createUsersTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            nome TEXT NOT NULL,
            role TEXT DEFAULT 'USER' CHECK (role IN ('COMPANY_ADMIN', 'USER')),
            estado TEXT DEFAULT 'pi',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            ultimo_login TIMESTAMP,
            ativo BOOLEAN DEFAULT true
        )
    `);

    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS user_branches (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
            state TEXT DEFAULT 'pi',
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, branch_id, state)
        )
    `);
}

async function createUser({
    email,
    senha,
    nome,
    role = 'USER',
    estado = 'pi',
    branches = [],
    permissions = []
}) {
    await createUsersTable();

    const pool = cenos_pool;

    const checkQuery = `SELECT id FROM users WHERE email = $1`;
    const checkResult = await pool.query(checkQuery, [email.toLowerCase()]);
    if (checkResult.rows.length > 0) {
        throw new Error('Usuário já existe com este email');
    }

    const hashedSenha = await bcrypt.hash(senha, 10);

    const insertQuery = `
        INSERT INTO users (email, senha, nome, role, estado)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, nome, role, estado, ativo;
    `;
    const { rows } = await pool.query(insertQuery, [
        email.toLowerCase(),
        hashedSenha,
        nome,
        role,
        estado.toLowerCase()
    ]);

    const userId = rows[0].id;
    const state = estado.toLowerCase();

    if (branches.length > 0) {
        const branchValues = branches.map((b, i) => `($1, $${i + 2}, $${i + 3})`).join(', ');
        await pool.query(
            `INSERT INTO user_branches (user_id, branch_id, state) VALUES ${branchValues}`,
            [userId, ...branches, state]
        );
    }

    if (permissions.length > 0) {
        const permValues = permissions.map((p, i) => `($1, $${i + 2}, $${i + 3})`).join(', ');
        await pool.query(
            `INSERT INTO user_permissions (user_id, permission_id, state) VALUES ${permValues}`,
            [userId, ...permissions, state]
        );
    }

    return rows[0];
}

async function verifyUser(email, senha) {
    const pool = cenos_pool;

    const query = `
        SELECT id, email, senha, nome, role, ativo
        FROM users 
        WHERE email = $1 AND ativo = true
    `;
    const { rows } = await pool.query(query, [email.toLowerCase()]);
    
    if (rows.length === 0) return null;
    
    const valid = await bcrypt.compare(senha, rows[0].senha);
    if (!valid) return null;
    
    const { senha: _, ...user } = rows[0];
    return user;
}

async function getUserById(id, estado = 'pi') {
    const pool = cenos_pool;

    const query = `
        SELECT id, email, nome, role, ativo, created_at, ultimo_login
        FROM users 
        WHERE id = $1 AND ativo = true
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function updateLastLogin(id, estado = 'pi') {
    const pool = cenos_pool;

    const query = `
        UPDATE users 
        SET ultimo_login = NOW() 
        WHERE id = $1
    `;
    await pool.query(query, [id]);
}

async function listUsers(estado = 'pi') {
    const pool = cenos_pool;

    const query = `
        SELECT id, email, nome, role, ativo, created_at, ultimo_login
        FROM users 
        WHERE ativo = true
        ORDER BY nome
    `;
    const { rows } = await pool.query(query);
    return rows;
}

async function updateUser(id, data, estado = 'pi') {
    const pool = cenos_pool;
    const { nome, role, ativo } = data;
    
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (nome) {
        updates.push(`nome = $${paramIndex}`);
        params.push(nome);
        paramIndex++;
    }
    if (role) {
        updates.push(`role = $${paramIndex}`);
        params.push(role);
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
        UPDATE users 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, email, nome, role, ativo;
    `;
    
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
}

async function changePassword(id, novaSenha) {
    const pool = cenos_pool;
    const hashedSenha = await bcrypt.hash(novaSenha, 10);

    const query = `
        UPDATE users 
        SET senha = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id;
    `;
    const { rows } = await pool.query(query, [hashedSenha, id]);
    return rows[0] || null;
}

async function deleteUser(id, estado = 'pi') {
    const pool = cenos_pool;

    const query = `
        UPDATE users 
        SET ativo = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id;
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] ? true : false;
}

module.exports = {
    createUsersTable,
    createUser,
    verifyUser,
    getUserById,
    updateLastLogin,
    listUsers,
    updateUser,
    changePassword,
    deleteUser
};