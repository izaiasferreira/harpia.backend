const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../tests/agente.e2e.test.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add cenos_pool import
content = content.replace(
    "const { pi_pool } = require('../src/db');",
    "const { pi_pool, cenos_pool } = require('../src/db');"
);

// 2. Add collaborator setup in beforeAll
const beforeAllInsertCode = `    // Insert agent to satisfy authentication
    await cenos_pool.query(
        "INSERT INTO login (id, estado, telegram_id) VALUES ('T12345', 'pi', $1) ON CONFLICT (id) DO UPDATE SET telegram_id = $1, estado = 'pi'",
        [TEST_TELEGRAM_ID]
    );
    await pi_pool.query("DELETE FROM colaboradores WHERE \\"ID\\" = 'T12345'").catch(() => {});
    await pi_pool.query(
        \`INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo") 
         VALUES ('T12345', '12345', 'Agente de Teste', 'Victor', 'AG.COMER LEITURISTA/MOTOCICLIS')\`
    ).catch(() => {});`;

content = content.replace(
    "beforeAll(async () => {",
    "beforeAll(async () => {\n" + beforeAllInsertCode
);

// 3. Add collaborator cleanup in afterAll
const afterAllCleanupCode = `    await cenos_pool.query("DELETE FROM login WHERE id = 'T12345'").catch(() => {});
    await pi_pool.query("DELETE FROM colaboradores WHERE \\"ID\\" = 'T12345'").catch(() => {});`;

content = content.replace(
    "afterAll(async () => {",
    "afterAll(async () => {\n" + afterAllCleanupCode
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated agente.e2e.test.js with collaborator setup');
