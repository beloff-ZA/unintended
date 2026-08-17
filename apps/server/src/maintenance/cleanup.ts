import { pool } from '../db/index.js';

const APPLY=process.env.CLEANUP_APPLY==='true';
const KEEP_UNOWNED_REPLENISHABLE=Math.max(1,Number(process.env.CLEANUP_KEEP_REPLENISHABLE??2));
const HELD_EVIDENCE_DAYS=Math.max(7,Number(process.env.CLEANUP_HELD_EVIDENCE_DAYS??60));
const AI_DAYS=Math.max(1,Number(process.env.CLEANUP_AI_DAYS??30));
const SERVER_USAGE_DAYS=Math.max(7,Number(process.env.CLEANUP_SERVER_USAGE_DAYS??90));
const WARN_MB=Math.max(32,Number(process.env.CLEANUP_TABLE_WARN_MB??512));

async function scalar(sql:string,params:unknown[]=[]){const result=await pool.query(sql,params);return Number(result.rows[0]?.count??0);}
async function remove(label:string,countSql:string,deleteSql:string,params:unknown[]=[]){const count=await scalar(countSql,params);console.log(`${APPLY?'APPLY':'DRY'} ${label}: ${count} candidate row${count===1?'':'s'}`);if(APPLY&&count)await pool.query(deleteSql,params);return count;}

try{
 const sizes=await pool.query(`
  SELECT relname AS table_name,
         pg_total_relation_size(relid)::bigint AS bytes,
         n_live_tup::bigint AS estimated_rows
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
 `);
 console.log(`UNINTENDED maintenance cleanup (${APPLY?'APPLY':'DRY RUN'})`);
 console.log('Largest tables:');
 for(const row of sizes.rows.slice(0,12)){const mb=Number(row.bytes)/(1024*1024),warning=mb>=WARN_MB?'  REVIEW':'';console.log(`  ${String(row.table_name).padEnd(24)} ${mb.toFixed(2).padStart(9)} MB  ~${row.estimated_rows} rows${warning}`);}

 await remove(
  'surplus unowned replenishable evidence',
  `WITH ranked AS (
     SELECT id,row_number() OVER (PARTITION BY map_id,template_id,location_id ORDER BY updated_at DESC,id DESC) AS rn
     FROM entities WHERE replenishes=true AND owner_id IS NULL AND map_id IS NOT NULL
   ) SELECT count(*) FROM ranked WHERE rn > $1`,
  `WITH ranked AS (
     SELECT id,row_number() OVER (PARTITION BY map_id,template_id,location_id ORDER BY updated_at DESC,id DESC) AS rn
     FROM entities WHERE replenishes=true AND owner_id IS NULL AND map_id IS NOT NULL
   ) DELETE FROM entities WHERE id IN (SELECT id FROM ranked WHERE rn > $1)`,
  [KEEP_UNOWNED_REPLENISHABLE]
 );

 await remove(
  `disposable evidence held by inactive players for ${HELD_EVIDENCE_DAYS}+ days`,
  `SELECT count(*) FROM entities e
   JOIN characters c ON c.id=e.owner_id
   LEFT JOIN LATERAL (SELECT max(created_at) AS last_active FROM world_events w WHERE w.actor_id=c.id::text) a ON true
   WHERE e.replenishes=true AND e.owner_id IS NOT NULL
     AND coalesce(a.last_active,c.created_at) < now()-make_interval(days=>$1)`,
  `DELETE FROM entities e USING characters c
   WHERE e.owner_id=c.id AND e.replenishes=true
     AND coalesce((SELECT max(w.created_at) FROM world_events w WHERE w.actor_id=c.id::text),c.created_at) < now()-make_interval(days=>$1)`,
  [HELD_EVIDENCE_DAYS]
 );

 await remove('expired AI telemetry',`SELECT count(*) FROM ai_interactions WHERE created_at < now()-make_interval(days=>$1)`,`DELETE FROM ai_interactions WHERE created_at < now()-make_interval(days=>$1)`,[AI_DAYS]);
 await remove('expired Server-toy telemetry',`SELECT count(*) FROM server_event_usage WHERE created_at < now()-make_interval(days=>$1)`,`DELETE FROM server_event_usage WHERE created_at < now()-make_interval(days=>$1)`,[SERVER_USAGE_DAYS]);

 const eventCount=await scalar('SELECT count(*) FROM world_events');
 console.log(`world_events: ${eventCount} rows. Retained deliberately: gameplay still projects authoritative history from this table.`);
 console.log('If world_events becomes materially large, implement projection checkpoints + archival before deleting it.');
 if(APPLY&&process.env.CLEANUP_VACUUM==='true'){console.log('Running VACUUM (ANALYZE) on high-churn tables...');await pool.query('VACUUM (ANALYZE) entities');await pool.query('VACUUM (ANALYZE) ai_interactions');await pool.query('VACUUM (ANALYZE) server_event_usage');}
 console.log(APPLY?'Cleanup applied.':'Dry run complete. Set CLEANUP_APPLY=true to apply the listed safe policies.');
}finally{await pool.end();}
