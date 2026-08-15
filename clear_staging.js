const { cenos_pool } = require('./src/db');
cenos_pool.query("DELETE FROM tracking_staging WHERE status = 'processing' OR status = 'pending'")
  .then(res => { console.log('Cleaned ' + res.rowCount + ' bad staging rows'); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
