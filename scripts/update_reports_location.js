require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function main() {
  const cenos_pool = new Pool({
    connectionString: process.env.PG_CONNECTION,
  });

  try {
    console.log('[UPDATE REPORTS] Verificando colunas seccional e regional...');
    
    await cenos_pool.query(`
      ALTER TABLE security_report ADD COLUMN IF NOT EXISTS seccional VARCHAR(255);
      ALTER TABLE security_report ADD COLUMN IF NOT EXISTS regional VARCHAR(255);

      ALTER TABLE accidents ADD COLUMN IF NOT EXISTS seccional VARCHAR(255);
      ALTER TABLE accidents ADD COLUMN IF NOT EXISTS regional VARCHAR(255);
    `);

    console.log('[UPDATE REPORTS] Atualizando reportes de segurança (security_report) a partir da tabela colaboradores...');
    const srQuery = `
      UPDATE security_report sr
      SET seccional = c.seccional,
          regional = c.regional
      FROM colaboradores c
      WHERE LOWER(sr.autor) = LOWER(c."ID")
        AND (sr.seccional IS NULL OR sr.regional IS NULL OR sr.seccional = '' OR sr.regional = '')
    `;
    const srRes = await cenos_pool.query(srQuery);
    console.log(`[UPDATE REPORTS] ${srRes.rowCount} reportes de segurança atualizados com sucesso.`);

    console.log('[UPDATE REPORTS] Atualizando acidentes (accidents) a partir da tabela colaboradores...');
    const accQuery = `
      UPDATE accidents a
      SET seccional = c.seccional,
          regional = c.regional
      FROM colaboradores c
      WHERE LOWER(a.autor) = LOWER(c."ID")
        AND (a.seccional IS NULL OR a.regional IS NULL OR a.seccional = '' OR a.regional = '')
    `;
    const accRes = await cenos_pool.query(accQuery);
    console.log(`[UPDATE REPORTS] ${accRes.rowCount} acidentes atualizados com sucesso.`);

    console.log('[UPDATE REPORTS] Operação concluída com sucesso!');
  } catch (err) {
    console.error('[UPDATE REPORTS] Erro durante a atualização:', err);
    process.exit(1);
  } finally {
    await cenos_pool.end();
  }
}

main();
