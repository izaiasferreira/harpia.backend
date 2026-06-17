const { cenos_pool } = require('../back/src/db');

async function main() {
  const { rows } = await cenos_pool.query('SELECT id, signature_url, selfie_url, created_at FROM checklists ORDER BY created_at DESC LIMIT 5');
  console.log('Last 5 checklists:');
  rows.forEach(r => {
    console.log(`ID: ${r.id}`);
    console.log(`Sig: ${r.signature_url}`);
    console.log(`Selfie: ${r.selfie_url}`);
    console.log(`Created: ${r.created_at}`);
    console.log('---');
  });
  process.exit(0);
}

main().catch(console.error);
