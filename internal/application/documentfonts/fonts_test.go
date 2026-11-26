package documentfonts

import "testing"

func TestCatalogContainsEveryPrintableFamilyAndStyle(t *testing.T) {
	want := map[string]bool{}
	for _, family := range []string{"sans", "serif", "mono"} {
		for _, style := range []string{"", "B", "I", "BI"} {
			want[family+":"+style] = true
		}
	}
	for _, asset := range Assets() {
		delete(want, asset.Token+":"+asset.PDFStyle)
		if len(asset.TTF) == 0 || asset.CSSFamily == "" || asset.PDFFamily == "" {
			t.Fatalf("incomplete font asset: %+v", asset)
		}
	}
	if len(want) != 0 {
		t.Fatalf("missing font variants: %v", want)
	}
}
