const { cenos_pool } = require('../../db');
const bcrypt = require('bcrypt');
const { userDbCreateSchema } = require('../../db/schemas');
const z = require('zod');

async function createUser({
    email,
    senha,
    nome,
    role = 'USER',
    estado = 'pi',
    permissions = []
}) {
    const validated = userDbCreateSchema.parse({ email, senha, nome, role, estado });

    const pool = cenos_pool;

    const checkQuery = `SELECT id FROM users WHERE email = $1`;
    const checkResult = await pool.query(checkQuery, [validated.email.toLowerCase()]);
    if (checkResult.rows.length > 0) {
        throw new Error('Usuário já existe com este email');
    }

    const hashedSenha = await bcrypt.hash(validated.senha, 10);

    const insertQuery = `
        INSERT INTO users (email, senha, nome, role, estado)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, nome, role, estado, ativo, foto;
    `;
    const { rows } = await pool.query(insertQuery, [
        validated.email.toLowerCase(),
        hashedSenha,
        validated.nome,
        validated.role,
        validated.estado.toLowerCase()
    ]);

    const userId = rows[0].id;
    const state = validated.estado.toLowerCase();



    if (permissions.length > 0) {
        const permValues = permissions.map((p, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
        await pool.query(
            `INSERT INTO user_permissions (user_id, permission_id, state) VALUES ${permValues}`,
            [userId, ...permissions.flatMap(p => [p, state])]
        );
    }

    return rows[0];
}

async function verifyUser(email, senha) {
    const pool = cenos_pool;

    const query = `
        SELECT id, email, senha, nome, role, estado, ativo, foto
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
        SELECT id, email, nome, role, estado, ativo, foto, created_at, ultimo_login
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
        SELECT id, email, nome, role, estado, ativo, foto, created_at, ultimo_login
        FROM users 
        WHERE ativo = true
        ORDER BY nome
    `;
    const { rows } = await pool.query(query);
    return rows;
}

async function updateUser(id, data, estado = 'pi') {
    const pool = cenos_pool;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (data.nome !== undefined) {
        updates.push(`nome = $${paramIndex}`);
        params.push(data.nome);
        paramIndex++;
    }
    if (data.role !== undefined) {
        updates.push(`role = $${paramIndex}`);
        params.push(data.role);
        paramIndex++;
    }
    if (typeof data.ativo === 'boolean') {
        updates.push(`ativo = $${paramIndex}`);
        params.push(data.ativo);
        paramIndex++;
    }
    if (data.email !== undefined) {
        updates.push(`email = $${paramIndex}`);
        params.push(data.email.toLowerCase());
        paramIndex++;
    }
    if (data.estado !== undefined) {
        updates.push(`estado = $${paramIndex}`);
        params.push(data.estado.toLowerCase());
        paramIndex++;
    }
    if (data.foto !== undefined) {
        updates.push(`foto = $${paramIndex}`);
        params.push(data.foto);
        paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
        UPDATE users 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, email, nome, role, ativo, foto;
    `;
    
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
}

async function changePassword(id, novaSenha) {
    const pool = cenos_pool;
    const validatedPassword = z.string().min(6).max(255).parse(novaSenha);
    const hashedSenha = await bcrypt.hash(validatedPassword, 10);

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
    createUser,
    verifyUser,
    getUserById,
    updateLastLogin,
    listUsers,
    updateUser,
    changePassword,
    deleteUser
};