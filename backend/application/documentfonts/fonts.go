// Package documentfonts owns the immutable font resources used by every printable projection.
// Keeping these files in one catalog prevents the canvas, layout resolver, preview, and export
// from silently substituting different platform fonts.
package documentfonts

import (
	"github.com/go-fonts/liberation/liberationmonobold"
	"github.com/go-fonts/liberation/liberationmonobolditalic"
	"github.com/go-fonts/liberation/liberationmonoitalic"
	"github.com/go-fonts/liberation/liberationmonoregular"
	"github.com/go-fonts/liberation/liberationsansbold"
	"github.com/go-fonts/liberation/liberationsansbolditalic"
	"github.com/go-fonts/liberation/liberationsansitalic"
	"github.com/go-fonts/liberation/liberationsansregular"
	"github.com/go-fonts/liberation/liberationserifbold"
	"github.com/go-fonts/liberation/liberationserifbolditalic"
	"github.com/go-fonts/liberation/liberationserifitalic"
	"github.com/go-fonts/liberation/liberationserifregular"
)

const (
	SansPDF  = "QuotierSans"
	SerifPDF = "QuotierSerif"
	MonoPDF  = "QuotierMono"
)

type Asset struct {
	Token     string
	CSSFamily string
	PDFFamily string
	PDFStyle  string
	Weight    int
	Italic    bool
	TTF       []byte
}

// Assets returns the complete controlled font catalog. Liberation is OFL-licensed and metrically
// compatible with the familiar Arial/Times New Roman/Courier New families previously exposed by
// the editor, while remaining identical and embeddable on macOS and Windows.
func Assets() []Asset {
	return []Asset{
		{Token: "sans", CSSFamily: "Quotier Sans", PDFFamily: SansPDF, Weight: 400, TTF: liberationsansregular.TTF},
		{Token: "sans", CSSFamily: "Quotier Sans", PDFFamily: SansPDF, PDFStyle: "B", Weight: 700, TTF: liberationsansbold.TTF},
		{Token: "sans", CSSFamily: "Quotier Sans", PDFFamily: SansPDF, PDFStyle: "I", Weight: 400, Italic: true, TTF: liberationsansitalic.TTF},
		{Token: "sans", CSSFamily: "Quotier Sans", PDFFamily: SansPDF, PDFStyle: "BI", Weight: 700, Italic: true, TTF: liberationsansbolditalic.TTF},
		{Token: "serif", CSSFamily: "Quotier Serif", PDFFamily: SerifPDF, Weight: 400, TTF: liberationserifregular.TTF},
		{Token: "serif", CSSFamily: "Quotier Serif", PDFFamily: SerifPDF, PDFStyle: "B", Weight: 700, TTF: liberationserifbold.TTF},
		{Token: "serif", CSSFamily: "Quotier Serif", PDFFamily: SerifPDF, PDFStyle: "I", Weight: 400, Italic: true, TTF: liberationserifitalic.TTF},
		{Token: "serif", CSSFamily: "Quotier Serif", PDFFamily: SerifPDF, PDFStyle: "BI", Weight: 700, Italic: true, TTF: liberationserifbolditalic.TTF},
		{Token: "mono", CSSFamily: "Quotier Mono", PDFFamily: MonoPDF, Weight: 400, TTF: liberationmonoregular.TTF},
		{Token: "mono", CSSFamily: "Quotier Mono", PDFFamily: MonoPDF, PDFStyle: "B", Weight: 700, TTF: liberationmonobold.TTF},
		{Token: "mono", CSSFamily: "Quotier Mono", PDFFamily: MonoPDF, PDFStyle: "I", Weight: 400, Italic: true, TTF: liberationmonoitalic.TTF},
		{Token: "mono", CSSFamily: "Quotier Mono", PDFFamily: MonoPDF, PDFStyle: "BI", Weight: 700, Italic: true, TTF: liberationmonobolditalic.TTF},
	}
}
