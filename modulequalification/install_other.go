//go:build !linux || !amd64

package modulequalification

import "errors"

// installDirectoryNoReplace deliberately has no overwrite-capable fallback.
// A platform-specific atomic no-replace implementation is required before
// archive extraction can be published there.
func installDirectoryNoReplace(stage, destination string) error {
	return errors.New("atomic no-replace archive installation is unsupported on this platform")
}
