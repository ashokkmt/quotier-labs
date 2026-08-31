package update

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"quotierlabs/backend/domain/documentmodel"
	"quotierlabs/backend/infrastructure/appidentity"
	"quotierlabs/backend/infrastructure/apppaths"
	appconfig "quotierlabs/backend/infrastructure/config"
	"quotierlabs/backend/infrastructure/fileutil"
)

const (
	manifestAssetName  = "quotierlabs-update.json"
	signatureAssetName = "quotierlabs-update.json.sig"
	maxManifestSize    = 2 << 20
	maxUpdateSize      = int64(1024 << 20)
)

type Asset struct {
	OS      string `json:"os"`
	Arch    string `json:"arch"`
	Package string `json:"package"`
	URL     string `json:"url"`
	Size    int64  `json:"size"`
	SHA256  string `json:"sha256"`
}

type Manifest struct {
	FormatVersion        int     `json:"format_version"`
	AppID                string  `json:"app_id"`
	Channel              string  `json:"channel"`
	Version              string  `json:"version"`
	PublishedAt          string  `json:"published_at"`
	ReleaseURL           string  `json:"release_url"`
	ReleaseNotes         string  `json:"release_notes,omitempty"`
	MinimumSourceVersion string  `json:"minimum_source_version"`
	DBSchemaBeforeMin    int     `json:"db_schema_before_min"`
	DBSchemaAfter        int     `json:"db_schema_after"`
	DocumentSchemaAfter  int     `json:"document_schema_after"`
	Critical             bool    `json:"critical"`
	Assets               []Asset `json:"assets"`
}

type Candidate struct {
	Version       string `json:"version"`
	ReleaseURL    string `json:"release_url"`
	ReleaseNotes  string `json:"release_notes"`
	PublishedAt   string `json:"published_at"`
	Size          int64  `json:"size"`
	Critical      bool   `json:"critical"`
	Package       string `json:"package"`
	DBSchemaAfter int    `json:"db_schema_after"`
}

type CheckResult struct {
	Status       string     `json:"status"`
	Current      string     `json:"current_version"`
	Candidate    *Candidate `json:"candidate,omitempty"`
	CheckedAtUTC string     `json:"checked_at_utc"`
	Message      string     `json:"message,omitempty"`
}

type Progress struct {
	Stage      string `json:"stage"`
	Downloaded int64  `json:"downloaded"`
	Total      int64  `json:"total"`
	Percent    int    `json:"percent"`
}

type Release struct {
	TagName    string         `json:"tag_name"`
	Draft      bool           `json:"draft"`
	Prerelease bool           `json:"prerelease"`
	Assets     []ReleaseAsset `json:"assets"`
}

type ReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// Provider isolates release discovery and metadata transport from update
// selection, signature trust, installation policy, and the Settings UI.
type Provider interface {
	ListReleases(ctx context.Context, repository, userAgent string) ([]Release, error)
	FetchMetadata(ctx context.Context, target, userAgent string, limit int64) ([]byte, error)
}

type githubProvider struct {
	client      *http.Client
	cachePath   string
	preferences *appconfig.Store
}

type Service struct {
	build          appidentity.BuildInfo
	paths          apppaths.Paths
	client         *http.Client
	mu             sync.Mutex
	manifest       *Manifest
	asset          *Asset
	downloadedPath string
	preferences    *appconfig.Store
	provider       Provider
	dbSchema       int
}

func NewService(build appidentity.BuildInfo, paths apppaths.Paths, preferences *appconfig.Store, schemaVersion int64) *Service {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSHandshakeTimeout = 15 * time.Second
	transport.ResponseHeaderTimeout = 30 * time.Second
	transport.IdleConnTimeout = 60 * time.Second
	// Do not apply one short total timeout to installer downloads: a valid
	// package can take several minutes on a slow connection. Metadata calls use
	// their own bounded contexts below and downloads remain cancellable by UI.
	client := &http.Client{Transport: transport}
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) > 8 || req.URL.Scheme != "https" || !allowedDownloadHost(req.URL.Hostname()) {
			return errors.New("update redirect was not trusted")
		}
		return nil
	}
	return &Service{build: build, paths: paths, client: client, preferences: preferences, provider: &githubProvider{client: client, cachePath: filepath.Join(paths.CacheRoot, "updates", "releases.json"), preferences: preferences}, dbSchema: int(schemaVersion)}
}

