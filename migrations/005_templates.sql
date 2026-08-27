-- +goose Up
CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id),
    name TEXT NOT NULL,
    description TEXT,
    layout TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    is_builtin BOOLEAN DEFAULT 0,
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at DATETIME
);
CREATE INDEX idx_templates_company_id ON templates(company_id);

-- +goose Down
DROP TABLE templates;
