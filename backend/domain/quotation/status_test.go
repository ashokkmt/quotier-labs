package quotation_test

import (
	"quotierlabs/backend/domain/quotation"
	"testing"
)

func TestStatusTransitions(t *testing.T) {
	tests := []struct {
		from    quotation.Status
		to      quotation.Status
		wantErr bool
	}{
		{quotation.StatusDraft, quotation.StatusFinalized, false},
		{quotation.StatusDraft, quotation.StatusSent, true},
		{quotation.StatusFinalized, quotation.StatusSent, false},
		{quotation.StatusSent, quotation.StatusAccepted, false},
		{quotation.StatusSent, quotation.StatusRejected, false},
		{quotation.StatusSent, quotation.StatusExpired, false},
		{quotation.StatusAccepted, quotation.StatusDraft, true},
		{quotation.StatusFinalized, quotation.StatusDraft, true},
	}

	for _, tt := range tests {
		t.Run(string(tt.from)+"_to_"+string(tt.to), func(t *testing.T) {
			err := quotation.ValidateTransition(tt.from, tt.to)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateTransition() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
