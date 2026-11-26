package update

import "testing"

func TestSemVersionOrdering(t *testing.T) {
	ordered := []string{"1.2.9", "1.3.0-beta.1", "1.3.0-beta.2", "1.3.0", "2.0.0"}
	for i := 1; i < len(ordered); i++ {
		a, _ := parseSemVersion(ordered[i-1])
		b, _ := parseSemVersion(ordered[i])
		if compareSemVersion(a, b) >= 0 {
			t.Fatalf("expected %s < %s", ordered[i-1], ordered[i])
		}
	}
}

func TestSemVersionRejectsUnsafeOrNonCanonicalIdentifiers(t *testing.T) {
	for _, value := range []string{"1.0.0-../escape", "1.0.0-beta..1", "1.0.0-01", "1.0", "1.0.0-?"} {
		if _, err := parseSemVersion(value); err == nil {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
}

func TestSelectAssetRequiresNativePackageKind(t *testing.T) {
	assets := []Asset{{OS: "windows", Arch: "amd64", Package: "deb"}, {OS: "windows", Arch: "amd64", Package: "nsis"}}
	asset, err := selectAsset(assets, "windows", "amd64")
	if err != nil || asset.Package != "nsis" {
		t.Fatalf("expected signed native installer candidate, got %#v, %v", asset, err)
	}
}
