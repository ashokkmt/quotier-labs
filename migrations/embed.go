// Package migrations embeds the SQL migration files so they can be used
// from Go code without relying on the working directory at runtime.
package migrations

import "embed"

// FS contains all *.sql migration files embedded at compile time.
//
//go:embed *.sql
var FS embed.FS
