-- +goose Up
CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at DATETIME,
    UNIQUE(company_id, key)
);

-- +goose Down
DROP TABLE settings;
