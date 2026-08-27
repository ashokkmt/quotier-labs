-- +goose Up
CREATE TABLE number_sequences (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    document_type TEXT NOT NULL,
    prefix TEXT NOT NULL,
    pattern TEXT NOT NULL,
    current_value INTEGER NOT NULL DEFAULT 0,
    year INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at DATETIME,
    UNIQUE(company_id, document_type, year)
);

-- +goose Down
DROP TABLE number_sequences;
