#!/usr/bin/env bash
# Installs a Sahkarmi DMG the way a Mac owner does and checks that the app really runs.
# It runs on GitHub's Mac machines, because the release is made without a Mac at hand.
#
# Usage: scripts/mac/install-test.sh <Sahkarmi-x.y.z-arch.dmg> <arm64|x64> [output folder]
set -euo pipefail

dmg="$1"
arch="$2"
out="${3:-mac-test-output}"
app="/Applications/Sahkarmi.app"
port=9461
mkdir -p "$out"

note() { printf '\n== %s\n' "$*"; }
shot() { screencapture -x "$out/$1.png" 2>/dev/null || echo "(no screenshot: $1)"; }
running() { pgrep -x Sahkarmi >/dev/null 2>&1; }
stop_app() {
  pkill -TERM -x Sahkarmi 2>/dev/null || true
  for _ in $(seq 1 20); do running || return 0; sleep 1; done
  pkill -KILL -x Sahkarmi 2>/dev/null || true
  sleep 1
}

note "This Mac"
sw_vers
machine="$(uname -m)"
want="arm64"
if [[ "$arch" == "x64" ]]; then want="x86_64"; fi
echo "chip: $machine, DMG is for: $want"
if [[ "$machine" != "$want" ]]; then
  echo "This Mac cannot test that DMG." >&2
  exit 1
fi
spctl --status || true

note "1. The DMG arrives as a browser download (quarantine flag)"
quarantine="0083;$(printf '%x' "$(date +%s)");Safari;$(uuidgen)"
xattr -w com.apple.quarantine "$quarantine" "$dmg"
ls -l "$dmg"
shasum -a 256 "$dmg"

note "2. Open the DMG"
hdiutil verify -quiet "$dmg"
mount_point="$(hdiutil attach -nobrowse -readonly "$dmg" | grep -o '/Volumes/.*' | tail -1)"
echo "mounted at: $mount_point"
ls -la "$mount_point"
test -d "$mount_point/Sahkarmi.app"
test -L "$mount_point/Applications"

note "3. Drag Sahkarmi into Applications"
rm -rf "$app"
ditto "$mount_point/Sahkarmi.app" "$app"
hdiutil detach "$mount_point" -quiet || hdiutil detach "$mount_point" -force
xattr -r -w com.apple.quarantine "$quarantine" "$app"
du -sh "$app"

note "4. Signature and chip"
codesign --verify --deep --strict --verbose=2 "$app"
codesign -dv --verbose=2 "$app" 2>&1 | tee "$out/codesign.txt"
lipo -archs "$app/Contents/MacOS/Sahkarmi"
if ! lipo -archs "$app/Contents/MacOS/Sahkarmi" | grep -qw "$want"; then
  echo "The app is not built for $want." >&2
  exit 1
fi
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist" | tee "$out/version.txt"

note "5. Gatekeeper verdict (a build without Apple's check is not accepted; that is expected)"
if spctl --assess --type execute -vv "$app" >"$out/gatekeeper.txt" 2>&1; then
  echo "Gatekeeper: accepted"
else
  echo "Gatekeeper: not accepted"
fi
cat "$out/gatekeeper.txt"

note "6. First double-click while the download flag is still on: what the owner sees"
# "open" waits for as long as the macOS message stays on screen, so it runs on the side.
(open "$app" >/dev/null 2>&1 &)
sleep 15
shot 01-first-open-with-download-flag
if running; then
  echo "The app started although it is quarantined."
else
  echo "macOS held the app back and showed its message (see the screenshot)."
fi
stop_app
# Close the macOS message and the waiting "open".
pkill -x CoreServicesUIAgent 2>/dev/null || true
pkill -f "open $app" 2>/dev/null || true
sleep 3

note "7. The owner allows it (Open Anyway). The same thing in one command:"
echo "xattr -dr com.apple.quarantine $app"
xattr -dr com.apple.quarantine "$app"

note "8. Programs packed inside"
file "$app/Contents/Resources/bin/opencode"
"$app/Contents/Resources/bin/opencode" --version
find "$app/Contents/Resources/app.asar.unpacked/node_modules" -maxdepth 2 2>/dev/null | head -40 || true

note "9. Start Sahkarmi"
open "$app" --args "--remote-debugging-port=$port"
for _ in $(seq 1 60); do running && break; sleep 1; done
if ! running; then
  echo "Sahkarmi did not start." >&2
  shot 02-did-not-start
  exit 1
fi
sleep 25
shot 02-first-start
if ! running; then
  echo "Sahkarmi closed by itself within 25 seconds." >&2
  exit 1
fi

if curl -fsS "http://127.0.0.1:$port/json/version" >"$out/cdp-version.json" 2>/dev/null; then
  note "10. Use the app like an owner (buttons, screens, a real question to the free AI)"
  node "$(dirname "$0")/ui-tour.mjs" "$port" "$out"
else
  note "10. The packed app does not allow remote control; the screen tour runs on the build machine instead"
fi
shot 03-after-tour

note "11. Close and open again"
stop_app
if running; then
  echo "Sahkarmi did not close." >&2
  exit 1
fi
open "$app"
for _ in $(seq 1 60); do running && break; sleep 1; done
sleep 20
shot 04-second-start
if ! running; then
  echo "Sahkarmi did not start the second time." >&2
  exit 1
fi

note "12. Log and crash reports"
log="$(find "$HOME/Library/Application Support" -name 'sahkarmi.log' -maxdepth 4 2>/dev/null | head -1)"
if [[ -n "$log" ]]; then
  cp "$log" "$out/sahkarmi.log"
  echo "log: $log ($(wc -l <"$log") lines)"
  grep -iE '\berror\b|uncaught|unhandled' "$log" | tail -40 || echo "no error lines in the log"
else
  echo "no log file found"
fi
stop_app
crashes="$(find "$HOME/Library/Logs/DiagnosticReports" -iname '*Sahkarmi*' 2>/dev/null || true)"
if [[ -n "$crashes" ]]; then
  echo "Crash reports found:" >&2
  echo "$crashes" >&2
  cp $crashes "$out/" 2>/dev/null || true
  exit 1
fi
echo "no crash reports"

note "Done: installed, opened, used, closed and opened again on $(sw_vers -productName) $(sw_vers -productVersion) ($machine)"
