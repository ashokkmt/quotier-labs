-- +goose Up
ALTER TABLE companies ADD COLUMN state TEXT;
ALTER TABLE companies ADD COLUMN gstin TEXT;
ALTER TABLE companies ADD COLUMN pan TEXT;
ALTER TABLE companies ADD COLUMN bank_details TEXT;
ALTER TABLE companies ADD COLUMN signature_url TEXT;
ALTER TABLE companies ADD COLUMN stamp_url TEXT;

-- +goose Down
-- SQLite does not support DROP COLUMN easily before 3.35.0, but we can just leave it or use a complex recreation.
-- Since this is Goose, we'll just omit the down migration for these columns or use simple DROP COLUMN (SQLite 3.35+ supports it).
ALTER TABLE companies DROP COLUMN state;
ALTER TABLE companies DROP COLUMN gstin;
ALTER TABLE companies DROP COLUMN pan;
ALTER TABLE companies DROP COLUMN bank_details;
ALTER TABLE companies DROP COLUMN signature_url;
ALTER TABLE companies DROP COLUMN stamp_url;