func (s *Service) Check(ctx context.Context) (CheckResult, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if !s.build.Production || !s.build.UpdatesEnabled {
		return CheckResult{Status: "disabled", Current: s.build.Version, CheckedAtUTC: now, Message: "Updates are disabled for this build."}, nil
	}
	current, err := parseSemVersion(s.build.Version)
	if err != nil {
		return CheckResult{}, fmt.Errorf("current build has invalid version: %w", err)
	}
	releases, err := s.provider.ListReleases(ctx, s.build.Repository, "Quotier-Labs/"+s.build.Version)
	if err != nil {
		return CheckResult{}, err
	}
	var bestVersion semVersion
	var bestManifest *Manifest
	var bestAsset *Asset
	var bestCandidate *Candidate
	for _, release := range releases {
		if release.Draft || (s.build.Channel == "production" && release.Prerelease) {
			continue
		}
		remote, err := parseSemVersion(release.TagName)
		if err != nil || compareSemVersion(remote, current) <= 0 {
			continue
		}
		manifestURL, signatureURL := "", ""
		for _, asset := range release.Assets {
			switch asset.Name {
			case manifestAssetName:
				manifestURL = asset.BrowserDownloadURL
			case signatureAssetName:
				signatureURL = asset.BrowserDownloadURL
			}
		}
		if manifestURL == "" || signatureURL == "" {
			continue
		}
		manifest, err := s.fetchAndVerifyManifest(ctx, manifestURL, signatureURL)
		if err != nil {
			continue
		}
		selected, err := selectAsset(manifest.Assets, runtime.GOOS, runtime.GOARCH)
		if err != nil {
			continue
		}
		if manifest.Version != strings.TrimPrefix(release.TagName, "v") {
			continue
		}
		if bestCandidate != nil && compareSemVersion(remote, bestVersion) <= 0 {
			continue
		}
		bestVersion = remote
		bestManifest = manifest
		bestAsset = selected
		bestCandidate = &Candidate{Version: manifest.Version, ReleaseURL: manifest.ReleaseURL, ReleaseNotes: manifest.ReleaseNotes, PublishedAt: manifest.PublishedAt, Size: selected.Size, Critical: manifest.Critical, Package: selected.Package, DBSchemaAfter: manifest.DBSchemaAfter}
	}
	if bestCandidate != nil {
		preferences, err := s.preferences.Load()
		if err != nil {
			preferences = appconfig.Defaults()
		}
		if preferences.LastObservedUpdateVersion != "" {
			observed, parseErr := parseSemVersion(preferences.LastObservedUpdateVersion)
			if parseErr == nil && compareSemVersion(bestVersion, observed) < 0 {
				return CheckResult{}, errors.New("the signed update feed moved backward; update was rejected")
			}
		}
		_, _ = s.preferences.Update(func(value *appconfig.Preferences) error {
			if value.LastObservedUpdateVersion == "" {
				value.LastObservedUpdateVersion = bestCandidate.Version
			} else if observed, parseErr := parseSemVersion(value.LastObservedUpdateVersion); parseErr != nil || compareSemVersion(bestVersion, observed) > 0 {
				value.LastObservedUpdateVersion = bestCandidate.Version
			}
			return nil
		})
		s.mu.Lock()
		s.manifest = bestManifest
		s.asset = bestAsset
		s.downloadedPath = ""
		s.mu.Unlock()
		status := "available"
		if preferences.SkippedVersion == bestCandidate.Version && !bestCandidate.Critical {
			status = "skipped"
		}
		return CheckResult{Status: status, Current: s.build.Version, Candidate: bestCandidate, CheckedAtUTC: now}, nil
	}
	return CheckResult{Status: "up-to-date", Current: s.build.Version, CheckedAtUTC: now}, nil
}

