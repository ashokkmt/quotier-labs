package wails

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"
)

const (
	maxDOCXFiles             = 512
	maxDOCXUncompressedBytes = 64 << 20
)

type docxRelationships struct {
	Items []struct {
		Type       string `xml:"Type,attr"`
		Target     string `xml:"Target,attr"`
		TargetMode string `xml:"TargetMode,attr"`
	} `xml:"Relationship"`
}

func validateDOCXPackage(raw []byte) error {
	reader, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil || len(reader.File) == 0 || len(reader.File) > maxDOCXFiles {
		return fmt.Errorf("invalid DOCX package")
	}
	required := map[string]bool{"[Content_Types].xml": false, "_rels/.rels": false, "word/document.xml": false}
	seen := make(map[string]struct{}, len(reader.File))
	var total uint64
	for _, file := range reader.File {
		name := file.Name
		cleanName := strings.TrimSuffix(name, "/")
		clean := path.Clean(cleanName)
		if cleanName == "" || clean != cleanName || strings.HasPrefix(name, "/") || strings.Contains(name, "\\") || strings.HasPrefix(clean, "../") {
			return fmt.Errorf("unsafe DOCX package path")
		}
		if _, duplicate := seen[name]; duplicate {
			return fmt.Errorf("DOCX package contains duplicate parts")
		}
		seen[name] = struct{}{}
		lower := strings.ToLower(name)
		if strings.HasSuffix(lower, ".bin") || strings.Contains(lower, "vbaproject") || strings.Contains(lower, "/embeddings/") || strings.Contains(lower, "/activex/") || strings.HasPrefix(lower, "customui/") {
			return fmt.Errorf("DOCX package contains executable or embedded content")
		}
		total += file.UncompressedSize64
		if total > maxDOCXUncompressedBytes || file.UncompressedSize64 > maxDOCXUncompressedBytes {
			return fmt.Errorf("DOCX package exceeds the expanded size limit")
		}
		if _, ok := required[name]; ok {
			required[name] = true
		}
		if strings.HasSuffix(lower, ".xml") {
			content, readErr := readBoundedZipFile(file, 16<<20)
			if readErr != nil || validateDOCXXML(content) != nil {
				return fmt.Errorf("DOCX package contains malformed XML")
			}
			if name == "[Content_Types].xml" && bytes.Contains(bytes.ToLower(content), []byte("macroenabled")) {
				return fmt.Errorf("DOCX package contains unsupported content types")
			}
		}
		if strings.HasSuffix(lower, ".rels") {
			content, readErr := readBoundedZipFile(file, 2<<20)
			if readErr != nil || validateDOCXRelationships(content) != nil {
				return fmt.Errorf("DOCX package contains unsafe relationships")
			}
		}
	}
	for _, present := range required {
		if !present {
			return fmt.Errorf("DOCX package is missing required parts")
		}
	}
	return nil
}

func validateDOCXXML(raw []byte) error {
	decoder := xml.NewDecoder(bytes.NewReader(raw))
	seenRoot := false
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			if !seenRoot {
				return fmt.Errorf("XML root is missing")
			}
			return nil
		}
		if err != nil {
			return err
		}
		if _, ok := token.(xml.StartElement); ok {
			seenRoot = true
		}
	}
}

func readBoundedZipFile(file *zip.File, limit int64) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	raw, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil || int64(len(raw)) > limit {
		return nil, fmt.Errorf("DOCX part exceeds size limit")
	}
	return raw, nil
}

func validateDOCXRelationships(raw []byte) error {
	var relationships docxRelationships
	if err := xml.Unmarshal(raw, &relationships); err != nil {
		return err
	}
	for _, relationship := range relationships.Items {
		if strings.EqualFold(relationship.TargetMode, "External") {
			if !strings.HasSuffix(relationship.Type, "/hyperlink") || !safeDOCXHyperlink(relationship.Target) {
				return fmt.Errorf("unsafe external relationship")
			}
			continue
		}
		clean := path.Clean(relationship.Target)
		if relationship.Target == "" || strings.HasPrefix(relationship.Target, "/") || strings.Contains(relationship.Target, "\\") || strings.HasPrefix(clean, "../") {
			return fmt.Errorf("unsafe internal relationship")
		}
	}
	return nil
}

func safeDOCXHyperlink(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return false
	}
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != "" || parsed.Scheme == "mailto" && parsed.Opaque != ""
}
