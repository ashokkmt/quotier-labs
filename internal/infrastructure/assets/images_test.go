package assets

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestValidateImageChecksEncodedTypeAndDimensions(t *testing.T) {
	bitmap := image.NewRGBA(image.Rect(0, 0, 32, 24))
	bitmap.Set(1, 1, color.RGBA{R: 255, A: 255})
	var raw bytes.Buffer
	if err := png.Encode(&raw, bitmap); err != nil {
		t.Fatal(err)
	}
	if err := ValidateImage(raw.Bytes(), ".png"); err != nil {
		t.Fatalf("valid PNG rejected: %v", err)
	}
	if err := ValidateImage(raw.Bytes(), ".jpg"); err == nil {
		t.Fatal("expected extension/content mismatch")
	}
	if err := ValidateImage([]byte("not an image"), ".png"); err == nil {
		t.Fatal("expected malformed image rejection")
	}
}
