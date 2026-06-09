const { cenos_pool } = require('../../db');
const { notificationCreateSchema } = require('../../db/schemas');

async function createNotification(agentId, sender, title, body, type, method, metadata) {
    const validated = notificationCreateSchema.parse({
        agent_id: agentId,
        sender,
        title,
        body,
        type,
        method: Array.isArray(method) ? method : (method ? [method] : undefined),
        metadata
    });
    const { rows } = await cenos_pool.query(
        `INSERT INTO notifications (agent_id, sender, title, body, type, method, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            validated.agent_id,
            validated.sender,
            validated.title || null,
            validated.body,
            validated.type || 'success',
            validated.method || ['push'],
            validated.metadata ? (typeof validated.metadata === 'string' ? validated.metadata : JSON.stringify(validated.metadata)) : null
        ]
    );
    return rows[0];
}

async function getAgentNotifications(agentId, page = 1, limit = 20, unreadOnly = false) {
    const offset = (page - 1) * limit;
    const whereClause = unreadOnly
        ? 'WHERE agent_id = $1 AND read = FALSE'
        : 'WHERE agent_id = $1';

    const { rows } = await cenos_pool.query(
        `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [agentId.toUpperCase(), limit, offset]
    );

    const { rows: countRows } = await cenos_pool.query(
        `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
        [agentId.toUpperCase()]
    );

    const { rows: unreadRows } = await cenos_pool.query(
        `SELECT COUNT(*) as unread FROM notifications WHERE agent_id = $1 AND read = FALSE`,
        [agentId.toUpperCase()]
    );

    const total = parseInt(countRows[0].total);
    const unread_count = parseInt(unreadRows[0].unread);

    return {
        notifications: rows,
        total,
        unread_count,
        page,
        pages: Math.ceil(total / limit)
    };
}

async function markNotificationsRead(agentId, ids) {
    await cenos_pool.query(
        `UPDATE notifications SET read = TRUE, read_at = NOW()
         WHERE agent_id = $1 AND id = ANY($2) AND read = FALSE`,
        [agentId.toUpperCase(), ids]
    );
}

async function markAllNotificationsRead(agentId) {
    await cenos_pool.query(
        `UPDATE notifications SET read = TRUE, read_at = NOW()
         WHERE agent_id = $1 AND read = FALSE`,
        [agentId.toUpperCase()]
    );
}

async function getAdminNotificationHistory(agentId, page = 1, limit = 30, search = '', from = null, to = null) {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE agent_id = $1';
    const params = [agentId.toUpperCase()];
    let paramIndex = 2;

    if (search) {
        whereClause += ` AND (title ILIKE $${paramIndex} OR body ILIKE $${paramIndex} OR sender ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    if (from) {
        whereClause += ` AND created_at >= $${paramIndex}`;
        params.push(from);
        paramIndex++;
    }

    if (to) {
        whereClause += ` AND created_at <= $${paramIndex}`;
        params.push(to);
        paramIndex++;
    }

    const { rows } = await cenos_pool.query(
        `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
    );

    const { rows: countRows } = await cenos_pool.query(
        `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
        params
    );

    const total = parseInt(countRows[0].total);

    return {
        notifications: rows,
        total,
        page,
        pages: Math.ceil(total / limit)
    };
}

module.exports = {
    createNotification,
    getAgentNotifications,
    markNotificationsRead,
    markAllNotificationsRead,
    getAdminNotificationHistory
};
