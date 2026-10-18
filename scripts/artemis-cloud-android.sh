#!/usr/bin/env bash
set -euo pipefail
mkdir -p artemis-evidence
adb devices -l > artemis-evidence/devices.txt
adb shell getprop ro.product.cpu.abilist > artemis-evidence/emulator-abis.txt
adb shell getprop ro.dalvik.vm.native.bridge >> artemis-evidence/emulator-abis.txt
adb install --no-streaming -r .artemis-candidate/me-plus-0.4.3.apk
adb shell dumpsys package app.meplus.mobile > artemis-evidence/package.txt
adb logcat -c
adb shell monkey -p app.meplus.mobile -c android.intent.category.LAUNCHER 1
sleep 8
adb exec-out screencap -p > artemis-evidence/launched.png
adb shell uiautomator dump /sdcard/meplus-launch.xml
adb pull /sdcard/meplus-launch.xml artemis-evidence/launched.xml
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "::error::Cloud Artemis requires repository Actions secret GEMINI_API_KEY. Device installation evidence was preserved."
  exit 1
fi
repo_root="$PWD"
trap 'adb logcat -d > "$repo_root/artemis-evidence/logcat.txt" 2>/dev/null || true; adb exec-out screencap -p > "$repo_root/artemis-evidence/final.png" 2>/dev/null || true' EXIT
cd .artemis-tool
uv run --no-sync python -m artemis doctor --json > "$repo_root/artemis-evidence/doctor.json"
timeout --signal=TERM --kill-after=30s 600s uv run --no-sync python -m artemis run \
  "Test only Me+ Android package app.meplus.mobile on this fresh emulator. First explore the real signed-out screen and ground every interaction in the observed UI. Use Pro verification checkpoints to assert: the app launches without a crash dialog; the visible login fields and controls are readable at this phone size; submitting the empty sign-in form produces an honest validation or authentication error without granting access; the app remains responsive after dismissing the keyboard and backgrounding/reopening it. Do not enter real credentials, create an account, complete OAuth, grant health access, fabricate health records, or send messages. Do not use external applications except Android navigation needed to reopen Me+. Finish on the sign-in screen. Report actual observations, screenshots and failures. Explicitly state that signed-in Health Connect ingestion, personal history, offline retries, reboot and periodic background sync were not exercised by this fresh signed-out emulator." \
  --profile pro --standalone --locked-app app.meplus.mobile \
  --verification-level strict --without-video-recording-tools \
  --test-name meplus-cloud-signed-out --traces-path "$repo_root/artemis-evidence/traces" \
  --output-description "Observed checks with pass/fail evidence, any app crash or layout defects, and a separate list of untested signed-in health scenarios." \
  > "$repo_root/artemis-evidence/artemis-run.log" 2>&1
cd "$repo_root"
python scripts/verify-artemis-outcome.py artemis-evidence/traces
