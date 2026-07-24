const { cenos_pool } = require('../../db');

/**
 * Registra ou atualiza o vínculo de um dispositivo a um agente.
 */
async function recordAgentDevice(agentId, deviceId, platform = 'android') {
    if (!agentId || !deviceId) return null;
    try {
        const query = `
            INSERT INTO agent_devices (agent_id, device_id, platform, first_seen_at, last_seen_at, login_count)
            VALUES ($1, $2, $3, NOW(), NOW(), 1)
            ON CONFLICT (agent_id, device_id)
            DO UPDATE SET 
                last_seen_at = NOW(),
                login_count = agent_devices.login_count + 1,
                platform = EXCLUDED.platform
            RETURNING *;
        `;
        const res = await cenos_pool.query(query, [String(agentId).trim(), String(deviceId).trim(), platform]);
        return res.rows[0];
    } catch (err) {
        console.error('[agentDevices] Erro ao gravar vínculo de dispositivo:', err.message);
        return null;
    }
}

/**
 * Retorna todos os dispositivos associados a um determinado agente.
 */
async function getDevicesByAgent(agentId) {
    if (!agentId) return [];
    try {
        const res = await cenos_pool.query(
            'SELECT * FROM agent_devices WHERE UPPER(agent_id) = UPPER($1) ORDER BY last_seen_at DESC',
            [String(agentId).trim()]
        );
        return res.rows;
    } catch (err) {
        console.error('[agentDevices] Erro ao buscar dispositivos do agente:', err.message);
        return [];
    }
}

/**
 * Retorna todos os agentes que já utilizaram um determinado dispositivo.
 */
async function getAgentsByDevice(deviceId) {
    if (!deviceId) return [];
    try {
        const res = await cenos_pool.query(
            'SELECT * FROM agent_devices WHERE device_id = $1 ORDER BY last_seen_at DESC',
            [String(deviceId).trim()]
        );
        return res.rows;
    } catch (err) {
        console.error('[agentDevices] Erro ao buscar agentes do dispositivo:', err.message);
        return [];
    }
}

module.exports = {
    recordAgentDevice,
    getDevicesByAgent,
    getAgentsByDevice
};
