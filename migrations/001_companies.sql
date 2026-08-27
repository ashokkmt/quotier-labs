-- +goose Up
CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    legal_name TEXT,
    tax_id TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    logo_url TEXT,
    currency TEXT DEFAULT 'INR',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at DATETIME
);

-- +goose Down
DROP TABLE companies;
