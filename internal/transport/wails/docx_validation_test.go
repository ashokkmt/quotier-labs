package wails

import (
	"archive/zip"
	"bytes"
	"testing"
)

func TestValidateDOCXPackage(t *testing.T) {
	validRelationships := `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
	valid := docxFixture(t, map[string]string{
		"word/":                        "",
		"[Content_Types].xml":          `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
		"_rels/.rels":                  validRelationships,
		"word/document.xml":            `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`,
		"word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://quotier.example" TargetMode="External"/></Relationships>`,
	})
	if err := validateDOCXPackage(valid); err != nil {
		t.Fatalf("valid package rejected: %v", err)
	}

	for name, files := range map[string]map[string]string{
		"path traversal": {
			"[Content_Types].xml": "<Types/>", "_rels/.rels": validRelationships, "word/document.xml": "<document/>", "../payload": "bad",
		},
		"external image": {
			"[Content_Types].xml": "<Types/>", "_rels/.rels": validRelationships, "word/document.xml": "<document/>", "word/_rels/document.xml.rels": `<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/a.png" TargetMode="External"/></Relationships>`,
		},
		"macro": {
			"[Content_Types].xml": "<Types/>", "_rels/.rels": validRelationships, "word/document.xml": "<document/>", "word/vbaProject.bin": "bad",
		},
	} {
		t.Run(name, func(t *testing.T) {
			if err := validateDOCXPackage(docxFixture(t, files)); err == nil {
				t.Fatal("unsafe package was accepted")
			}
		})
	}
}

func docxFixture(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	for name, content := range files {
		file, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}