func (s *Service) SkipCurrentVersion() error {
	s.mu.Lock()
	manifest := s.manifest
	s.mu.Unlock()
	if manifest == nil {
		return errors.New("check for an update before skipping it")
	}
	if manifest.Critical {
		return errors.New("important security updates can be deferred but not permanently hidden")
	}
	_, err := s.preferences.Update(func(value *appconfig.Preferences) error {
		value.SkippedVersion = manifest.Version
		return nil
	})
	return err
}

func (s *Service) Download(ctx context.Context, report func(Progress)) (string, error) {
	s.mu.Lock()
	manifest, asset := s.manifest, s.asset
	s.mu.Unlock()
	if manifest == nil || asset == nil {
		return "", errors.New("check for an update before downloading")
	}
	if asset.Size <= 0 || asset.Size > maxUpdateSize {
		return "", errors.New("update size is invalid")
	}
	u, err := url.Parse(asset.URL)
	if err != nil || u.Scheme != "https" || !allowedDownloadHost(u.Hostname()) {
		return "", errors.New("update URL was not trusted")
	}
	dir := filepath.Join(s.paths.CacheRoot, "updates", manifest.Version)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	tmp, err := os.CreateTemp(dir, ".download-*.partial")
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	_ = tmp.Chmod(0600)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, asset.URL, nil)
	req.Header.Set("User-Agent", "Quotier-Labs/"+s.build.Version)
	resp, err := s.client.Do(req)
	if err != nil {
		tmp.Close()
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		tmp.Close()
		return "", fmt.Errorf("update download returned HTTP %d", resp.StatusCode)
	}
	hash := sha256.New()
	var downloaded int64
	buf := make([]byte, 128*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			downloaded += int64(n)
			if downloaded > asset.Size || downloaded > maxUpdateSize {
				tmp.Close()
				return "", errors.New("update exceeded expected size")
			}
			if _, err := tmp.Write(buf[:n]); err != nil {
				tmp.Close()
				return "", err
			}
			_, _ = hash.Write(buf[:n])
			percent := int(downloaded * 100 / asset.Size)
			if report != nil {
				report(Progress{Stage: "downloading", Downloaded: downloaded, Total: asset.Size, Percent: percent})
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			tmp.Close()
			return "", readErr
		}
	}
	if downloaded != asset.Size {
		tmp.Close()
		return "", errors.New("update size did not match signed manifest")
	}
	want, err := hex.DecodeString(asset.SHA256)
	if err != nil || len(want) != sha256.Size || subtle.ConstantTimeCompare(hash.Sum(nil), want) != 1 {
		tmp.Close()
		return "", errors.New("update checksum verification failed")
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if report != nil {
		report(Progress{Stage: "verifying", Downloaded: downloaded, Total: asset.Size, Percent: 100})
	}
	if err := verifyPlatformPackage(tmpName, asset.Package); err != nil {
		return "", err
	}
	name := filepath.Base(u.Path)
	if name == "." || name == "/" || name == "" {
		name = "quotier-update"
	}
	ready := filepath.Join(dir, name)
	if err := fileutil.Replace(tmpName, ready); err != nil {
		return "", err
	}
	cleanupUpdateCache(filepath.Join(s.paths.CacheRoot, "updates"), manifest.Version)
	s.mu.Lock()
	s.downloadedPath = ready
	s.mu.Unlock()
	if report != nil {
		report(Progress{Stage: "verified", Downloaded: downloaded, Total: asset.Size, Percent: 100})
	}
	return ready, nil
}

func cleanupUpdateCache(root, currentVersion string) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	type cached struct {
		path string
		mod  time.Time
	}
	others := []cached{}
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == currentVersion {
			continue
		}
		if _, err := parseSemVersion(entry.Name()); err != nil {
			continue
		}
		if info, err := entry.Info(); err == nil {
			others = append(others, cached{path: filepath.Join(root, entry.Name()), mod: info.ModTime()})
		}
	}
	sort.Slice(others, func(i, j int) bool { return others[i].mod.After(others[j].mod) })
	if len(others) <= 1 {
		return
	}
	for _, item := range others[1:] {
		_ = os.RemoveAll(item.path)
	}
}

