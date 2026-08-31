package update

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"runtime"
	"testing"

	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	appconfig "quotierlabs/backend/infrastructure/config"
)

type fakeProvider struct {
	releases []Release
	content  map[string][]byte
}

func (p *fakeProvider) ListReleases(context.Context, string, string) ([]Release, error) {
	return p.releases, nil
}
func (p *fakeProvider) FetchMetadata(_ context.Context, target, _ string, _ int64) ([]byte, error) {
	return p.content[target], nil
}

func TestSignedCandidateCanBeSkippedAndFeedCannotMoveBackward(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	preferences := appconfig.NewStore(root + "/settings.json")
	service := NewService(appidentity.BuildInfo{
		AppID: appidentity.AppID, Version: "1.0.0", Channel: "production", Production: true, UpdatesEnabled: true,
		ReleasePublicKey: base64.StdEncoding.EncodeToString(public), Repository: "owner/repo",
	}, apppaths.Paths{CacheRoot: root, StateRoot: root}, preferences, 10)
	provider := signedProvider(t, private, "2.0.0")
	service.provider = provider

	result, err := service.Check(context.Background())
	if err != nil || result.Status != "available" || result.Candidate == nil || result.Candidate.Version != "2.0.0" {
		t.Fatalf("unexpected signed update result: %#v %v", result, err)
	}
	if err := service.SkipCurrentVersion(); err != nil {
		t.Fatal(err)
	}
	result, err = service.Check(context.Background())
	if err != nil || result.Status != "skipped" {
		t.Fatalf("expected skipped candidate, got %#v %v", result, err)
	}

	service.provider = signedProvider(t, private, "1.5.0")
	if _, err := service.Check(context.Background()); err == nil {
		t.Fatal("expected signed feed rollback protection")
	}
}

func TestManifestSignatureFailureIsNotAccepted(t *testing.T) {
	public, _, _ := ed25519.GenerateKey(rand.Reader)
	_, unrelated, _ := ed25519.GenerateKey(rand.Reader)
	root := t.TempDir()
	service := NewService(appidentity.BuildInfo{
		AppID: appidentity.AppID, Version: "1.0.0", Channel: "production", Production: true, UpdatesEnabled: true,
		ReleasePublicKey: base64.StdEncoding.EncodeToString(public), Repository: "owner/repo",
	}, apppaths.Paths{CacheRoot: root, StateRoot: root}, appconfig.NewStore(root+"/settings.json"), 10)
	service.provider = signedProvider(t, unrelated, "2.0.0")
	result, err := service.Check(context.Background())
	if err != nil || result.Status != "up-to-date" {
		t.Fatalf("untrusted release must be ignored without becoming a candidate: %#v %v", result, err)
	}
}

func signedProvider(t *testing.T, key ed25519.PrivateKey, version string) *fakeProvider {
	t.Helper()
	packageKind := map[string]string{"darwin": "pkg", "windows": "nsis", "linux": "deb"}[runtime.GOOS]
	manifest := Manifest{
		FormatVersion: 1, AppID: appidentity.AppID, Channel: "production", Version: version,
		MinimumSourceVersion: "1.0.0", DBSchemaBeforeMin: 9, DBSchemaAfter: 10,
		DocumentSchemaAfter: 5, Assets: []Asset{{OS: runtime.GOOS, Arch: runtime.GOARCH, Package: packageKind, URL: "https://github.com/update-package", Size: 100, SHA256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}},
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	manifestURL := "https://github.com/update-manifest"
	signatureURL := "https://github.com/update-signature"
	release := Release{TagName: "v" + version}
	release.Assets = append(release.Assets,
		ReleaseAsset{Name: manifestAssetName, BrowserDownloadURL: manifestURL},
		ReleaseAsset{Name: signatureAssetName, BrowserDownloadURL: signatureURL},
	)
	return &fakeProvider{releases: []Release{release}, content: map[string][]byte{
		manifestURL: raw, signatureURL: []byte(base64.StdEncoding.EncodeToString(ed25519.Sign(key, raw))),
	}}
}
