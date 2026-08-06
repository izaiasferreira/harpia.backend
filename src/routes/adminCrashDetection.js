const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { sinergia_pool } = require('../db');
const { getFallIncidents, updateFallIncidentStatus } = require('../functions/database/tracking');
const { userIsAdmin, getColaboradoresFilter } = require('../functions/database/admin');

// GET /admin/crash-detection — lista incidentes de crash detectados
router.get('/', verifyToken(), verifyModule('tracking_falls'), async (req, res) => {
    try {
        const { status, agentId, dateFrom, dateTo, search, page, limit, speedDropConfirmed } = req.query;

        const incidents = await getFallIncidents({
            status: status || null,
            agentId: agentId || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            speedDropConfirmed: speedDropConfirmed === 'true' ? true : null,
        }, req.user);

        // Filtro de busca textual
        let filtered = incidents;
        if (search) {
            const q = search.toLowerCase();
            filtered = incidents.filter(i =>
                (i.agent_nome && i.agent_nome.toLowerCase().includes(q)) ||
                (i.agent_id && i.agent_id.toLowerCase().includes(q)) ||
                (i.device_model && i.device_model.toLowerCase().includes(q))
            );
        }

        const pageNum = parseInt(page) || 1;
        const limitNum = Math.min(parseInt(limit) || 50, 200);
        const offset = (pageNum - 1) * limitNum;
        const paginated = filtered.slice(offset, offset + limitNum);

        res.json({
            incidents: paginated,
            total: filtered.length,
            page: pageNum,
            limit: limitNum,
        });
    } catch (err) {
        console.error('[CRASH_DETECTION] Erro ao listar:', err);
        res.status(500).json({ error: 'Erro ao listar incidentes de crash' });
    }
});

// GET /admin/crash-detection/stats — estatísticas resumidas
router.get('/stats', verifyToken(), verifyModule('tracking_falls'), async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;
        let params = [];
        let where = '1=1';

        // Aplica filtro de permissão
        if (!userIsAdmin(req.user)) {
            const filter = getColaboradoresFilter(req.user, { includeAllStates: true });
            if (filter.allowedStates.length > 0) {
                params.push(filter.allowedStates);
                where += ` AND estado = ANY($${params.length})`;
            } else {
                return res.json({
                    total: 0,
                    confirmed: 0,
                    falsePositive: 0,
                    pending: 0,
                    withSpeedDrop: 0,
                });
            }
        }

        if (dateFrom) {
            params.push(dateFrom);
            where += ` AND recorded_at >= $${params.length}`;
        }
        if (dateTo) {
            params.push(dateTo);
            where += ` AND recorded_at <= $${params.length}`;
        }

        const [total, confirmed, falsePositive, withSpeedDrop] = await Promise.all([
            sinergia_pool.query(`SELECT COUNT(*) FROM fall_incidents fi LEFT JOIN login l ON l.id = fi.agent_id WHERE ${where}`, params),
            sinergia_pool.query(`SELECT COUNT(*) FROM fall_incidents fi LEFT JOIN login l ON l.id = fi.agent_id WHERE ${where} AND fi.status = 'confirmed'`, params),
            sinergia_pool.query(`SELECT COUNT(*) FROM fall_incidents fi LEFT JOIN login l ON l.id = fi.agent_id WHERE ${where} AND fi.status = 'false_positive'`, params),
            sinergia_pool.query(`SELECT COUNT(*) FROM fall_incidents fi LEFT JOIN login l ON l.id = fi.agent_id WHERE ${where} AND fi.speed_drop_confirmed = TRUE`, params),
        ]);

        res.json({
            total: parseInt(total.rows[0].count),
            confirmed: parseInt(confirmed.rows[0].count),
            falsePositive: parseInt(falsePositive.rows[0].count),
            pending: parseInt(total.rows[0].count) - parseInt(confirmed.rows[0].count) - parseInt(falsePositive.rows[0].count),
            withSpeedDrop: parseInt(withSpeedDrop.rows[0].count),
        });
    } catch (err) {
        console.error('[CRASH_DETECTION] Erro ao buscar estatísticas:', err);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// PUT /admin/crash-detection/:id/status — atualizar status (confirmed / false_positive)
router.put('/:id/status', verifyToken(), verifyModule('tracking_falls'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        if (!['confirmed', 'false_positive', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Status inválido. Use: confirmed, false_positive ou pending' });
        }

        const result = await updateFallIncidentStatus(parseInt(id), status, notes);
        if (!result) {
            return res.status(404).json({ error: 'Incidente não encontrado' });
        }

        res.json(result);
    } catch (err) {
        console.error('[CRASH_DETECTION] Erro ao atualizar status:', err);
        res.status(500).json({ error: 'Erro ao atualizar incidente' });
    }
});

// GET /admin/crash-detection/:id — detalhes de um incidente
router.get('/:id', verifyToken(), verifyModule('tracking_falls'), async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await sinergia_pool.query(`
            SELECT
                fi.*,
                l.estado as agent_estado,
                c."Nome" as agent_nome,
                c."regional" as agent_regional,
                c."seccional" as agent_seccional,
                c."GESTOR IMEDIATO" as agent_gestor
            FROM fall_incidents fi
            LEFT JOIN login l ON l.id = fi.agent_id
            LEFT JOIN colaboradores c ON c."ID" = fi.agent_id
            WHERE fi.id = $1
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Incidente não encontrado' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('[CRASH_DETECTION] Erro ao obter incidente:', err);
        res.status(500).json({ error: 'Erro ao obter incidente' });
    }
});

// DELETE /admin/crash-detection/:id — excluir incidente de queda
router.delete('/:id', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const { id } = req.params;
        const { rows: existing } = await sinergia_pool.query('SELECT id FROM fall_incidents WHERE id = $1', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Incidente não encontrado' });
        }
        await sinergia_pool.query('DELETE FROM fall_incidents WHERE id = $1', [id]);
        res.json({ success: true, message: 'Incidente excluído com sucesso' });
    } catch (err) {
        console.error('[CRASH_DETECTION] Erro ao excluir:', err);
        res.status(500).json({ error: 'Erro ao excluir incidente' });
    }
});

module.exports = router;
