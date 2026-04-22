const { cenos_pool } = require('../src/db');
async function check() {
    try {
        const { rows } = await cenos_pool.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
        console.log(rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
check();
