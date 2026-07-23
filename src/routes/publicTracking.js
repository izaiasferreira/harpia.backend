const express = require('express');
const router = express.Router();
const { cenos_pool } = require('../db');

// Validar link e retornar metadados
router.get('/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const query = `
            SELECT id, created_by, created_at, expires_at, target_agents, revoked_at
            FROM tracking_shared_links
            WHERE token = $1
        `;
        const { rows } = await cenos_pool.query(query, [token]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Link não encontrado' });
        }

        const link = rows[0];

        if (link.revoked_at) {
            return res.status(403).json({ error: 'Este link foi revogado pelo administrador.', revoked: true });
        }

        if (new Date() > new Date(link.expires_at)) {
            return res.status(403).json({ error: 'Este link expirou.', expired: true });
        }

        res.json({
            expires_at: link.expires_at,
            target_agents: link.target_agents
        });
    } catch (error) {
        console.error('Error fetching public shared link:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// Retornar posições em tempo real
router.get('/:token/live', async (req, res) => {
    try {
        const { token } = req.params;
        const queryLink = `
            SELECT target_agents, expires_at, revoked_at
            FROM tracking_shared_links
            WHERE token = $1
        `;
        const { rows: linkRows } = await cenos_pool.query(queryLink, [token]);

        if (linkRows.length === 0) return res.status(404).json({ error: 'Link não encontrado' });
        const link = linkRows[0];
        if (link.revoked_at || new Date() > new Date(link.expires_at)) {
            return res.status(403).json({ error: 'Link expirado ou revogado' });
        }

        const agentIds = link.target_agents || [];
        if (agentIds.length === 0) return res.json([]);

        // Buscar agentes do sistema para confirmar que existem (traz estado)
        const { rows: allAgents } = await cenos_pool.query(`
            SELECT l.id AS agent_id, l.estado AS agent_estado 
            FROM login l 
            WHERE l.id = ANY($1)
        `, [agentIds]);

        if (allAgents.length === 0) return res.json([]);

        // Buscar último ponto de tracking para cada agente
        const foundAgentIds = allAgents.map(a => a.agent_id);
        const { rows: lastPoints } = await cenos_pool.query(`
            SELECT DISTINCT ON (agent_id)
                agent_id,
                latitude, longitude, speed, accuracy,
                battery_level, is_charging, network_type, gps_enabled,
                device_model, device_platform, os_version,
                recorded_at
            FROM tracking_session_points
            WHERE agent_id = ANY($1)
            ORDER BY agent_id, recorded_at DESC
        `, [foundAgentIds]);

        const lastPointsMap = {};
        lastPoints.forEach(p => { lastPointsMap[p.agent_id] = p; });

        // Buscar também o heartbeat para cada agente (assim como no painel admin)
        const { rows: heartbeats } = await cenos_pool.query(`
            SELECT agent_id, last_heartbeat_at, last_heartbeat_lat, last_heartbeat_lng
            FROM agent_heartbeats
            WHERE agent_id = ANY($1)
        `, [foundAgentIds]);

        const hbMap = {};
        heartbeats.forEach(h => { hbMap[h.agent_id] = h; });

        // Enriquecer com dados do colaborador
        const { rows: cols } = await cenos_pool.query(
            `SELECT "ID", "Nome", "seccional", "regional" FROM colaboradores WHERE "ID" = ANY($1)`,
            [foundAgentIds.map(id => id.toUpperCase())]
        );
        const colsMap = {};
        cols.forEach(c => colsMap[c.ID.toUpperCase()] = c);

        let result = allAgents.map(agent => {
            const id = agent.agent_id.toUpperCase();
            const col = colsMap[id] || {};
            const point = lastPointsMap[agent.agent_id] || {};
            const hb = hbMap[agent.agent_id] || {};

            // Verificar se o heartbeat é mais recente que o último ponto registrado
            const hbTime = hb.last_heartbeat_at ? new Date(hb.last_heartbeat_at).getTime() : 0;
            const ptTime = point.recorded_at ? new Date(point.recorded_at).getTime() : 0;
            const useHb = hbTime > ptTime;

            return {
                agent_id: agent.agent_id,
                agent_estado: agent.agent_estado,
                nome: col.Nome,
                seccional: col.seccional,
                regional: col.regional,
                latitude: useHb ? hb.last_heartbeat_lat : (point.latitude ?? null),
                longitude: useHb ? hb.last_heartbeat_lng : (point.longitude ?? null),
                speed: useHb ? null : (point.speed ?? null),
                accuracy: useHb ? null : (point.accuracy ?? null),
                battery_level: point.battery_level ?? null,
                is_charging: point.is_charging ?? null,
                network_type: point.network_type ?? null,
                gps_enabled: point.gps_enabled ?? null,
                device_model: point.device_model ?? null,
                device_platform: point.device_platform ?? null,
                os_version: point.os_version ?? null,
                recorded_at: useHb ? hb.last_heartbeat_at : (point.recorded_at ?? null)
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching live positions for shared link:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

module.exports = router;
