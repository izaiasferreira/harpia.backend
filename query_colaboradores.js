const { cenos_pool } = require('./src/db');
cenos_pool.query('SELECT "ID", "Nome", "GESTOR IMEDIATO" FROM colaboradores LIMIT 5')
  .then(res => console.log(res.rows))
  .catch(console.error)
  .finally(() => process.exit());
