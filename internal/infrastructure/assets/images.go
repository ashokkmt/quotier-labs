package assets

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"path/filepath"
	"strings"

	_ "golang.org/x/image/webp"
)

const (
	MaxImageBytes     = 5 << 20
	MaxImageDimension = 12_000
	MaxImagePixels    = 50_000_000
)

var mimeByExtension = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
}

func MIMEForExtension(ext string) string {
	return mimeByExtension[strings.ToLower(ext)]
}

// ValidateImage verifies both the encoded type and decoded dimensions before
// bytes enter the managed asset store. DecodeConfig avoids allocating the full
// bitmap, while the pixel limit prevents small compressed image bombs.
func ValidateImage(raw []byte, ext string) error {
	if len(raw) == 0 || len(raw) > MaxImageBytes {
		return errors.New("image is empty or exceeds the 5MB size limit")
	}
	want := MIMEForExtension(filepath.Ext(ext))
	if want == "" {
		want = MIMEForExtension(ext)
	}
	if want == "" {
		return errors.New("unsupported image format")
	}
	if detected := http.DetectContentType(raw); detected != want {
		return errors.New("image content does not match its extension")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return errors.New("image content could not be decoded")
	}
	if format == "jpeg" {
		format = "jpg"
	}
	wantFormat := strings.TrimPrefix(strings.ToLower(filepath.Ext(ext)), ".")
	if wantFormat == "jpeg" {
		wantFormat = "jpg"
	}
	if format != wantFormat {
		return errors.New("decoded image format does not match its extension")
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > MaxImageDimension || config.Height > MaxImageDimension || int64(config.Width)*int64(config.Height) > MaxImagePixels {
		return fmt.Errorf("image dimensions exceed the supported limit")
	}
	return nil
}
