# UNINTENDED playtest-derived model

This model was derived from scripted persona simulations of the current MVP plus 20,000 randomized 10/20/40-action traces used to pressure-test discovery and anomaly frequency.

## Simulated player styles

- Literal novice: uses exact verbs and progresses quickly.
- Natural-language explorer: prefers synonyms such as `grab`, `stroll`, `inspect`, and `find`.
- Questioner: probes people, objects, place and causality primarily through questions.
- Synonym brute-forcer: tries many related verbs without knowing canonical vocabulary.
- Direction-first explorer: navigates from observed shape/label cues rather than command vocabulary.
- Category reasoner: uses the discovered-action categories as evidence about missing concepts.

## Findings

### 1. Semantic proximity was informative but not progressive
A player could try several distinct good synonyms and remain permanently one word away from the canonical concept. This rewarded guessing exact vocabulary rather than reasoning.

**Model change:** distinct semantically-close probes now accumulate semantic pressure. Repeating the same wording does not. Three distinct probes can cause the Server to concede the concept. A valid semantic movement phrase that uses an observed direction may work immediately and reveal MOVE through use.

### 2. Inquiry could be brute-forced
Useful-answer chance was independent on each repetition, so repeating the same question eventually produced a useful fact with very high probability.

**Model change:** question usefulness is weighted by specificity, local relevance and novelty. Repeating the same inquiry signature reduces useful probability. Reformulating a more specific question restores some value. The Server remains bounded to observed/authored facts.

### 3. Memory leaked topology
The initial Memory Field inferred every exit from every visited location, including the starting location before the player had LOOKed or traversed anything.

**Model change:** a fresh character remembers only the current location. LOOK reveals adjacent inferred nodes and direction cues. Movement records the traversed edge. The UI exposes only remembered direction tendencies, never the world's total direction count.

### 4. Anomalies were too statistically ordinary
With the original type-only two-event patterns, randomized ordinary play produced the following approximate chance of satisfying a pattern within 20 actions:

- Deferred Possession: 42%
- Bridge Return: 63%
- Bread Ledger: 72%
- Courier Gap: 44%
- Wet Key: 8% with occasional server-toy use

Courier Gap additionally could not trigger in the actual engine because DROP emitted no ITEM_DROPPED event.

**Model change:** DROP now records the dropped item. Designed anomaly patterns are contextual and may constrain target, location and event payload. The five MVP anomaly sequences now require specific world interactions rather than generic adjacent event types.

## Current interaction model

1. Raw input
2. Semantic resolver
3. Exact command, semantic proximity, inquiry, or direction interpretation
4. Context validation
5. Progress pressure / novelty weighting
6. World action or bounded response
7. Events
8. Concept, anomaly and memory updates

## Discovery rule

Exact vocabulary is one route to knowledge, not the only route. Distinct intelligent approximations should eventually teach the player what the world calls the thing they are already reasoning about. Repetition without new information should become progressively less rewarding.

## Memory rule

The Memory Field represents evidence, not server truth. Current position is known. Traversed connections are known. Connections observed by LOOK may be inferred. Unobserved world topology remains absent.

## Anomaly rule

An anomaly should require a meaningful contextual sequence and eventually a genuine contradiction/exception. Contextual matching is now the baseline. Future anomaly work should move from sequence recognition toward exceptional-action predicates where the impossible action itself is what grants the retained exception.
