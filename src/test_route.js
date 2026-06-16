require('dotenv').config();
const { cenos_pool } = require('./db');
const redisClient = require('./redis.js');

async function getColaboradoresNames(agentIds) {
    if (!agentIds || agentIds.length === 0) return {};
    try {
        const uppercaseIds = agentIds.map(id => id.toUpperCase());
        const { rows } = await cenos_pool.query(
            `SELECT "ID" AS id, "Nome" AS nome FROM colaboradores WHERE "ID" = ANY($1::varchar[])`, [uppercaseIds]
        );
        
        const namesMap = {};
        rows.forEach(r => {
            if (r.id) namesMap[r.id.toUpperCase()] = r.nome;
        });
        return namesMap;
    } catch (err) {
        console.warn('[DB] Erro ao obter nomes de colaboradores:', err.message);
        return {};
    }
}

(async () => {
    try {
        const lat = "-5.095512";
        const lng = "-42.711703";
        const limit = "10";

        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        const maxLimit = parseInt(limit) || 10;
        let results = [];

        if (redisClient.isOpen) {
            try {
                results = await redisClient.geoSearchWith(
                    'agents:locations',
                    { latitude: Number(lat), longitude: Number(lng) },
                    { radius: 5000, unit: 'km' },
                    ['WITHDIST', 'WITHCOORD'],
                    { SORT: 'ASC', COUNT: maxLimit }
                );
                console.log("Redis geoSearchWith completed. results count:", results ? results.length : null);
            } catch (redisErr) {
                console.error('[REDIS] Erro ao buscar agentes proximos:', redisErr);
            }
        }

        if (!results || results.length === 0) {
            console.log("No redis results, running fallback...");
            const { rows } = await cenos_pool.query(
                `SELECT 
                    id AS agent_id,
                    estado,
                    last_heartbeat_at,
                    last_heartbeat_lat,
                    last_heartbeat_lng
                 FROM login
                 WHERE last_heartbeat_lat IS NOT NULL AND last_heartbeat_lng IS NOT NULL
                 ORDER BY (
                     point(last_heartbeat_lng, last_heartbeat_lat) <-> point($1, $2)
                 ) ASC
                 LIMIT $3`,
                [Number(lng), Number(lat), maxLimit]
            );
            console.log("Fallback rows count:", rows.length);
            
            const agentIds = rows.map(r => r.agent_id);
            const namesMap = await getColaboradoresNames(agentIds);

            const formatted = rows.map(r => {
                const R = 6371; // km
                const dLat = (r.last_heartbeat_lat - Number(lat)) * Math.PI / 180;
                const dLon = (r.last_heartbeat_lng - Number(lng)) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(Number(lat) * Math.PI / 180) * Math.cos(r.last_heartbeat_lat * Math.PI / 180) *
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const dist = R * c;

                return {
                    agent_id: r.agent_id,
                    nome: namesMap[r.agent_id.toUpperCase()] || `Agente ${r.agent_id}`,
                    estado: r.estado,
                    last_heartbeat_at: r.last_heartbeat_at,
                    latitude: Number(r.last_heartbeat_lat),
                    longitude: Number(r.last_heartbeat_lng),
                    distance: Number(dist.toFixed(3))
                };
            });
            console.log("Fallback formatted count:", formatted.length);
            process.exit(0);
        }

        console.log("Redis results found:", results);
        const agentIds = results.map(r => r.member);
        const { rows: dbAgents } = await cenos_pool.query(
            `SELECT id AS agent_id, estado, last_heartbeat_at FROM login WHERE id = ANY($1::varchar[])`,
            [agentIds]
        );
        const namesMap = await getColaboradoresNames(agentIds);

        const agentMap = {};
        dbAgents.forEach(a => {
            agentMap[a.agent_id] = a;
        });

        const formatted = results.map(r => {
            const dbAgent = agentMap[r.member] || {};
            return {
                agent_id: r.member,
                nome: namesMap[r.member.toUpperCase()] || `Agente ${r.member}`,
                estado: dbAgent.estado || null,
                last_heartbeat_at: dbAgent.last_heartbeat_at || null,
                latitude: Number(r.coordinates.latitude),
                longitude: Number(r.coordinates.longitude),
                distance: Number(r.distance)
            };
        });
        console.log("Redis formatted count:", formatted.length);
        process.exit(0);
    } catch (err) {
        console.error("Failed:", err);
        process.exit(1);
    }
})();
