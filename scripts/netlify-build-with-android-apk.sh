#!/usr/bin/env bash
set -euo pipefail

build_web() {
  pnpm build:web
}

if [[ "${BRANCH:-}" != "dev" ]]; then
  build_web
  exit 0
fi

VERSION_FULL="$(tr -d '[:space:]' < VERSION)"
VERSION_SHORT="$(printf '%s' "$VERSION_FULL" | cut -d. -f1,2)"
APK_NAME="me-plus-${VERSION_SHORT}.apk"
DOWNLOAD_DIR="apps/web/public/downloads"
ANDROID_CLI_REVISION="15859902"
ANDROID_CLI_ZIP="commandlinetools-linux-${ANDROID_CLI_REVISION}_latest.zip"

mkdir -p "$DOWNLOAD_DIR"

export ANDROID_HOME="${HOME}/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
mkdir -p "$ANDROID_HOME/cmdline-tools"

if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  curl -fsSL "https://dl.google.com/android/repository/${ANDROID_CLI_ZIP}" -o "/tmp/${ANDROID_CLI_ZIP}"
  rm -rf /tmp/android-command-line-tools
  mkdir -p /tmp/android-command-line-tools
  unzip -q "/tmp/${ANDROID_CLI_ZIP}" -d /tmp/android-command-line-tools
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mkdir -p "$ANDROID_HOME/cmdline-tools/latest"
  mv /tmp/android-command-line-tools/cmdline-tools/* "$ANDROID_HOME/cmdline-tools/latest/"
fi

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

yes | sdkmanager --licenses >/dev/null || true
sdkmanager \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "cmake;3.22.1"

pnpm --filter @me-plus/mobile exec expo prebuild --platform android --clean --no-install

(
  cd apps/mobile/android
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
)

cp "apps/mobile/android/app/build/outputs/apk/release/app-release.apk" "$DOWNLOAD_DIR/$APK_NAME"
sha256sum "$DOWNLOAD_DIR/$APK_NAME" > "$DOWNLOAD_DIR/$APK_NAME.sha256"

export VERSION_FULL VERSION_SHORT APK_NAME
node <<'NODE'
const fs = require("node:fs");
const path = "apps/web/public/downloads/android-build.json";
const metadata = {
  app: "me-plus",
  platform: "android",
  channel: "dev",
  version: process.env.VERSION_FULL,
  displayVersion: process.env.VERSION_SHORT,
  filename: process.env.APK_NAME,
  gitSha: process.env.COMMIT_REF ?? null,
  sourceBranch: process.env.BRANCH ?? null,
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(path, JSON.stringify(metadata, null, 2) + "\n");
NODE

build_web
