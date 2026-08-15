require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { geofenceCreateSchema } = require('../src/db/schemas/geofences');

const POOL_CONFIG = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
};

// Uso: node scripts/import_fences.js [--file ../fences.json] [--estado pi] [--speed-limit 40]
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.findIndex(a => a === `--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const file = path.resolve(argValue('file') || path.join(__dirname, '..', '..', 'fences.json'));
const estado = (argValue('estado') || 'pi').toLowerCase();
const speedLimit = Number(argValue('speed-limit') || 40);

async function main() {
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${file}`);
  }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error('O arquivo JSON deve conter um array de cercas.');
  }

  const pool = new Pool({
    connectionString: process.env.PG_CONNECTION,
    ...POOL_CONFIG,
  });

  try {
    const { rows } = await pool.query('SELECT name FROM tracking_fences');
    const existing = new Set(rows.map(r => r.name));

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorsList = [];

    for (const f of raw) {
      try {
        if (existing.has(f.name)) {
          skipped++;
          continue;
        }

        const mapped = {
          name: f.name,
          type: 'speed',
          estado,
          speed_limit: speedLimit,
          is_active: true,
          geometry: (f.coordinates || []).map(c => ({
            lat: c.latitude,
            lng: c.longitude,
          })),
        };

        const parsed = geofenceCreateSchema.parse(mapped);

        await pool.query(
          `INSERT INTO tracking_fences (name, type, estado, geometry, speed_limit, is_active)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
          [parsed.name, parsed.type, parsed.estado, JSON.stringify(parsed.geometry), parsed.speed_limit, parsed.is_active]
        );

        imported++;
      } catch (err) {
        errors++;
        errorsList.push({ name: f.name, erro: err.message });
      }
    }

    console.log(`[IMPORT] Cercas importadas: ${imported}`);
    console.log(`[IMPORT] Cercas puladas (nome já existe): ${skipped}`);
    console.log(`[IMPORT] Erros: ${errors}`);

    if (errorsList.length > 0) {
      console.log('[IMPORT] Detalhes dos erros:');
      for (const e of errorsList) {
        console.log(`  - ${e.name}: ${e.erro}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(`[IMPORT] Erro fatal: ${err.message}`);
  process.exit(1);
});
