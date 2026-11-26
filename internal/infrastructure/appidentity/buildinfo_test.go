package appidentity

import "testing"

func TestNormaliseChannel(t *testing.T) {
	for _, tc := range []struct{ channel, version, want string }{
		{"production", "1.0.0", "production"},
		{"beta", "1.0.0-beta.1", "beta"},
		{"", "1.0.0-beta.2", "beta"},
		{"unexpected", "1.0.0", "development"},
	} {
		if got := normaliseChannel(tc.channel, tc.version); got != tc.want {
			t.Fatalf("normaliseChannel(%q, %q)=%q, want %q", tc.channel, tc.version, got, tc.want)
		}
	}
}

func TestUnsignedTaggedBuildEnablesOnlyManualUpdates(t *testing.T) {
	originalVersion, originalChannel := Version, Channel
	originalKey, originalManual := ReleasePublicKey, ManualUpdates
	t.Cleanup(func() {
		Version, Channel = originalVersion, originalChannel
		ReleasePublicKey, ManualUpdates = originalKey, originalManual
	})
	Version, Channel = "1.3.0-beta.2", "beta"
	ReleasePublicKey, ManualUpdates = "", "true"

	build := Current()
	if !build.Production || build.UpdatesEnabled || !build.ManualUpdates {
		t.Fatalf("unexpected unsigned release capabilities: %#v", build)
	}

	ReleasePublicKey = "embedded-trust-key"
	build = Current()
	if !build.UpdatesEnabled || build.ManualUpdates {
		t.Fatalf("signed releases must not use advisory-only updates: %#v", build)
	}
}
