-- +goose Up
-- V2.1.2 permits a draft to start without a template or customer.
ALTER TABLE quotations RENAME TO quotations_v7;
CREATE TABLE quotations (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    template_id TEXT REFERENCES templates(id),
    customer_id TEXT REFERENCES customers(id),
    number TEXT NOT NULL,
    status TEXT NOT NULL,
    document TEXT NOT NULL,
    company_snapshot TEXT,
    customer_snapshot TEXT,
    template_snapshot TEXT,
    subtotal INTEGER NOT NULL DEFAULT 0,
    discount_total INTEGER NOT NULL DEFAULT 0,
    taxable_total INTEGER NOT NULL DEFAULT 0,
    cgst_total INTEGER NOT NULL DEFAULT 0,
    sgst_total INTEGER NOT NULL DEFAULT 0,
    igst_total INTEGER NOT NULL DEFAULT 0,
    grand_total INTEGER NOT NULL DEFAULT 0,
    valid_until DATETIME,
    notes TEXT,
    schema_version INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at DATETIME,
    UNIQUE(company_id, number)
);
INSERT INTO quotations SELECT * FROM quotations_v7;
DROP TABLE quotations_v7;
CREATE INDEX idx_quotations_company_id ON quotations(company_id);
CREATE INDEX idx_quotations_company_id_status ON quotations(company_id, status);
CREATE INDEX idx_quotations_company_id_customer_id ON quotations(company_id, customer_id);
CREATE INDEX idx_quotations_created_at ON quotations(created_at);

-- +goose Down
DROP TABLE quotations;
ALTER TABLE quotations_v7 RENAME TO quotations;
