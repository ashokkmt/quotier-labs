package update

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var semverIdentifier = regexp.MustCompile(`^[0-9A-Za-z-]+$`)

type semVersion struct {
	major, minor, patch int
	pre                 []string
}

func parseSemVersion(raw string) (semVersion, error) {
	raw = strings.TrimPrefix(strings.TrimSpace(raw), "v")
	raw = strings.SplitN(raw, "+", 2)[0]
	parts := strings.SplitN(raw, "-", 2)
	core := strings.Split(parts[0], ".")
	if len(core) != 3 {
		return semVersion{}, fmt.Errorf("invalid semantic version %q", raw)
	}
	numbers := make([]int, 3)
	for i, part := range core {
		if part == "" || (len(part) > 1 && part[0] == '0') {
			return semVersion{}, fmt.Errorf("invalid semantic version %q", raw)
		}
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 {
			return semVersion{}, fmt.Errorf("invalid semantic version %q", raw)
		}
		numbers[i] = n
	}
	value := semVersion{major: numbers[0], minor: numbers[1], patch: numbers[2]}
	if len(parts) == 2 {
		if parts[1] == "" {
			return semVersion{}, fmt.Errorf("invalid semantic version %q", raw)
		}
		value.pre = strings.Split(parts[1], ".")
		for _, identifier := range value.pre {
			if !semverIdentifier.MatchString(identifier) {
				return semVersion{}, fmt.Errorf("invalid semantic version %q", raw)
			}
			if _, err := strconv.Atoi(identifier); err == nil && len(identifier) > 1 && identifier[0] == '0' {
				return semVersion{}, fmt.Errorf("invalid semantic version %q", raw)
			}
		}
	}
	return value, nil
}

func compareSemVersion(a, b semVersion) int {
	for _, pair := range [][2]int{{a.major, b.major}, {a.minor, b.minor}, {a.patch, b.patch}} {
		if pair[0] < pair[1] {
			return -1
		}
		if pair[0] > pair[1] {
			return 1
		}
	}
	if len(a.pre) == 0 && len(b.pre) == 0 {
		return 0
	}
	if len(a.pre) == 0 {
		return 1
	}
	if len(b.pre) == 0 {
		return -1
	}
	for i := 0; i < len(a.pre) || i < len(b.pre); i++ {
		if i >= len(a.pre) {
			return -1
		}
		if i >= len(b.pre) {
			return 1
		}
		av, aerr := strconv.Atoi(a.pre[i])
		bv, berr := strconv.Atoi(b.pre[i])
		switch {
		case aerr == nil && berr == nil:
			if av < bv {
				return -1
			}
			if av > bv {
				return 1
			}
		case aerr == nil:
			return -1
		case berr == nil:
			return 1
		default:
			if a.pre[i] < b.pre[i] {
				return -1
			}
			if a.pre[i] > b.pre[i] {
				return 1
			}
		}
	}
	return 0
}

func isPrerelease(raw string) bool {
	v, err := parseSemVersion(raw)
	return err == nil && len(v.pre) > 0
}
