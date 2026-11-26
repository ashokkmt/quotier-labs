package documentv6

import "testing"

func TestStyleResolutionUsesCatalogThenDirectParagraphOverrides(t *testing.T) {
	doc := NewBlank("p")
	style, err := ResolveParagraphStyle(doc, ParagraphAttrs{Style: "Title", Alignment: "right", SpacingAfter: 300, HangingIndent: 900})
	if err != nil {
		t.Fatal(err)
	}
	if style.FontSize != 2400 || !style.Bold || style.Alignment != "right" || style.SpacingAfter != 300 || style.HangingIndent != 900 {
		t.Fatalf("unexpected style cascade: %+v", style)
	}
	doc.Styles = nil
	style, err = ResolveParagraphStyle(doc, ParagraphAttrs{Style: "Body"})
	if err != nil || style.FontFamily != "Quotier Sans" || style.SpacingAfter != 600 {
		t.Fatalf("missing persisted styles did not use the compatible catalog: %+v %v", style, err)
	}
}
