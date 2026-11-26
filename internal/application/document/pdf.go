package document

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

func (s *Service) GenerateFinalPDF(ctx context.Context, companyID, quotationID string) (string, error) {
	bytes, err := s.GeneratePreviewPDF(ctx, companyID, quotationID)
	if err != nil {
		return "", err
	}

	q, err := s.quotationRepo.GetByID(ctx, quotationID, companyID)
	if err != nil {
		return "", err
	}

	// Determine save path - could be configurable, defaulting to Documents or Desktop for MVP
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get home dir: %w", err)
	}

	fileName := fmt.Sprintf("%s.pdf", q.Number)
	filePath := filepath.Join(homeDir, "Desktop", fileName)

	if err := os.WriteFile(filePath, bytes, 0644); err != nil {
		return "", fmt.Errorf("write pdf file: %w", err)
	}

	return filePath, nil
}
