-- +goose Up
CREATE TABLE template_versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES templates(id),
    version INTEGER NOT NULL,
    layout TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE(template_id, version)
);

-- +goose Down
DROP TABLE template_versions;
