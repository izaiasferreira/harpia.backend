const { get_or_create_support_room, get_rooms_for_agent } = require('../src/functions/database/chat');
const { pi_pool, ma_pool } = require('../src/db');

async function test() {
  const agentId = 'T60702';
  const state = 'pi';
  
  const pool = state === 'pi' ? pi_pool : ma_pool;
  const { rows: agentData } = await pool.query(
      `SELECT "Nome" FROM colaboradores WHERE "ID" = $1`, 
      [agentId]
  );
  const agentName = agentData[0]?.Nome || agentId;
  console.log('AGENT NAME:', agentName);

  const room = await get_or_create_support_room(agentId, agentName);
  console.log('CREATED/RETRIEVED ROOM:', room);

  const rooms = await get_rooms_for_agent(agentId);
  console.log('ROOMS:', rooms);
}

test().catch(console.error);
