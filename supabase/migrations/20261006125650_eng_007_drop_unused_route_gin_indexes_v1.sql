-- ENG-007 cleanup: the resolver uses deterministic bounded scans over a tiny private route registry.
-- The initial GIN indexes are not used by the current matching algorithm and add no value at this scale.
drop index if exists private.intent_routing_registry_aliases_gin;
drop index if exists private.intent_routing_registry_topics_gin;
