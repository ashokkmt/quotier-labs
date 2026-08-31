package appidentity

import (
	"runtime"
	"strings"
)

const (
	AppID       = "com.quotierlabs.QuotierLabs"
	Vendor      = "Quotier Labs"
	ProductName = "Quotier Labs"
	Slug        = "quotier-labs"
)

// These values are set by the dev/release scripts through Go -ldflags -X.
// Defaults are deliberately unmistakable and never represent a release.
var (
	Version          = "0.0.0-dev"
	GitTag           = ""
	GitCommit        = "unknown"
	BuildTime        = "unknown"
	Channel          = "development"
	ReleasePublicKey = ""
	Repository       = "ashokkmt/quotier-labs"
)

type BuildInfo struct {
	AppID            string `json:"app_id"`
	Name             string `json:"name"`
	Version          string `json:"version"`
	GitTag           string `json:"git_tag"`
	GitCommit        string `json:"git_commit"`
	BuildTime        string `json:"build_time"`
	Channel          string `json:"channel"`
	OS               string `json:"os"`
	Arch             string `json:"arch"`
	Production       bool   `json:"production"`
	UpdatesEnabled   bool   `json:"updates_enabled"`
	ReleasePublicKey string `json:"-"`
	Repository       string `json:"-"`
}

func Current() BuildInfo {
	channel := normaliseChannel(Channel, Version)
	productionBuild := channel == "production" || channel == "beta"
	return BuildInfo{
		AppID:            channelAppID(channel),
		Name:             channelName(channel),
		Version:          strings.TrimPrefix(Version, "v"),
		GitTag:           GitTag,
		GitCommit:        GitCommit,
		BuildTime:        BuildTime,
		Channel:          channel,
		OS:               runtime.GOOS,
		Arch:             runtime.GOARCH,
		Production:       productionBuild,
		UpdatesEnabled:   productionBuild && ReleasePublicKey != "",
		ReleasePublicKey: ReleasePublicKey,
		Repository:       Repository,
	}
}

func normaliseChannel(channel, version string) string {
	switch strings.ToLower(strings.TrimSpace(channel)) {
	case "production", "beta", "development":
		return strings.ToLower(strings.TrimSpace(channel))
	}
	if strings.Contains(strings.ToLower(version), "beta") {
		return "beta"
	}
	return "development"
}

func channelAppID(channel string) string {
	switch channel {
	case "beta":
		return AppID + ".Beta"
	case "development":
		return AppID + ".Dev"
	default:
		return AppID
	}
}

func channelName(channel string) string {
	switch channel {
	case "beta":
		return ProductName + " Beta"
	case "development":
		return ProductName + " Dev"
	default:
		return ProductName
	}
}
