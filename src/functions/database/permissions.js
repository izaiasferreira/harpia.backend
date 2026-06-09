const { cenos_pool } = require('../../db');
const { permissionCreateSchema, permissionSchema } = require('../../db/schemas');

function generateSlug(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
}

async function createPermission({
    name,
    description = '',
    modules = [],
    filters = [],
    state = 'pi'
}) {
    const slug = generateSlug(name);
    const validated = permissionCreateSchema.parse({ name, slug, description, modules, filters, state });

    const pool = cenos_pool;

    const checkQuery = `SELECT id FROM permissions WHERE slug = $1 AND state = $2`;
    const checkResult = await pool.query(checkQuery, [validated.slug, validated.state.toLowerCase()]);
    if (checkResult.rows.length > 0) {
        throw new Error('Permissão já existe com este nome');
    }

    const insertQuery = `
        INSERT INTO permissions (name, slug, description, modules, filters, state)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, slug, description, modules, filters, user_count, state, ativo;
    `;
    const { rows } = await pool.query(insertQuery, [
        validated.name,
        validated.slug,
        validated.description,
        validated.modules,
        typeof validated.filters === 'object' ? JSON.stringify(validated.filters) : validated.filters,
        validated.state.toLowerCase()
    ]);
    return rows[0];
}

async function getPermissionById(id, state = 'pi') {
    const pool = cenos_pool;

    const query = `
        SELECT id, name, slug, description, modules, filters, user_count, state, ativo, created_at
        FROM permissions 
        WHERE id = $1 AND ativo = true
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function listPermissions(state = 'pi') {
    const pool = cenos_pool;

    const query = `
        SELECT id, name, slug, description, modules, filters, user_count, state, ativo, created_at
        FROM permissions 
        WHERE ativo = true
        ORDER BY name
    `;
    const { rows } = await pool.query(query);
    return rows;
}

async function updatePermission(id, data, state = 'pi') {
    const pool = cenos_pool;
    const validated = permissionSchema.partial().parse(data);
    const { name, description, modules, filters, ativo } = validated;
    
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name) {
        const newSlug = generateSlug(name);
        updates.push(`name = $${paramIndex}, slug = $${paramIndex + 1}`);
        params.push(name, newSlug);
        paramIndex += 2;
    }
    if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
    }
    if (modules) {
        updates.push(`modules = $${paramIndex}`);
        params.push(modules);
        paramIndex++;
    }
    if (filters) {
        updates.push(`filters = $${paramIndex}`);
        params.push(typeof filters === 'object' ? JSON.stringify(filters) : filters);
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
        UPDATE permissions 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, name, slug, description, modules, filters, user_count, ativo;
    `;
    
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
}

async function deletePermission(id, state = 'pi') {
    const pool = cenos_pool;

    const query = `
        UPDATE permissions 
        SET ativo = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id;
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] ? true : false;
}

async function assignPermissionsToUser(userId, permissionIds, state = 'pi') {
    const pool = cenos_pool;

    await pool.query('BEGIN');

    try {
        await pool.query(
            `DELETE FROM user_permissions WHERE user_id = $1 AND state = $2`,
            [userId, state.toLowerCase()]
        );

        for (const permId of permissionIds) {
            await pool.query(
                `INSERT INTO user_permissions (user_id, permission_id, state) VALUES ($1, $2, $3)`,
                [userId, permId, state.toLowerCase()]
            );
        }

        await pool.query(
            `UPDATE permissions SET user_count = (
                SELECT COUNT(*) FROM user_permissions WHERE permission_id = $1 AND state = $2
            ) WHERE id = $1 AND state = $2`,
            [permissionIds[0], state.toLowerCase()]
        );

        await pool.query('COMMIT');
        return true;
    } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
    }
}

async function getUserPermissions(userId, state = 'pi') {
    const pool = cenos_pool;

    const query = `
        SELECT p.id, p.name, p.slug, p.modules, p.filters
        FROM permissions p
        JOIN user_permissions up ON p.id = up.permission_id
        WHERE up.user_id = $1 AND up.state = $2 AND p.ativo = true
    `;
    const { rows } = await pool.query(query, [userId, state.toLowerCase()]);
    return rows;
}

async function getUserModules(userId, state = 'pi') {
    const perms = await getUserPermissions(userId, state);
    const modules = new Set();
    perms.forEach(p => {
        (p.modules || []).forEach(m => modules.add(m));
    });
    return Array.from(modules);
}

async function userHasModule(userId, moduleId, state = 'pi') {
    const modules = await getUserModules(userId, state);
    return modules.includes(moduleId);
}

module.exports = {
    createPermission,
    getPermissionById,
    listPermissions,
    updatePermission,
    deletePermission,
    assignPermissionsToUser,
    getUserPermissions,
    getUserModules,
    userHasModule
};