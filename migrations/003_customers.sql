-- +goose Up
CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    company_name TEXT,
    contact_person TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    pan TEXT,
    state TEXT,
    country TEXT,
    billing_address TEXT,
    shipping_address TEXT,
    notes TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at DATETIME
);
CREATE INDEX idx_customers_company_id ON customers(company_id);
CREATE INDEX idx_customers_company_id_name ON customers(company_id, name);

-- +goose Down
DROP TABLE customers;
