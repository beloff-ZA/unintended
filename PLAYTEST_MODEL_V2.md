# UNINTENDED Playtest Model V2

Status: proposed gameplay model derived from simulation of the current build. This document does not claim the runtime already implements these changes.

## Simulation basis

The current build was evaluated through six scripted player styles plus 20,000 randomized action traces at 10, 20 and 40 actions.

Player styles:
- literal novice
- natural-language explorer
- question-first investigator
- synonym brute-forcer
- direction-first navigator
- category-driven reasoner

## What the current build does well

- Exact commands create a fast, understandable discovery loop.
- The action-category panel gives useful evidence that whole classes of interaction remain undiscovered without exposing a full command list.
- Shape and humorous direction labels produce memorable spatial vocabulary.
- Questions are recognized as a first-class interaction rather than requiring one rigid ASK syntax.
- The Memory Field gives a strong second channel of understanding beside the terminal.

## Simulation failures

### 1. Semantic proximity can become a dead end
A player using several good synonyms can repeatedly receive proximity feedback without ever gaining the concept. This eventually rewards guessing the exact canonical verb instead of reasoning.

### 2. Repeated questions eventually beat the randomizer
Question usefulness currently has no repetition memory. Repeating the same well-formed question creates independent chances of receiving a useful fact, so persistence is stronger than insight.

### 3. Memory reveals evidence the player did not gather
A fresh player can receive inferred neighboring topology because all exits from any visited location are currently added to the Memory Field. Being physically present should not be equivalent to understanding every connection.

### 4. The original anomaly sequences are too common
Randomized ordinary play generated approximate 20-action pattern-hit rates of:
- Deferred Possession: 42 percent
- Bridge Return: 63 percent
- Bread Ledger: 72 percent
- Courier Gap: 44 percent
- Wet Key: 8 percent with occasional server-toy activity

Courier Gap also cannot currently complete because successful DROP does not emit ITEM_DROPPED.

## Improved discovery model

### Semantic pressure

Distinct intelligent approximations should create persistent pressure toward a concept.

Suggested progression:
1. First distinct close phrase: category-level acknowledgement.
2. Second distinct close phrase: stronger acknowledgement that the wording is near a real concept.
3. Third distinct close phrase: the Server concedes the concept.

Repeating the same phrase adds no pressure.

A movement-like phrase using an already-observed direction may bypass the normal threshold because the player has demonstrated enough context to make the intention unambiguous.

Example:

`stroll`
The Server files that under MOVEMENT provisionally.

`wander`
You continue describing something the world appears to recognize.

`walk`
CONCEPT INFERRED: MOVE

This makes exact vocabulary one discovery route rather than the only route.

## Improved inquiry model

Each inquiry should receive a hidden probe-quality score based on:
- specificity
- subject relevance
- local evidence
- related concepts already known
- novelty of phrasing
- whether the question improves on earlier attempts

Repeated inquiry signatures should receive a diminishing-return penalty.

Suggested response tiers:
- revealing: rare authored clue
- useful: directly relevant fact
- oblique: useful fact wrapped in Server attitude
- administrative: responsive but strategically weak
- refusal: context-aware response with no useful fact

A repeated vague question should become less productive. A more precise follow-up should improve the odds again.

## Improved Memory Field model

The Memory Field should represent evidence, not canonical world truth.

Fresh player:
- current location only
- no adjacent nodes
- no direction vocabulary

After LOOK:
- current location becomes observed
- visible exits appear as inferred neighboring nodes
- direction shapes and labels for those observed exits become known

After movement:
- traversed edge becomes known
- destination becomes visited
- unobserved exits from the new location remain hidden until investigated

The total number of direction types in the seed remains hidden. The UI reports only remembered tendencies.

## Improved direction model

Retain the seeded 3 to 9 direction vocabulary.

Each direction keeps:
- stable shape
- seeded humorous label
- hidden topological meaning

Examples:
- square: Way Out
- star: Broadway
- cross: Wrong Way
- triangle: The Long Way

Players may refer to a direction by shape, label, known destination or semantically valid movement phrase.

Direction discovery should be evidence-gated through observation or traversal.

## Improved anomaly model

The next anomaly layer should use contextual pattern steps rather than event type alone.

A step may constrain:
- event type
- target object
- location
- payload values such as previous location or server event

This prevents ordinary event pairs from granting a unique anomaly simply because someone happened to walk twice.

The longer-term model should go further: the anomaly should be discovered when an action that ought to fail actually succeeds. That impossible success should be the moment the exception is retained.

## Event corrections

Successful DROP should emit ITEM_DROPPED with:
- player
- item ID
- location

Movement events should retain the traversed direction key when known so the Memory Field can reconstruct what the player actually experienced.

Semantic probes and inquiries should be recorded as lightweight events so novelty and repetition can be evaluated without adding a new global tick or a separate persistence system.

## Resulting gameplay loop

Raw input
-> semantic interpretation
-> context check
-> exact action, semantic pressure, inquiry or direction resolution
-> novelty/repetition weighting
-> result
-> persistent event
-> concept / anomaly / memory update

The intended effect is that experimentation creates knowledge, precise questions statistically outperform spam, and the map grows from evidence rather than from server omniscience.
