const { cenos_pool } = require('../../db');
const { messageTemplateCreateSchema, messageTemplateSchema } = require('../../db/schemas');

async function ensureTable() {
    // Tabela message_templates_admin criada via migration central
}

async function get_message_templates_admin({ search, page = 1, limit = 9999, creator_id }) {
    await ensureTable();
    const pool = cenos_pool;

    let query = `SELECT * FROM message_templates_admin WHERE creator_id = $1`;
    const params = [creator_id];
    let paramIndex = 2;

    if (search) {
        query += ` AND (name ILIKE $${paramIndex} OR text ILIKE $${paramIndex} OR file ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    query += ` ORDER BY name ASC`;

    // Pagination
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    
    // We could do pagination in SQL, but following the project's memory pagination pattern if requested.
    // However, for this new table, SQL pagination is better.
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitVal, offsetVal);

    const { rows } = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM message_templates_admin WHERE creator_id = $1`;
    const countParams = [creator_id];
    if (search) {
        countQuery += ` AND (name ILIKE $2 OR text ILIKE $2 OR file ILIKE $2)`;
        countParams.push(`%${search}%`);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    
    return {
        data: rows,
        total: parseInt(countRows[0].count),
        page: parseInt(page),
        limit: limitVal,
        totalPages: Math.ceil(parseInt(countRows[0].count) / limitVal)
    };
}

async function save_message_template_admin({ name, text, file, webAppButtonText, webAppButtonUrl, creator_id }) {
    await ensureTable();
    const validated = messageTemplateCreateSchema.parse({ name, text, file, webAppButtonText, webAppButtonUrl, creator_id });
    const pool = cenos_pool;
    const query = `
        INSERT INTO message_templates_admin (name, text, file, web_app_button_text, web_app_button_url, creator_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *;
    `;
    const { rows } = await pool.query(query, [validated.name, validated.text, validated.file, validated.webAppButtonText, validated.webAppButtonUrl, validated.creator_id]);
    return rows[0];
}

async function update_message_template_admin(id, data, creator_id) {
    await ensureTable();
    const validated = messageTemplateSchema.partial().parse(data);
    const pool = cenos_pool;
    const fields = [];
    const params = [creator_id];
    let paramIndex = 2;

    const mapping = {
        name: 'name',
        text: 'text',
        file: 'file',
        webAppButtonText: 'web_app_button_text',
        webAppButtonUrl: 'web_app_button_url'
    };

    Object.keys(mapping).forEach(key => {
        if (validated[key] !== undefined) {
            fields.push(`${mapping[key]} = $${paramIndex}`);
            params.push(validated[key]);
            paramIndex++;
        }
    });

    if (fields.length === 0) return null;

    const query = `UPDATE message_templates_admin SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} AND creator_id = $1 RETURNING *`;
    params.push(parseInt(id, 10));
    const { rows } = await pool.query(query, params);
    return rows[0];
}

async function delete_message_template_admin(id, creator_id) {
    await ensureTable();
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM message_templates_admin WHERE id = $1 AND creator_id = $2 RETURNING *', [parseInt(id, 10), creator_id]);
    return rows[0];
}

module.exports = {
    get_message_templates_admin,
    save_message_template_admin,
    update_message_template_admin,
    delete_message_template_admin
};
