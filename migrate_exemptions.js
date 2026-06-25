const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/cenos' });

async function run() {
    try {
        await pool.query(`
        CREATE TABLE IF NOT EXISTS agent_exemptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id VARCHAR(50) NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            reason TEXT,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_agent_exemptions_agent_id ON agent_exemptions(agent_id);
        CREATE INDEX IF NOT EXISTS idx_agent_exemptions_dates ON agent_exemptions(start_date, end_date);
        `);
        console.log('Table agent_exemptions created successfully.');
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

run();
