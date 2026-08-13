import { pool } from './db/index.js';
const mutable=['server_event_usage','important_history','world_events','anomaly_observations','anomaly_owners','player_concepts','entities','npc_state','projects','world_doors','anomalies','world_flags','characters','users','locations'];
for(const table of mutable) await pool.query(`TRUNCATE TABLE ${table} CASCADE`); console.log('World reset. Run db:migrate then world:seed.'); await pool.end();
