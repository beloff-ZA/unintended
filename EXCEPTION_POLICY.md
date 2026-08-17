# Retained Exception Policy

UNINTENDED treats some safe, interesting failures as candidates for player-retained exceptions instead of automatically flattening every discovered irregularity into a patch.

## Assessment order

1. **Security boundary first.** Authentication, authorization, secrets, admin access, filesystem, shell, arbitrary code, database authority, denial-of-service primitives, and unbounded compute/network effects are patched. They are never gameplay powers.
2. **Can it be single-player scoped?** Prefer an exception that affects only its discoverer. Cross-player mutation requires explicit consent or must be redesigned.
3. **Can it be bounded?** Powerful effects need charges, cooldowns, narrow targets, limited duration, or another deterministic ceiling.
4. **Can it be reversed or compensated?** Irreversible global damage is not a desirable retained exception.
5. **Does it create value?** No unique-item duplication and no unbounded net currency/resource creation.
6. **Can the Server remain authoritative?** The client may request an exception; only the Server decides whether it applies.
7. **Can it be audited and killed?** Every retained exception must leave a server event and have a clean disable path.

## Decisions

- **RETAIN**: safe, bounded, server-authoritative, player-scoped, reversible.
- **CONSTRAIN**: interesting but needs cooldowns, charges, target restrictions, consequences, or consent boundaries.
- **PATCH**: unsafe, unbounded, authority-breaking, economically destructive, or impossible to isolate.

The executable assessment helper lives in `packages/world-data/src/exception-policy.ts` so this is a game rule rather than merely a paragraph everyone agrees with until the first entertaining bug arrives.
