package pdf_test

import (
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"quotierlabs/backend/application/document"
	"quotierlabs/backend/domain"
	"quotierlabs/backend/domain/documentv6"
	"quotierlabs/backend/infrastructure/pdf"
)

func TestV6PDFUsesOnlyAvailableManagedImages(t *testing.T) {
	root := t.TempDir()
	file, err := os.Create(filepath.Join(root, "image.png"))
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, solidImage()); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	doc := documentv6.NewBlank("p")
	doc.Assets = []documentv6.Asset{{Source: "asset:image.png", PixelWidth: 2, PixelHeight: 2}}
	doc.Body.Content = append(doc.Body.Content, documentv6.Node{Type: "imageBlock", Attrs: rawAttrs(documentv6.ImageAttrs{ID: "image", Source: "asset:image.png", Width: 2000, Height: 2000, PixelWidth: 2, PixelHeight: 2})})
	raw, _ := json.Marshal(doc)
	input := document.GeneratorInput{Quotation: &domain.Quotation{Document: string(raw)}}
	if _, err := pdf.NewGeneratorWithAssetRoot(root).Generate(context.Background(), input); err != nil {
		t.Fatal(err)
	}
	if _, err := pdf.NewGeneratorWithAssetRoot(t.TempDir()).Generate(context.Background(), input); err == nil {
		t.Fatal("expected a missing managed image to be rejected")
	}
}

func solidImage() image.Image {
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	for y := 0; y < 2; y++ {
		for x := 0; x < 2; x++ {
			img.Set(x, y, color.Black)
		}
	}
	return img
}

func rawAttrs(value any) json.RawMessage {
	raw, _ := json.Marshal(value)
	return raw
}
