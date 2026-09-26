# Code Health and Context Efficiency

These are separate concerns and should use separate tools.

## Code health

Use:

~~~text
Code Hygiene skill
      ↓
stack-specific dead-code analyzer
      ↓
Graphify + source verification
      ↓
tests/build/runtime checks
      ↓
reviewed cleanup
~~~

For JavaScript/TypeScript, Knip is the preferred default candidate when compatible. It can find unused files, exports and dependencies. Automated fixes are optional and must remain reviewable.

## Context efficiency

Use:

~~~text
Project Memory
+ Current Handoff
+ targeted source retrieval
+ Graphify
+ retry guard
      ↓
Headroom pilot only if still needed
~~~

Headroom compresses/retrieves context; it does not remove dead code.

## Order matters

Do not install an optimization tool before establishing a baseline.

1. Keep durable memory compact.
2. Use targeted retrieval.
3. Use Graphify to narrow code context.
4. Keep logs/tool output focused.
5. Measure remaining context pressure.
6. Pilot Headroom if the problem is still material.

Similarly, do not run auto-delete first.

1. Configure real project entry points.
2. Generate dead-code report.
3. Verify findings.
4. Remove small confirmed batches.
5. Test.
6. Repeat.

## Success criteria

A healthy setup should improve repository clarity, dependency count, agent context size, task latency and quota/token efficiency without degrading correctness, first-pass success, review quality, accessibility, security or runtime behavior.