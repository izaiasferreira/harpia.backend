const { cenos_pool } = require('./src/db'); 
cenos_pool.query("SELECT id, name, slug, state, ativo FROM permissions").then(res => { 
    console.log(JSON.stringify(res.rows, null, 2)); 
    process.exit(0); 
}).catch(e => { 
    console.error(e); 
    process.exit(1); 
});
