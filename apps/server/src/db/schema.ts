import { pgTable, text, timestamp, boolean, jsonb, integer, uniqueIndex, uuid, primaryKey, index } from 'drizzle-orm/pg-core';
export const users=pgTable('users',{id:uuid('id').defaultRandom().primaryKey(),email:text('email').notNull().unique(),passwordHash:text('password_hash'),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()});
export const characters=pgTable('characters',{id:uuid('id').defaultRandom().primaryKey(),userId:uuid('user_id').references(()=>users.id),name:text('name').notNull(),locationId:text('location_id').notNull().default('bellweather-square'),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()});
export const playerConcepts=pgTable('player_concepts',{playerId:uuid('player_id').notNull().references(()=>characters.id),concept:text('concept').notNull(),discoveredAt:timestamp('discovered_at',{withTimezone:true}).defaultNow().notNull()},t=>[uniqueIndex('player_concept_unique').on(t.playerId,t.concept)]);
export const entities=pgTable('entities',{id:text('id').primaryKey(),name:text('name').notNull(),kind:text('kind').notNull(),locationId:text('location_id'),ownerId:uuid('owner_id').references(()=>characters.id),portable:boolean('portable').default(false).notNull(),openable:boolean('openable').default(false).notNull(),open:boolean('open').default(false).notNull(),data:jsonb('data').$type<Record<string,unknown>>().default({}).notNull()});
export const locations=pgTable('locations',{id:text('id').primaryKey(),name:text('name').notNull(),exits:jsonb('exits').$type<Record<string,string>>().default({}).notNull()});
export const npcState=pgTable('npc_state',{id:text('id').primaryKey(),name:text('name').notNull(),locationId:text('location_id').notNull(),job:text('job').notNull(),memory:jsonb('memory').default([]).notNull(),data:jsonb('data').default({}).notNull()});
export const anomalies=pgTable('anomalies',{id:text('id').primaryKey(),name:text('name'),domain:text('domain').notNull(),doorKey:text('door_key'),pattern:jsonb('pattern').$type<string[]>().notNull(),discoveredBy:uuid('discovered_by').references(()=>characters.id),discoveredAt:timestamp('discovered_at',{withTimezone:true})});
export const anomalyOwners=pgTable('anomaly_owners',{anomalyId:text('anomaly_id').notNull().references(()=>anomalies.id),playerId:uuid('player_id').notNull().references(()=>characters.id),grantedAt:timestamp('granted_at',{withTimezone:true}).defaultNow().notNull()},t=>[uniqueIndex('anomaly_owner_unique').on(t.anomalyId)]);
export const anomalyObservations=pgTable('anomaly_observations',{id:uuid('id').defaultRandom().primaryKey(),anomalyId:text('anomaly_id').notNull(),playerId:uuid('player_id').notNull(),classification:text('classification').notNull().default('UNKNOWN EXCEPTION'),count:integer('count').notNull().default(1)});
export const worldDoors=pgTable('world_doors',{key:text('key').primaryKey(),name:text('name').notNull(),open:boolean('open').notNull().default(false),openedAt:timestamp('opened_at',{withTimezone:true}),openedByAnomaly:text('opened_by_anomaly')});
export const worldEvents=pgTable('world_events',{id:uuid('id').defaultRandom().primaryKey(),type:text('type').notNull(),actorId:text('actor_id').notNull(),targetId:text('target_id'),locationId:text('location_id'),payload:jsonb('payload').default({}).notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()});
export const importantHistory=pgTable('important_history',{id:uuid('id').defaultRandom().primaryKey(),type:text('type').notNull(),summary:text('summary').notNull(),payload:jsonb('payload').default({}).notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()});
export const worldFlags=pgTable('world_flags',{key:text('key').primaryKey(),value:jsonb('value').notNull()});
export const serverEventUsage=pgTable('server_event_usage',{id:uuid('id').defaultRandom().primaryKey(),event:text('event').notNull(),incidentAlias:text('incident_alias').notNull(),actorId:uuid('actor_id').references(()=>characters.id),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()});
export const projects=pgTable('projects',{id:text('id').primaryKey(),name:text('name').notNull(),requirements:jsonb('requirements').notNull(),progress:jsonb('progress').default({}).notNull(),complete:boolean('complete').default(false).notNull()});

export const playerProgress=pgTable('player_progress',{
  playerId:uuid('player_id').primaryKey().references(()=>characters.id,{onDelete:'cascade'}),
  understanding:jsonb('understanding').$type<Record<string,number>>().default({}).notNull(),
  actionCounts:jsonb('action_counts').$type<Record<string,number>>().default({}).notNull(),
  contextCounts:jsonb('context_counts').$type<Record<string,number>>().default({}).notNull(),
  hintState:jsonb('hint_state').$type<Record<string,unknown>>().default({}).notNull(),
  currentTitle:text('current_title').notNull().default('Mostly Present'),hiddenTier:integer('hidden_tier').notNull().default(0),
  currentRegion:text('current_region').notNull().default('bellweather'),regionState:jsonb('region_state').$type<Record<string,unknown>>().default({}).notNull(),
  updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
});
export const anomalyClaimsV2=pgTable('anomaly_claims_v2',{
  instanceId:text('instance_id').primaryKey(),templateId:text('template_id').notNull(),variant:integer('variant').notNull(),worldSeed:text('world_seed').notNull(),
  playerId:uuid('player_id').notNull().references(()=>characters.id,{onDelete:'cascade'}),exception:jsonb('exception').$type<Record<string,unknown>>().notNull(),utility:text('utility').notNull(),
  claimedAt:timestamp('claimed_at',{withTimezone:true}).defaultNow().notNull()
},t=>[index('anomaly_claims_v2_player_idx').on(t.playerId,t.claimedAt),index('anomaly_claims_v2_template_idx').on(t.templateId)]);
export const regionProgress=pgTable('region_progress',{
  playerId:uuid('player_id').notNull().references(()=>characters.id,{onDelete:'cascade'}),regionId:text('region_id').notNull(),grade:text('grade').notNull().default('FAIL'),
  completedGoals:jsonb('completed_goals').$type<string[]>().default([]).notNull(),rewards:jsonb('rewards').$type<Record<string,unknown>[]>().default([]).notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
},t=>[primaryKey({columns:[t.playerId,t.regionId]}),index('region_progress_region_idx').on(t.regionId,t.grade)]);
export const aiInteractions=pgTable('ai_interactions',{
  id:uuid('id').defaultRandom().primaryKey(),playerId:uuid('player_id').references(()=>characters.id,{onDelete:'set null'}),inputHash:text('input_hash').notNull(),kind:text('kind').notNull(),model:text('model').notNull(),outcome:text('outcome').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()
},t=>[index('ai_interactions_player_idx').on(t.playerId,t.createdAt),index('ai_interactions_created_idx').on(t.createdAt)]);
