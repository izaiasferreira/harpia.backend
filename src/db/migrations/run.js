const fs = require('fs');
const path = require('path');
const { cenos_pool } = require('../../db');

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

  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`[MIGRATION] Executando migração: ${file}`);
    try {
      await cenos_pool.query(sql);
      console.log(`[MIGRATION] Sucesso: ${file}`);
    } catch (err) {
      console.error(`[MIGRATION] Erro ao executar ${file}:`, err.message);
      throw err;
    }
  }
  console.log('[MIGRATION] Todas as migrações foram concluídas com sucesso.');
}

module.exports = { ensureMigrated };
