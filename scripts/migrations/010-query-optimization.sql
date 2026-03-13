-- 010: Query optimization indexes
-- Adds composite index for orphan detection (Q7) and drops redundant indexes.
-- Context: docs/22-d1-query-optimization.md

-- New index: benefits Q7 orphan detection query + alias validation
CREATE INDEX IF NOT EXISTS idx_session_user_source_project
  ON session_records(user_id, source, project_ref);

-- Drop redundant: exact duplicate of UNIQUE autoindex on (user_id, source, project_ref)
DROP INDEX IF EXISTS idx_project_aliases_lookup;

-- Drop redundant: all queries filtering on source always have user_id first,
-- so the composite idx_usage_user_time is preferred by the query planner
DROP INDEX IF EXISTS idx_usage_source;

-- Drop redundant: same reasoning — source is always filtered with user_id
DROP INDEX IF EXISTS idx_session_source;

-- Drop redundant: kind is always filtered with user_id
DROP INDEX IF EXISTS idx_session_kind;