func (s *Service) StartInstaller() error {
	if !s.build.Production {
		return errors.New("updates are disabled for development builds")
	}
	s.mu.Lock()
	path, manifest := s.downloadedPath, s.manifest
	s.mu.Unlock()
	if path == "" || manifest == nil {
		return errors.New("download and verify the update first")
	}
	transaction := map[string]any{
		"schema_version": 1, "from": s.build.Version, "to": manifest.Version,
		"package": filepath.Base(path), "db_schema_after": manifest.DBSchemaAfter,
		"document_schema_after": manifest.DocumentSchemaAfter, "created_at": time.Now().UTC(),
	}
	raw, _ := json.MarshalIndent(transaction, "", "  ")
	if err := atomicWrite(filepath.Join(s.paths.StateRoot, "update-pending.json"), raw, 0600); err != nil {
		return err
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command(path, "/UPDATE")
	case "darwin":
		cmd = exec.Command("open", path)
	case "linux":
		cmd = exec.Command("xdg-open", path)
	default:
		return errors.New("unsupported update platform")
	}
	if err := cmd.Start(); err != nil {
		_ = os.Remove(filepath.Join(s.paths.StateRoot, "update-pending.json"))
		return fmt.Errorf("start native installer: %w", err)
	}
	return nil
}

func (p *githubProvider) ListReleases(ctx context.Context, repository, userAgent string) ([]Release, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	endpoint := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=20", repository)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", userAgent)
	if preferences, err := p.preferences.Load(); err == nil {
		if preferences.UpdateFeedETag != "" {
			req.Header.Set("If-None-Match", preferences.UpdateFeedETag)
		}
		if preferences.UpdateFeedLastModified != "" {
			req.Header.Set("If-Modified-Since", preferences.UpdateFeedLastModified)
		}
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("check for updates: %w", err)
	}
	defer resp.Body.Close()
	var raw []byte
	if resp.StatusCode == http.StatusNotModified {
		info, statErr := os.Stat(p.cachePath)
		if statErr != nil || info.Size() > 4<<20 {
			return nil, errors.New("update feed cache was unavailable")
		}
		raw, err = os.ReadFile(p.cachePath)
		if err != nil {
			return nil, errors.New("update feed cache was unavailable")
		}
	} else if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("check for updates returned HTTP %d", resp.StatusCode)
	} else {
		raw, err = io.ReadAll(io.LimitReader(resp.Body, (4<<20)+1))
		if err != nil || len(raw) > 4<<20 {
			return nil, errors.New("update feed exceeded its size limit")
		}
		if err := atomicWrite(p.cachePath, raw, 0600); err == nil {
			_, _ = p.preferences.Update(func(value *appconfig.Preferences) error {
				value.UpdateFeedETag = resp.Header.Get("ETag")
				value.UpdateFeedLastModified = resp.Header.Get("Last-Modified")
				return nil
			})
		}
	}
	var releases []Release
	if err := json.NewDecoder(bytes.NewReader(raw)).Decode(&releases); err != nil {
		return nil, fmt.Errorf("decode release list: %w", err)
	}
	return releases, nil
}

func (s *Service) fetchAndVerifyManifest(ctx context.Context, manifestURL, signatureURL string) (*Manifest, error) {
	raw, err := s.provider.FetchMetadata(ctx, manifestURL, "Quotier-Labs/"+s.build.Version, maxManifestSize)
	if err != nil {
		return nil, err
	}
	sigRaw, err := s.provider.FetchMetadata(ctx, signatureURL, "Quotier-Labs/"+s.build.Version, maxManifestSize)
	if err != nil {
		return nil, err
	}
	publicKey, err := base64.StdEncoding.DecodeString(s.build.ReleasePublicKey)
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return nil, errors.New("release public key is invalid")
	}
	signature := sigRaw
	if decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(sigRaw))); err == nil {
		signature = decoded
	}
	if len(signature) != ed25519.SignatureSize || !ed25519.Verify(ed25519.PublicKey(publicKey), raw, signature) {
		return nil, errors.New("update manifest signature verification failed")
	}
	var manifest Manifest
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&manifest); err != nil {
		return nil, fmt.Errorf("decode update manifest: %w", err)
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		return nil, errors.New("update manifest contained trailing data")
	}
	if manifest.FormatVersion != 1 || manifest.AppID != s.build.AppID || manifest.Channel != s.build.Channel {
		return nil, errors.New("update manifest identity or channel did not match")
	}
	if manifest.DBSchemaBeforeMin < 1 || manifest.DBSchemaAfter < manifest.DBSchemaBeforeMin || manifest.DocumentSchemaAfter < 1 {
		return nil, errors.New("update manifest schema compatibility range is invalid")
	}
	if s.dbSchema < manifest.DBSchemaBeforeMin || s.dbSchema > manifest.DBSchemaAfter || documentmodel.SchemaVersion > manifest.DocumentSchemaAfter {
		return nil, errors.New("this update is not compatible with the current data schemas")
	}
	if _, err := parseSemVersion(manifest.Version); err != nil {
		return nil, err
	}
	if s.build.Channel == "production" && isPrerelease(manifest.Version) {
		return nil, errors.New("production build rejected prerelease")
	}
	minimum, err := parseSemVersion(manifest.MinimumSourceVersion)
	if err != nil {
		return nil, errors.New("update manifest has an invalid minimum source version")
	}
	current, err := parseSemVersion(s.build.Version)
	if err != nil || compareSemVersion(current, minimum) < 0 {
		return nil, errors.New("this update requires an intermediate Quotier Labs version")
	}
	return &manifest, nil
}

