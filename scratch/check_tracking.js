const { cenos_pool } = require('../src/db');
cenos_pool.query(`SELECT recorded_at, latitude, longitude, speed, accuracy FROM tracking_session_points WHERE agent_id = 'T60702' AND recorded_at >= '2026-06-26 06:00:00' AND recorded_at <= '2026-06-26 13:10:00' ORDER BY recorded_at ASC`).then(res => {
    console.log('Morning points count:', res.rows.length);
    res.rows.forEach(r => {
        const local = new Date(r.recorded_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza' });
        console.log(`${local} | UTC: ${r.recorded_at.toISOString()} | (${r.latitude}, ${r.longitude})`);
    });
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
