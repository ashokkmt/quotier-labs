package quotation

import "testing"

func TestParseV4ContainerWidgetDocument(t *testing.T) {
	doc, err := ParseDocument(`{"schema_version":4,"root":{"id":"root","role":"root","type":"root","children":[{"id":"row","role":"container","type":"container","layout":{"direction":"horizontal"},"meta":{"visible":true,"optional":false},"children":[{"id":"text","role":"widget","type":"field.text","props":{"value":"Hello"},"meta":{"visible":true,"optional":false},"children":[]}] }]}}`)
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Children) != 1 || doc.Children[0].Kind != "container" || doc.Children[0].Children[0].Kind != "widget" {
		t.Fatalf("V4 tree was not parsed: %#v", doc.Children)
	}
	if err := ValidateDocument(doc); err != nil {
		t.Fatal(err)
	}
}