func (p *githubProvider) FetchMetadata(ctx context.Context, target, userAgent string, limit int64) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	u, err := url.Parse(target)
	if err != nil || u.Scheme != "https" || !allowedDownloadHost(u.Hostname()) {
		return nil, errors.New("update metadata URL was not trusted")
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	req.Header.Set("User-Agent", userAgent)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("update metadata returned HTTP %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > limit {
		return nil, errors.New("update metadata exceeded its size limit")
	}
	return raw, nil
}

func selectAsset(assets []Asset, goos, arch string) (*Asset, error) {
	for i := range assets {
		if assets[i].OS == goos && assets[i].Arch == arch && validPackage(goos, assets[i].Package) {
			return &assets[i], nil
		}
	}
	return nil, errors.New("no update package is available for this platform")
}

func validPackage(goos, packageKind string) bool {
	switch goos {
	case "windows":
		return packageKind == "nsis"
	case "darwin":
		return packageKind == "pkg"
	case "linux":
		return packageKind == "deb" || packageKind == "rpm"
	default:
		return false
	}
}

func verifyPlatformPackage(path, packageKind string) error {
	switch runtime.GOOS {
	case "windows":
		// The script is constant and the package path is passed as a separate
		// argument, so a path cannot become PowerShell source code.
		cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", `$s=Get-AuthenticodeSignature -LiteralPath $args[0]; if($s.Status -ne 'Valid'){exit 2}; if($s.SignerCertificate.Subject -notmatch 'Quotier Labs'){exit 3}`, path)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("Windows publisher signature verification failed: %s", strings.TrimSpace(string(output)))
		}
	case "darwin":
		if output, err := exec.Command("pkgutil", "--check-signature", path).CombinedOutput(); err != nil || !bytes.Contains(output, []byte("Developer ID Installer")) {
			return fmt.Errorf("Apple installer signature verification failed: %s", strings.TrimSpace(string(output)))
		}
		if output, err := exec.Command("spctl", "--assess", "--type", "install", "--verbose=2", path).CombinedOutput(); err != nil {
			return fmt.Errorf("Apple notarization assessment failed: %s", strings.TrimSpace(string(output)))
		}
	case "linux":
		var cmd *exec.Cmd
		if packageKind == "deb" {
			cmd = exec.Command("dpkg-deb", "--info", path)
		} else {
			cmd = exec.Command("rpm", "-K", path)
		}
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("Linux package verification failed: %s", strings.TrimSpace(string(output)))
		}
	}
	return nil
}

func allowedDownloadHost(host string) bool {
	host = strings.ToLower(host)
	return host == "github.com" || host == "api.github.com" || host == "objects.githubusercontent.com" || host == "release-assets.githubusercontent.com" || strings.HasSuffix(host, ".githubusercontent.com")
}

func atomicWrite(path string, raw []byte, mode os.FileMode) error {
	return fileutil.AtomicWrite(path, raw, mode)
}
