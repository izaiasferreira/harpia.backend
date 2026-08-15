const express = require('express');
const router = express.Router();
const { cenos_pool } = require('../db');
const { telegramAuth } = require('../middlewares/telegramAuth');

// Helper para pegar IDs do gestor e seus liderados
async function getGestorAndSubordinatesIds(gestorId) {
  // Primeiro, buscamos o nome do gestor pelo ID
  const { rows: gestorRows } = await cenos_pool.query(
    `SELECT "Nome" FROM colaboradores WHERE "ID" = $1`,
    [gestorId]
  );
  
  if (gestorRows.length === 0) return [gestorId];
  
  const gestorNome = gestorRows[0].Nome;

  // Depois buscamos os IDs onde o colaborador é o gestor ou o gestor imediato é o nome dele
  const { rows } = await cenos_pool.query(
    `SELECT "ID" FROM colaboradores 
     WHERE "ID" = $1 OR UPPER(TRIM("GESTOR IMEDIATO")) = UPPER(TRIM($2))`,
    [gestorId, gestorNome]
  );
  return rows.map(r => r.ID);
}

// GET /agent/manager-tracking/live
router.get('/live', telegramAuth, async (req, res) => {
  try {
    const gestorId = req.colaborador.id;

    console.log('[MANAGER_TRACKING] Gestor ID:', gestorId);

    if (!req.colaborador.is_gestor) {
      return res.status(403).json({ error: 'Acesso negado. Usuário não é gestor.' });
    }

    const ids = await getGestorAndSubordinatesIds(gestorId);
    if (ids.length === 0) return res.json([]);

    const { rows: lastPoints } = await cenos_pool.query(`
      SELECT a.agent_id, p.latitude, p.longitude, p.speed, p.accuracy,
             p.battery_level, p.is_charging, p.network_type, p.gps_enabled,
             p.device_model, p.device_platform, p.os_version, p.recorded_at
      FROM unnest($1::varchar[]) AS a(agent_id)
      LEFT JOIN LATERAL (
          SELECT agent_id,
                 latitude, longitude, speed, accuracy,
                 battery_level, is_charging, network_type, gps_enabled,
                 device_model, device_platform, os_version, recorded_at
          FROM tracking_session_points tsp
          WHERE tsp.agent_id = a.agent_id
          ORDER BY tsp.recorded_at DESC
          LIMIT 1
      ) p ON TRUE
    `, [ids]);

    const { rows: cols } = await cenos_pool.query(
      `SELECT "ID", "Nome", "MAT" FROM colaboradores WHERE "ID" = ANY($1)`,
      [ids]
    );
    const colsMap = {};
    cols.forEach(c => colsMap[c.ID] = c);

    const result = lastPoints
      .filter(p => p.latitude !== null && p.longitude !== null)
      .map(p => ({
        ...p,
        nome: colsMap[p.agent_id]?.Nome || null,
        matricula: colsMap[p.agent_id]?.MAT || null,
        is_self: p.agent_id === gestorId
      }));

    res.json(result);
  } catch (err) {
    console.error('[MANAGER_TRACKING] Erro em /live:', err);
    res.status(500).json({ error: 'Erro ao buscar posições ao vivo.' });
  }
});

// GET /agent/manager-tracking/speed_violations
router.get('/speed_violations', telegramAuth, async (req, res) => {
  try {
    const gestorId = req.colaborador.id;
    if (!req.colaborador.is_gestor) {
      return res.status(403).json({ error: 'Acesso negado. Usuário não é gestor.' });
    }

    const ids = await getGestorAndSubordinatesIds(gestorId);

    // Pega últimos 7 dias
    const { rows: violations } = await cenos_pool.query(`
      SELECT 
        tsp.id, tsp.agent_id, tsp.latitude, tsp.longitude, tsp.speed,
        tsp.recorded_at, tsp.device_model, tsp.os_version,
        c."Nome" as agent_name, c."MAT" as agent_matricula
      FROM tracking_session_points tsp
      JOIN colaboradores c ON c."ID" = tsp.agent_id
      WHERE tsp.is_speed_violation = TRUE 
        AND tsp.agent_id = ANY($1)
        AND tsp.recorded_at >= NOW() - INTERVAL '7 days'
      ORDER BY tsp.recorded_at DESC
      LIMIT 200
    `, [ids]);

    const result = violations.map(v => ({
      ...v,
      is_self: v.agent_id === gestorId
    }));

    res.json(result);
  } catch (err) {
    console.error('[MANAGER_TRACKING] Erro em /speed_violations:', err);
    res.status(500).json({ error: 'Erro ao buscar infrações.' });
  }
});

module.exports = router;
