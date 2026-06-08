const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../tests/agente.e2e.test.js');
let content = fs.readFileSync(filePath, 'utf8');

// The agent router endpoints in routes/agente.js
const endpoints = [
    'agent_data',
    'agent_dashboard',
    'agent_statistics',
    'agent_statistics_more',
    'agent_services',
    'last_update_agent',
    'custom_links',
    'predicted',
    'search_in',
    'create_justify',
    'get_justify',
    'update_justify',
    'delete_justify'
];

for (const ep of endpoints) {
    // Replace single quoted paths '/ep -> '/agent/ep
    content = content.split(`'/${ep}`).join(`'/agent/${ep}`);
    // Replace backtick quoted paths `/ep -> `/agent/ep
    content = content.split('`/' + ep).join('`/agent/' + ep);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated agent endpoints in agente.e2e.test.js');
