package documentlayout

import "testing"

type fixedMetrics struct{}

func (fixedMetrics) AverageCharWidthMM(float64, TextStyle) float64 { return 1 }
func (fixedMetrics) LineHeightMM(float64) float64                 { return 4 }
func (fixedMetrics) TextWidthMM(text string, _ float64, _ TextStyle) float64 {
	return float64(len([]rune(text)))
}

func TestMeasuredTextHeightWrapsWordsAndPreservesBlankLines(t *testing.T) {
	if got := MeasuredTextHeightMM("abcd\n", 2, 10, TextStyle{}, fixedMetrics{}); got != 12 {
		t.Fatalf("height = %v, want 12", got)
	}
}
