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
