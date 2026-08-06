const fs = require('fs');
const path = require('path');
const { sinergia_pool } = require('../../db');

const { Client } = require('pg');

async function ensureMigrated() {
  console.log('[MIGRATION] Iniciando runner de migrações...');
  
  // Auto check and create database if missing
  const connStr = process.env.PG_CONNECTION;
  if (connStr) {
    const dbNameMatch = connStr.match(/\/([^/?]+)(?:\?|$)/);
    if (dbNameMatch) {
      const dbName = dbNameMatch[1];
      const adminConnStr = connStr.replace(`/${dbName}`, '/postgres');
      const client = new Client({ connectionString: adminConnStr });
      try {
        await client.connect();
        const checkRes = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (checkRes.rows.length === 0) {
          console.log(`[MIGRATION] Banco de dados "${dbName}" não existe. Criando...`);
          await client.query(`CREATE DATABASE ${dbName}`);
          console.log(`[MIGRATION] Banco de dados "${dbName}" criado com sucesso.`);
        }
      } catch (err) {
        console.warn('[MIGRATION] Aviso ao verificar/criar banco de dados:', err.message);
      } finally {
        await client.end().catch(() => {});
      }
    }
  }

  // 1. Garantir existência da tabela de controle de migrações
  await sinergia_pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  // 2. Obter migrações já executadas
  const { rows } = await sinergia_pool.query('SELECT version FROM schema_migrations');
  const executed = new Set(rows.map(r => r.version));

  for (const file of files) {
    if (executed.has(file)) {
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`[MIGRATION] Executando migração: ${file}`);
    try {
      await sinergia_pool.query(sql);
      await sinergia_pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      console.log(`[MIGRATION] Sucesso: ${file}`);
    } catch (err) {
      console.error(`[MIGRATION] Erro ao executar ${file}:`, err.message);
      throw err;
    }
  }
  console.log('[MIGRATION] Todas as migrações foram concluídas com sucesso.');
}

module.exports = { ensureMigrated };
