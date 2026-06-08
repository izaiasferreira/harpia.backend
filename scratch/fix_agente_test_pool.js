const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../tests/agente.e2e.test.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace table creation and token insert/delete queries to run on cenos_pool instead of pi_pool
content = content.replace(
    /await pi_pool\.query\(\`\s*CREATE TABLE IF NOT EXISTS telegram_tokens[\s\S]*?\`\);/,
    "" // Table is already created via migrations
);

content = content.replace(
    "await pi_pool.query(\n        `INSERT INTO telegram_tokens",
    "await cenos_pool.query(\n        `INSERT INTO telegram_tokens"
);

content = content.replace(
    "await pi_pool.query('DELETE FROM telegram_tokens WHERE token = $1'",
    "await cenos_pool.query('DELETE FROM telegram_tokens WHERE token = $1'"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated agente.e2e.test.js to query telegram_tokens in cenos_pool');
