//go:build linux && amd64

package modulequalification

import (
	"os"
	"runtime"
	"syscall"
	"unsafe"
)

const (
	linuxAMD64Renameat2 = 316
	linuxAtFDCWD        = ^uintptr(99) // signed -100
	renameNoReplace     = 1
)

// installDirectoryNoReplace publishes a same-filesystem staging directory
// with Linux renameat2(RENAME_NOREPLACE). Kernel/filesystem errors are returned
// directly: falling back to os.Rename would reintroduce replacement races.
func installDirectoryNoReplace(stage, destination string) error {
	oldPath, err := syscall.BytePtrFromString(stage)
	if err != nil {
		return &os.LinkError{Op: "renameat2", Old: stage, New: destination, Err: err}
	}
	newPath, err := syscall.BytePtrFromString(destination)
	if err != nil {
		return &os.LinkError{Op: "renameat2", Old: stage, New: destination, Err: err}
	}

	_, _, errno := syscall.Syscall6(
		linuxAMD64Renameat2,
		linuxAtFDCWD,
		uintptr(unsafe.Pointer(oldPath)),
		linuxAtFDCWD,
		uintptr(unsafe.Pointer(newPath)),
		renameNoReplace,
		0,
	)
	runtime.KeepAlive(oldPath)
	runtime.KeepAlive(newPath)
	if errno != 0 {
		return &os.LinkError{Op: "renameat2", Old: stage, New: destination, Err: errno}
	}
	return nil
}
