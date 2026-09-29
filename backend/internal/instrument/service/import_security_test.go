package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestImportRejectsUntrustedURLs(t *testing.T) {
	for _, source := range []string{"http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data", "https://evil.example/master.json", OfficialScripMasterURL + "?redirect=evil", "file:///etc/passwd", "//evil.example/master.json"} {
		if _, err := NewService(nil).SyncFromScripMaster(context.Background(), source); err == nil {
			t.Fatalf("accepted untrusted source %q", source)
		}
	}
}

func TestImportClientRejectsRedirects(t *testing.T) {
	targetHits := 0
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { targetHits++; w.Write([]byte("[]")) }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, http.StatusFound) }))
	defer redirect.Close()
	resp, err := scripMasterHTTPClient().Get(redirect.URL)
	if resp != nil {
		resp.Body.Close()
	}
	if err == nil || targetHits != 0 {
		t.Fatal("redirect was followed")
	}
}

type failedImportReader struct{}

func (failedImportReader) Read([]byte) (int, error) { return 0, errors.New("interrupted download") }

func TestImportReadFailureDoesNotStartSync(t *testing.T) {
	if _, err := (*Service)(nil).syncBoundedSource(context.Background(), failedImportReader{}); err == nil {
		t.Fatal("expected download failure")
	}
}

func TestOperatorLocalImport(t *testing.T) {
	file := filepath.Join(t.TempDir(), "master.json")
	if err := os.WriteFile(file, []byte(`[{"token":"2885","symbol":"RELIANCE-EQ","name":"RELIANCE","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"}]`), 0600); err != nil {
		t.Fatal(err)
	}
	stats, err := NewService(nil).SyncFromScripMaster(context.Background(), file)
	if err != nil || stats.TotalProcessed != 1 {
		t.Fatalf("local import: stats=%+v err=%v", stats, err)
	}
}

// Stream a large source without allocating a large input buffer.
type zeroImportReader struct{}

func (zeroImportReader) Read(p []byte) (int, error) { clear(p); return len(p), nil }

func TestImportRejectsOversizedSourceBeforeSyncAndCleansUp(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("TMPDIR", dir)
	source := io.LimitReader(zeroImportReader{}, maxScripMasterBytes+1)
	if _, err := (*Service)(nil).syncBoundedSource(context.Background(), source); err == nil {
		t.Fatal("oversized import accepted")
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 0 {
		t.Fatalf("temporary download not removed: %v", err)
	}
}
