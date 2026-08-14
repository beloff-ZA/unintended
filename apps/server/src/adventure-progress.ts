import { and, eq, sql } from 'drizzle-orm';
import { buildAdventure, buildWorld, DEFAULT_WORLD_SEED, evaluateRegionThreshold, insufficientThresholdHint, type RegionReward, type ThresholdGrade } from '@unintended/world-data';
import { db } from './db/index.js';
import { anomalyClaimsV2, playerConcepts, regionProgress, worldEvents } from './db/schema.js';
import { getPlayerProgress } from './progression.js';

const worldSeed = Number(process.env.WORLD_SEED ?? DEFAULT_WORLD_SEED);
const world = buildWorld(worldSeed);
const adventure = buildAdventure(worldSeed, world.directions);
const rank: Record<ThresholdGrade, number> = { FAIL: 0, BARE: 1, COMPETENT: 2, MASTERY: 3 };

export type RegionAssessment = {
  regionId: string;
  name: string;
  condition: string;
  assessment: 'INSUFFICIENT' | 'SUFFICIENT' | 'STRONG' | 'COMPLETE';
  grade: ThresholdGrade;
  completedGoals: Array<{ id: string; label: string; complete: boolean; progress: number; target: number }>;
  hint: string | null;
  rewards: RegionReward[];
  nextRegions: Array<{ directionKey: string; shape: string; label: string; regionId: string }>;
};

export async function assessCurrentRegion(playerId: string): Promise<RegionAssessment> {
  const progress = await getPlayerProgress(playerId);
  const region = adventure.regions.find((row) => row.id === progress.currentRegion) ?? adventure.regions[0]!;

  const [visitedRow] = await db
    .select({ count: sql<number>`count(distinct ${worldEvents.locationId})` })
    .from(worldEvents)
    .where(and(eq(worldEvents.actorId, playerId), sql`${worldEvents.locationId} is not null`));

  const [questionRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(worldEvents)
    .where(and(eq(worldEvents.actorId, playerId), eq(worldEvents.type, 'PLAYER_ASKED_QUESTION')));

  const [conceptRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(playerConcepts)
    .where(eq(playerConcepts.playerId, playerId));

  const [anomalyRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(anomalyClaimsV2)
    .where(eq(anomalyClaimsV2.playerId, playerId));

  const visited = Number(visitedRow?.count ?? 1) || 1;
  const questions = Number(questionRow?.count ?? 0);
  const concepts = Number(conceptRow?.count ?? 0);
  const anomalies = Number(anomalyRow?.count ?? 0);

  const goals = region.goals.map((goal) => {
    let value = 0;
    if (goal.kind === 'OBSERVE') value = visited;
    else if (goal.kind === 'DISCOVER') value = concepts;
    else if (goal.kind === 'INTERACT') value = questions;
    else if (goal.kind === 'CONTRADICTION') value = anomalies;
    else if (goal.kind === 'PROJECT') value = 0;
    else value = Math.max(visited, concepts);

    return {
      ...goal,
      progress: Math.min(goal.target, value),
      complete: goal.target === 0 || value >= goal.target,
    };
  });

  const grade = evaluateRegionThreshold(region, progress.understanding, {
    visitedLocations: visited,
    discoveredConcepts: concepts,
    anomalies,
    completedGoals: goals.filter((goal) => goal.complete).length,
  });

  let [stored] = await db
    .select()
    .from(regionProgress)
    .where(and(eq(regionProgress.playerId, playerId), eq(regionProgress.regionId, region.id)));

  const existingRewards = (stored?.rewards ?? []) as RegionReward[];
  let rewards = existingRewards;

  if (!stored || rank[grade] > rank[stored.grade as ThresholdGrade]) {
    const newlyEligible = grade === 'FAIL' ? [] : region.rewards[grade];
    const byKey = new Map(
      [...existingRewards, ...newlyEligible].map((reward) => [`${reward.kind}:${reward.key}`, reward]),
    );
    rewards = [...byKey.values()];

    [stored] = await db
      .insert(regionProgress)
      .values({
        playerId,
        regionId: region.id,
        grade,
        completedGoals: goals.filter((goal) => goal.complete).map((goal) => goal.id),
        rewards,
      })
      .onConflictDoUpdate({
        target: [regionProgress.playerId, regionProgress.regionId],
        set: {
          grade,
          completedGoals: goals.filter((goal) => goal.complete).map((goal) => goal.id),
          rewards,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (grade !== 'FAIL') {
      await db.insert(worldEvents).values({
        type: 'THRESHOLD_PASSED',
        actorId: playerId,
        locationId: null,
        payload: {
          regionId: region.id,
          grade,
          rewardKeys: newlyEligible.map((reward) => reward.key),
        },
      });
    }
  }

  const assessment = grade === 'FAIL'
    ? 'INSUFFICIENT'
    : grade === 'BARE'
      ? 'SUFFICIENT'
      : grade === 'COMPETENT'
        ? 'STRONG'
        : 'COMPLETE';

  const directionMap = new Map(world.directions.map((direction) => [direction.key, direction]));
  const nextRegions = Object.entries(region.exits).map(([directionKey, regionId]) => {
    const direction = directionMap.get(directionKey);
    return {
      directionKey,
      shape: direction?.shape ?? '?',
      label: direction?.label ?? 'Some Way',
      regionId,
    };
  });

  return {
    regionId: region.id,
    name: region.name,
    condition: region.contradiction,
    assessment,
    grade,
    completedGoals: goals.map((goal) => ({
      id: goal.id,
      label: goal.label,
      complete: goal.complete,
      progress: goal.progress,
      target: goal.target,
    })),
    hint: grade === 'FAIL' ? insufficientThresholdHint(region, progress.understanding) : null,
    rewards,
    nextRegions,
  };
}

export function rewardAllows(rewards: RegionReward[], key: string) {
  return rewards.some((reward) => reward.key === key);
}
