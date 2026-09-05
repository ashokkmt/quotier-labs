-- +goose Up
ALTER TABLE quotations ADD COLUMN expected_total INTEGER;
CREATE INDEX idx_quotations_company_id_expected_total ON quotations(company_id, expected_total);

-- +goose Down
DROP INDEX idx_quotations_company_id_expected_total;
ALTER TABLE quotations DROP COLUMN expected_total;
