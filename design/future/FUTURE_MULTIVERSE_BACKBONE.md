# UNINTENDED — Future Multiverse Backbone

STATUS: LOCKED / DESIGN ONLY / NOT RUNTIME / NOT TESTED

This document preserves the intended backbone for later systems. Nothing in this directory is imported by the server, web client, world-data runtime, seed process, or load-test harness. These systems remain disabled until deliberately promoted through a future design/refinement phase.

## Activation rule

A future system may only move into runtime after:
1. the live Map Identity system has enough real play data to justify it;
2. its effect on mystery, economy, social balance and retained exceptions has been simulated;
3. server-authoritative boundaries are specified;
4. migration, cleanup and rollback plans exist;
5. it receives its own tests after activation. Current tests must not treat these concepts as playable.

## 7. Inter-Map relationships and rumours

Backbone entities:
- MapRelation: fromMap, toMap, familiarity, trust, tension, dependency, lastMeaningfulEvent.
- Rumour: sourceMap, subject, confidence, distortion, propagationDepth, expires/settles state.

Design direction:
- Maps develop opinions about one another from shared events, trade, failed obligations and player behaviour.
- Rumours are evidence, not authoritative truth.
- Cross-Map information should mutate as it travels rather than becoming global chat with extra nouns.

## 8. Profession progression

Backbone entities:
- ProfessionRecognition: player, profession, recognising NPC/institution, demonstrated practices, standing.
- ProfessionCapability: bounded world permission earned through demonstrated work.

Design direction:
- No class-selection screen.
- Recognition emerges from repeated competent interaction with profession NPCs.
- Multi-profession play remains possible, but breadth should create opportunity cost rather than free mastery.

## 9. Central professional convergence point

Working concept: The Junction / The Works.

Backbone entities:
- ProfessionalRepresentation: profession, institution, representative NPC, minimum world conditions.
- DelegationPresence: which Maps/professions currently have representation.

Design direction:
- Not an early-game capital city.
- Becomes accessible after players have enough cross-Map relevance.
- Every established profession can eventually be represented, but representation may be absent, contested or temporary.

## 10. Player institutions / guilds

Backbone entities:
- Institution: purpose, charter, headquarters/property, recognised professions, reputation, obligations, resources.
- InstitutionMembership: member, roles, contributions, liabilities.
- InstitutionProject: shared work with world-visible consequences.

Design direction:
- Guilds are not created by choosing a name/tag/logo.
- Formation requires demonstrated shared purpose, world recognition, experienced members, property/resources and NPC/institutional relationships.
- Single-profession guilds gain depth/specialisation.
- Multi-profession guilds gain flexibility but higher coordination/maintenance cost.
- Institutions must carry obligations and reputational consequences so they remain world systems rather than private chat rooms.

## 11. Dimensional Zones / Time Nexus

Backbone entities:
- DimensionalZone: source anomaly/incident, severity, lifecycle, affected Maps, nexus timestamp/state reference.
- ZoneProjection: player + current persistent identity projected into historical/contradictory zone context.
- ZoneResidue: evidence left after collapse.

Lifecycle concept:
FORMING -> UNSTABLE -> ACCESSIBLE -> COLLAPSING -> RESIDUAL

Design direction:
- Rare. Most anomalies do not create Zones.
- Zones are reality snapshots/branches, not ordinary dungeon instances.
- Entering a Zone never literally rolls back persistent player state.
- Current identity and possessions are projected through compatibility rules.
- Capabilities may be ignored or reinterpreted when the nexus predates them.
- A Zone may connect multiple Maps sharing a historical cause.
- Artifacts may require interactions across present state and an appropriate Time Nexus.
- The Diary of the Unintended may contain aliases associated with inaccessible/expired Zones, creating future community research targets.

## Non-negotiable boundaries

- No Zone can mutate authentication, host time, database authority, filesystem, shell or infrastructure state.
- No future guild/profession ability bypasses the retained-exception safety policy.
- No system makes every player a universal protagonist. Relevance grows through local history and social/world dependency.
- Multiversal content should create disagreements in truth, obligations and history before merely creating new scenery.
