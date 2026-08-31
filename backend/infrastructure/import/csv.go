package csvimport

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"

	"quotierlabs/backend/domain"
	backup_domain "quotierlabs/backend/domain/backup"
)

type CSVImportService struct {
	customerRepo domain.CustomerRepository
}

func NewCSVImportService(cRepo domain.CustomerRepository) *CSVImportService {
	return &CSVImportService{customerRepo: cRepo}
}

func (s *CSVImportService) PreviewCustomers(path string) (*backup_domain.ImportPreview, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	headers, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read headers: %w", err)
	}

	var rows []backup_domain.ImportPreviewRow
	index := 0
	for {
		record, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // skip errors for now
		}

		data := make(map[string]string)
		for i, h := range headers {
			if i < len(record) {
				data[h] = record[i]
			}
		}

		isValid := len(data) > 0
		var errors []string

		rows = append(rows, backup_domain.ImportPreviewRow{
			Index:   index,
			Data:    data,
			IsValid: isValid,
			Errors:  errors,
		})
		index++
	}

	validCount := 0
	for _, r := range rows {
		if r.IsValid {
			validCount++
		}
	}

	return &backup_domain.ImportPreview{
		Headers: headers,
		Rows:    rows,
		Total:   len(rows),
		Valid:   validCount,
	}, nil
}

func (s *CSVImportService) ImportCustomers(ctx context.Context, companyID string, path string, mapping backup_domain.ImportMapping) (int, error) {
	preview, err := s.PreviewCustomers(path)
	if err != nil {
		return 0, err
	}

	imported := 0
	for _, row := range preview.Rows {
		if !row.IsValid {
			continue
		}

		// map fields
		name := row.Data[mapping.Name]
		if name == "" {
			continue
		}

		email := row.Data[mapping.Email]
		phone := row.Data[mapping.Phone]
		address := row.Data[mapping.Address]
		gstin := row.Data[mapping.GSTIN]
		pan := row.Data[mapping.PAN]

		cust := &domain.Customer{
			CompanyID: companyID,
			Name:      name,
		}
		if email != "" {
			cust.Email = &email
		}
		if phone != "" {
			cust.Phone = &phone
		}
		if address != "" {
			cust.Address = &address
		}
		if gstin != "" {
			cust.GSTIN = &gstin
		}
		if pan != "" {
			cust.PAN = &pan
		}

		// Ideally wrap in tx or handle duplicates gracefully. For MVP, just create.
		if err := s.customerRepo.Create(ctx, cust); err == nil {
			imported++
		}
	}

	return imported, nil
}
