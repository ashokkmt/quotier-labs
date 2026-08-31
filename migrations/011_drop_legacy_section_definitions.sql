-- +goose Up
DROP TABLE IF EXISTS section_definitions;

-- +goose Down
CREATE TABLE section_definitions (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id),
    name TEXT NOT NULL,
    description TEXT,
    schema TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    is_builtin BOOLEAN DEFAULT 0,
    category TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at DATETIME
);
CREATE INDEX idx_section_definitions_company_id ON section_definitions(company_id);
CREATE INDEX idx_section_definitions_is_builtin ON section_definitions(is_builtin);
