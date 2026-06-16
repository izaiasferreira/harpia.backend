require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const POOL_CONFIG = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
};

// Uso: node scripts/migrate_colaboradores.js <estado> [pool_env_var]
// Ex:  node scripts/migrate_colaboradores.js ma PG_CONNECTION_MA
//      node scripts/migrate_colaboradores.js pi PG_CONNECTION_PI (skip create)
const estado = process.argv[2] || 'ma';
const poolEnvVar = process.argv[3] || 'PG_CONNECTION_MA';
const skipCreate = process.argv.includes('--skip-create');

async function main() {
  const sourcePool = new Pool({
    connectionString: process.env[poolEnvVar],
    ...POOL_CONFIG,
  });

  const cenos_pool = new Pool({
    connectionString: process.env.PG_CONNECTION,
    ...POOL_CONFIG,
  });

  try {
    // 1. Descobrir schema da tabela origem
    console.log(`[MIGRATE] Descobrindo schema da tabela colaboradores em ${poolEnvVar}...`);
    const schemaRes = await sourcePool.query(`
      SELECT column_name, data_type, is_nullable, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'colaboradores'
      ORDER BY ordinal_position
    `);

    if (schemaRes.rows.length === 0) {
      throw new Error(`Tabela colaboradores não encontrada em ${poolEnvVar}`);
    }

    const sourceColumns = schemaRes.rows.map(r => ({
      name: r.column_name,
      dataType: r.data_type,
      nullable: r.is_nullable === 'YES',
      maxLength: r.character_maximum_length,
    }));

    console.log(`[MIGRATE] Colunas encontradas: ${sourceColumns.map(c => c.name).join(', ')}`);

    // 2. Criar tabela em cenos_pool se não existir
    if (skipCreate) {
      console.log('[MIGRATE] Skipping table creation...');
    } else {
      const columnDefs = sourceColumns.map(col => {
        let type = col.dataType;
        if (col.maxLength && (type === 'character varying' || type === 'varchar')) {
          type = `VARCHAR(${col.maxLength})`;
        } else if (type === 'character varying') {
          type = 'VARCHAR(255)';
        } else if (type === 'integer' || type === 'bigint') {
          // keep as is
        }
        return `"${col.name}" ${type}${col.nullable ? '' : ' NOT NULL'}`;
      });

      columnDefs.push('estado VARCHAR(2) DEFAULT \'pi\'');
      columnDefs.push('status BOOLEAN DEFAULT true');
      columnDefs.push('situacao VARCHAR(20) DEFAULT \'active\'');

      const hasIdColumn = sourceColumns.some(c => c.name === 'ID');
      let createSQL = `CREATE TABLE IF NOT EXISTS colaboradores (\n  ${columnDefs.join(',\n  ')}`;
      if (hasIdColumn) {
        createSQL += ',\n  PRIMARY KEY ("ID")';
      }
      createSQL += '\n);';

      console.log('[MIGRATE] Criando tabela em cenos_pool...');
      await cenos_pool.query(createSQL);
      console.log('[MIGRATE] Tabela criada com sucesso em cenos_pool.');
    }

    // 3. Buscar todos os dados da origem
    console.log(`[MIGRATE] Lendo dados de ${poolEnvVar}.colaboradores...`);
    const sourceColNames = sourceColumns.map(c => `"${c.name}"`).join(', ');
    const { rows: data } = await sourcePool.query(`SELECT ${sourceColNames} FROM colaboradores`);
    console.log(`[MIGRATE] ${data.length} registros lidos.`);

    // 4. Inserir em cenos_pool (pular registros com ID conflitante)
    if (data.length > 0) {
      const targetColNames = [...sourceColumns.map(c => `"${c.name}"`), 'estado', 'status', 'situacao'].join(', ');
      const placeholders = sourceColumns.map((_, i) => `$${i + 1}`);
      const extraPlaceholders = [`$${sourceColumns.length + 1}`, `$${sourceColumns.length + 2}`, `$${sourceColumns.length + 3}`];
      const allPlaceholders = [...placeholders, ...extraPlaceholders].join(', ');

      const insertSQL = `INSERT INTO colaboradores (${targetColNames}) VALUES (${allPlaceholders}) ON CONFLICT ("ID") DO NOTHING`;

      console.log('[MIGRATE] Inserindo dados em cenos_pool...');

      const BATCH_SIZE = 100;
      let inserted = 0;
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const client = await cenos_pool.connect();
        try {
          await client.query('BEGIN');
          for (const row of batch) {
            const values = sourceColumns.map(c => row[c.name]);
            values.push(estado, true, 'active');
            const res = await client.query(insertSQL, values);
            if (res.rowCount > 0) {
              inserted++;
              await client.query(
                `INSERT INTO login (id, estado) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
                [row['ID']?.toUpperCase(), estado.toLowerCase()]
              );
            }
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
        console.log(`[MIGRATE] ${Math.min(i + BATCH_SIZE, data.length)}/${data.length} processados...`);
      }

      console.log(`[MIGRATE] ${inserted}/${data.length} registros inseridos em cenos_pool (${data.length - inserted} conflitos ignorados).`);
    } else {
      console.log('[MIGRATE] Nenhum registro encontrado.');
    }

    // 5. Verificar resultado
    const { rows: count } = await cenos_pool.query('SELECT COUNT(*) as total FROM colaboradores');
    const { rows: estadoCount } = await cenos_pool.query(
      `SELECT COUNT(*) as total FROM colaboradores WHERE estado = $1`, [estado]
    );
    console.log(`[MIGRATE] Verificação: ${count[0].total} registros totais, ${estadoCount[0].total} do estado ${estado.toUpperCase()} em cenos_pool.colaboradores.`);
    console.log('[MIGRATE] Migração concluída com sucesso!');
  } catch (err) {
    console.error('[MIGRATE] Erro durante migração:', err.message);
    process.exit(1);
  } finally {
    await sourcePool.end();
    await cenos_pool.end();
  }
}

main();
