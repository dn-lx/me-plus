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
JDK_DIR="${HOME}/jdk-17"

mkdir -p "$DOWNLOAD_DIR"

# Netlify's current build image defaults to Java 25. The Android/Gradle stack
# used by Me+ is pinned to JDK 17 for deterministic compatibility.
if [[ ! -x "$JDK_DIR/bin/java" ]]; then
  rm -rf "$JDK_DIR"
  mkdir -p "$JDK_DIR"
  curl -fsSL     "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"     -o /tmp/me-plus-jdk17.tar.gz
  tar -xzf /tmp/me-plus-jdk17.tar.gz -C "$JDK_DIR" --strip-components=1
fi

export JAVA_HOME="$JDK_DIR"
export PATH="$JAVA_HOME/bin:$PATH"

echo "Me+ Android build: version=$VERSION_FULL artifact=$APK_NAME"
java -version

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

sdkmanager --version
yes | sdkmanager --licenses >/dev/null 2>&1 || true
sdkmanager   "platform-tools"   "platforms;android-36"   "build-tools;36.0.0"   "ndk;27.1.12297006"   "cmake;3.22.1"

pnpm --filter @me-plus/mobile exec expo prebuild --platform android --clean --no-install

(
  cd apps/mobile/android
  ./gradlew     assembleRelease     -PreactNativeArchitectures=arm64-v8a     --no-daemon     --max-workers=2
)

APK_SOURCE="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
test -s "$APK_SOURCE"
cp "$APK_SOURCE" "$DOWNLOAD_DIR/$APK_NAME"
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
