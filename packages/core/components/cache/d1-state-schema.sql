-- D1 schema for the state protocol (@ti-engine/core, design/state-protocol.md), as answered by
-- `@ti-engine/core/state-service`. Apply it once to the database the Worker binds:
--
--     wrangler d1 execute <binding> --remote --file=node_modules/@ti-engine/core/components/cache/d1-state-schema.sql
--
-- Every statement is `IF NOT EXISTS`, so re-applying it after an upgrade adds what is new and touches nothing else.
--
-- Plain values, hash fields and whole documents each have a table, because `keys/match` enumerates live keys and a
-- union of three indexed scans reads better than one filtered one. `expires_at` is epoch milliseconds, NULL for never;
-- every read filters on it and `sweepExpired` removes the remains.

CREATE TABLE IF NOT EXISTS state_values (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS state_hash_fields (
    hash       TEXT NOT NULL,
    field      TEXT NOT NULL,
    value      TEXT NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY ( hash, field )
);

CREATE TABLE IF NOT EXISTS state_documents (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS state_values_expires_at ON state_values ( expires_at );
CREATE INDEX IF NOT EXISTS state_hash_fields_expires_at ON state_hash_fields ( expires_at );
CREATE INDEX IF NOT EXISTS state_documents_expires_at ON state_documents ( expires_at );

-- Partitioned documents: a document whose key the service's partition spec names is kept one row per entity, so an
-- application collection is never one row (D1 caps a row at 2 MB) and an edit to one entity re-writes only that one.
-- `path` is the entity's path as a JSON array; '[]' is the key's marker row, which is what "the key exists" means.
-- `leaf` is the path's last segment, which answers a wildcard read by id (`*.<evaluationID>`) from an index.
CREATE TABLE IF NOT EXISTS state_partitions (
    key   TEXT NOT NULL,
    path  TEXT NOT NULL,
    leaf  TEXT,
    value TEXT NOT NULL,
    PRIMARY KEY ( key, path )
);

CREATE INDEX IF NOT EXISTS state_partitions_leaf ON state_partitions ( key, leaf );

-- Only the marker rows. `keys/match` lists a partitioned key by its marker, and without this index it read every entity
-- row of every partitioned key to find them — 5,511 rows for eleven markers, measured; D1 bills rows read.
CREATE INDEX IF NOT EXISTS state_partitions_markers ON state_partitions ( key ) WHERE path = '[]';
