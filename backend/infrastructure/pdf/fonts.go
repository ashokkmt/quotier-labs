package pdf

import (
	"github.com/go-pdf/fpdf"

	"quotierlabs/backend/application/documentfonts"
)

func registerDocumentFonts(pdf *fpdf.Fpdf) {
	for _, asset := range documentfonts.Assets() {
		pdf.AddUTF8FontFromBytes(asset.PDFFamily, asset.PDFStyle, asset.TTF)
	}
}
