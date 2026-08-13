const { cenos_pool } = require('../../db');
const { appAlertCreateSchema, appAlertUpdateSchema } = require('../../db/schemas/appAlerts');
const { getFileUrl } = require('../minio');

// ─── Utilitários de frequência ──────────────────────────────────────────────

/**
 * Verifica se o agente já visualizou o alerta de acordo com a frequência configurada.
 * O backend é a fonte de verdade.
 */
async function hasAgentSeenAlert(alertId, agentId, frequency) {
    const now = new Date();

    if (frequency === 'once') {
        const { rows } = await cenos_pool.query(
            `SELECT 1 FROM app_alert_views WHERE alert_id = $1 AND agent_id = $2 LIMIT 1`,
            [alertId, agentId]
        );
        return rows.length > 0;
    }

    if (frequency === 'daily') {
        const todayStr = now.toISOString().split('T')[0];
        const { rows } = await cenos_pool.query(
            `SELECT 1 FROM app_alert_views WHERE alert_id = $1 AND agent_id = $2 AND viewed_at::date = $3 LIMIT 1`,
            [alertId, agentId, todayStr]
        );
        return rows.length > 0;
    }

    if (frequency === 'weekly') {
        // Semana ISO: segunda-feira da semana atual até domingo
        const day = now.getDay(); // 0=dom
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((day + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        const { rows } = await cenos_pool.query(
            `SELECT 1 FROM app_alert_views WHERE alert_id = $1 AND agent_id = $2 AND viewed_at >= $3 LIMIT 1`,
            [alertId, agentId, monday.toISOString()]
        );
        return rows.length > 0;
    }

    if (frequency.startsWith('weekday:')) {
        const days = frequency.replace('weekday:', '').split(',').map(Number);
        // JS: 0=dom,1=seg...6=sab → ISO: 1=seg...7=dom
        const isoDow = now.getDay() === 0 ? 7 : now.getDay();
        if (!days.includes(isoDow)) return true; // Hoje não é dia configurado → considera "visto"

        const todayStr = now.toISOString().split('T')[0];
        const { rows } = await cenos_pool.query(
            `SELECT 1 FROM app_alert_views WHERE alert_id = $1 AND agent_id = $2 AND viewed_at::date = $3 LIMIT 1`,
            [alertId, agentId, todayStr]
        );
        return rows.length > 0;
    }

    return false;
}

/**
 * Enriquece o alert com URL pública da imagem se necessário
 */
function enrichAlertContent(alert) {
    if (alert.content_type === 'image' && alert.content && !alert.content.startsWith('http')) {
        return { ...alert, content_url: getFileUrl(alert.content) };
    }
    return alert;
}

// ─── Listagem admin ──────────────────────────────────────────────────────────

async function listAlerts(user) {
    // Migração segura: garante que a coluna existe antes de usá-la
    await cenos_pool.query(
        `ALTER TABLE app_alerts ADD COLUMN IF NOT EXISTS display_order INTEGER`
    );

    const isCompanyAdmin = user.role === 'COMPANY_ADMIN';
    let query = `
        SELECT a.*,
               u.nome AS created_by_name,
               uu.nome AS updated_by_name,
               (SELECT COUNT(*) FROM app_alert_views v WHERE v.alert_id = a.id) AS view_count
        FROM app_alerts a
        LEFT JOIN users u ON a.created_by = u.id
        LEFT JOIN users uu ON a.updated_by = uu.id
    `;
    const params = [];
    if (!isCompanyAdmin && user.estado) {
        query += ` WHERE (a.filters->>'estado' IS NULL OR a.filters->'estado' = '[]'::jsonb OR a.filters->'estado' @> $1::jsonb)`;
        params.push(JSON.stringify([user.estado.toUpperCase()]));
    }
    query += ` ORDER BY a.display_order ASC NULLS LAST, a.created_at DESC`;
    const { rows } = await cenos_pool.query(query, params);
    return rows.map(enrichAlertContent);
}


async function getAlertById(id) {
    const { rows } = await cenos_pool.query(
        `SELECT a.*,
                u.nome AS created_by_name,
                uu.nome AS updated_by_name
         FROM app_alerts a
         LEFT JOIN users u ON a.created_by = u.id
         LEFT JOIN users uu ON a.updated_by = uu.id
         WHERE a.id = $1`,
        [id]
    );
    if (rows.length === 0) return null;
    return enrichAlertContent(rows[0]);
}

async function createAlert(data, userId) {
    const validated = appAlertCreateSchema.parse(data);
    const { rows } = await cenos_pool.query(
        `INSERT INTO app_alerts (title, content_type, content, link_url, is_active, filters, frequency, expires_at, assets, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         RETURNING *`,
        [
            validated.title,
            validated.content_type,
            validated.content,
            validated.link_url || null,
            validated.is_active,
            JSON.stringify(validated.filters),
            validated.frequency,
            validated.expires_at || null,
            JSON.stringify(validated.assets),
            userId,
        ]
    );
    return enrichAlertContent(rows[0]);
}

async function updateAlert(id, data, userId) {
    const validated = appAlertUpdateSchema.parse(data);
    const fields = [];
    const values = [];
    let idx = 1;

    if (validated.title !== undefined) { fields.push(`title = $${idx++}`); values.push(validated.title); }
    if (validated.content_type !== undefined) { fields.push(`content_type = $${idx++}`); values.push(validated.content_type); }
    if (validated.content !== undefined) { fields.push(`content = $${idx++}`); values.push(validated.content); }
    if ('link_url' in validated) { fields.push(`link_url = $${idx++}`); values.push(validated.link_url || null); }
    if (validated.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(validated.is_active); }
    if (validated.filters !== undefined) { fields.push(`filters = $${idx++}`); values.push(JSON.stringify(validated.filters)); }
    if (validated.frequency !== undefined) { fields.push(`frequency = $${idx++}`); values.push(validated.frequency); }
    if ('expires_at' in validated) { fields.push(`expires_at = $${idx++}`); values.push(validated.expires_at || null); }
    if (validated.assets !== undefined) { fields.push(`assets = $${idx++}`); values.push(JSON.stringify(validated.assets)); }

    fields.push(`updated_by = $${idx++}`); values.push(userId);
    fields.push(`updated_at = NOW()`);

    if (fields.length === 0) throw new Error('Nenhum campo para atualizar');

    values.push(id);
    const { rows } = await cenos_pool.query(
        `UPDATE app_alerts SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );
    if (rows.length === 0) throw { status: 404, message: 'Alerta não encontrado' };
    return enrichAlertContent(rows[0]);
}

async function toggleAlert(id, isActive, userId) {
    const { rows } = await cenos_pool.query(
        `UPDATE app_alerts SET is_active = $2, updated_by = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, isActive, userId]
    );
    if (rows.length === 0) throw { status: 404, message: 'Alerta não encontrado' };
    return enrichAlertContent(rows[0]);
}

async function deleteAlert(id) {
    const { rows } = await cenos_pool.query(
        `DELETE FROM app_alerts WHERE id = $1 RETURNING id`,
        [id]
    );
    if (rows.length === 0) throw { status: 404, message: 'Alerta não encontrado' };
    return true;
}

async function getAlertViews(alertId) {
    const { rows } = await cenos_pool.query(
        `SELECT v.id, v.agent_id, v.viewed_at,
                col."Nome" AS agent_name, col.regional, col.seccional, col.estado
         FROM app_alert_views v
         LEFT JOIN colaboradores col ON v.agent_id = col."ID"
         WHERE v.alert_id = $1
         ORDER BY v.viewed_at DESC`,
        [alertId]
    );
    return rows;
}

async function recordView(alertId, agentId) {
    // Insere a view (sem unique constraint — a frequência é verificada antes de chamar)
    await cenos_pool.query(
        `INSERT INTO app_alert_views (alert_id, agent_id) VALUES ($1, $2)`,
        [alertId, agentId]
    );
    return true;
}

async function deleteAlertView(alertId, agentId) {
    await cenos_pool.query(
        `DELETE FROM app_alert_views WHERE alert_id = $1 AND agent_id = $2`,
        [alertId, agentId]
    );
    return true;
}

async function clearAlertViews(alertId) {
    await cenos_pool.query(
        `DELETE FROM app_alert_views WHERE alert_id = $1`,
        [alertId]
    );
    return true;
}

async function reorderAlerts(orderedIds) {
    // Garante que a coluna existe (migração segura)
    await cenos_pool.query(
        `ALTER TABLE app_alerts ADD COLUMN IF NOT EXISTS display_order INTEGER`
    );
    // Atualiza cada ID com sua nova posição
    const client = await cenos_pool.connect();
    try {
        await client.query('BEGIN');
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query(
                `UPDATE app_alerts SET display_order = $1 WHERE id = $2`,
                [i + 1, orderedIds[i]]
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return true;
}

// ─── Elegibilidade para agente ───────────────────────────────────────────────

async function getAlertsForAgent(agentId, agentEstado) {
    const now = new Date();

    // Busca perfil completo do agente
    const { rows: profileRows } = await cenos_pool.query(
        `SELECT col."Cargo" AS cargo, col.regional, col.seccional, col."processo" AS processo, col.estado
         FROM login l
         LEFT JOIN colaboradores col ON l.id = col."ID"
         WHERE l.id = $1`,
        [agentId]
    );
    const profile = profileRows[0] || {};
    const estado = (profile.estado || agentEstado || '').toUpperCase();

    // Busca alertas ativos e não expirados
    const { rows: alerts } = await cenos_pool.query(
        `SELECT * FROM app_alerts
         WHERE is_active = true
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY display_order ASC NULLS LAST, created_at DESC`,
    );

    const eligible = [];
    for (const alert of alerts) {
        const f = alert.filters || {};

        // Filtro estado
        const matchEstado = !f.estado?.length || f.estado.some(e => e.toUpperCase() === estado);
        if (!matchEstado) continue;

        // Filtro regional
        const matchRegional = !f.regional?.length || f.regional.some(r => (profile.regional || '').toUpperCase() === r.toUpperCase());
        if (!matchRegional) continue;

        // Filtro seccional
        const matchSeccional = !f.seccional?.length || f.seccional.some(s => (profile.seccional || '').toUpperCase() === s.toUpperCase());
        if (!matchSeccional) continue;

        // Filtro cargo
        const matchCargo = !f.cargo?.length || f.cargo.some(c => (profile.cargo || '').toUpperCase() === c.toUpperCase());
        if (!matchCargo) continue;

        // Filtro processo
        const matchProcesso = !f.processo?.length || f.processo.some(p => (profile.processo || '').toUpperCase() === p.toUpperCase());
        if (!matchProcesso) continue;

        // Frequência
        const seen = await hasAgentSeenAlert(alert.id, agentId, alert.frequency);
        if (seen) continue;

        eligible.push(enrichAlertContent(alert));
    }

    return eligible;
}

module.exports = {
    listAlerts,
    getAlertById,
    createAlert,
    updateAlert,
    toggleAlert,
    deleteAlert,
    getAlertViews,
    deleteAlertView,
    clearAlertViews,
    reorderAlerts,
    recordView,
    getAlertsForAgent,
    hasAgentSeenAlert
};
