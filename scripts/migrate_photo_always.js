const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:tPyK23UBuY9yXOz65Hza@177.136.248.85:9001/cenos' });

async function migrate() {
  try {
    await pool.query('ALTER TABLE checklist_questions ADD COLUMN requires_photo_always BOOLEAN DEFAULT false;');
    console.log("Migration added requires_photo_always successfully.");
  } catch(e) {
    if (e.code === '42701') {
       console.log("Column requires_photo_always already exists.");
    } else {
       console.error(e);
    }
  } finally {
    await pool.end();
  }
}
migrate();
