#!/usr/bin/env bash
# Builds and signs the Android app and puts it where the website serves it
# (client/public/download/walter-system.apk, linked from /stahnout).
#
# The app only shows https://app.waltersystem.cz, so a website change never
# needs a new build. Rebuild only when the app itself changes (name, icon,
# colours): raise appVersionCode in twa-manifest.json and app/build.gradle
# first, or phones refuse to install it over the old one.
#
# Needs: JDK 17, the Android SDK (build-tools 35), and the signing key in
# android/signing/ (git-ignored; see README-KEEP-SAFE.txt there). A build
# signed with any other key will not install over the existing app, and
# /.well-known/assetlinks.json names this key's fingerprint.
set -euo pipefail
cd "$(dirname "$0")"

JAVA_HOME="${JAVA_HOME:-/c/Program Files/Microsoft/jdk-17.0.21.21-hotspot}"
ANDROID_HOME="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
export JAVA_HOME ANDROID_HOME
BUILD_TOOLS="$ANDROID_HOME/build-tools/35.0.0"
KEYSTORE=signing/walter-release.keystore
PASSWORD=$(sed -n 's/^Password (store and key): //p' signing/README-KEEP-SAFE.txt)
[ -f "$KEYSTORE" ] && [ -n "$PASSWORD" ] || { echo "Signing key missing in android/signing/" >&2; exit 1; }

./gradlew assembleRelease --no-daemon --console=plain
"$BUILD_TOOLS/zipalign" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk app-release-aligned.apk
"$JAVA_HOME/bin/java" -jar "$BUILD_TOOLS/lib/apksigner.jar" sign --ks "$KEYSTORE" --ks-key-alias walter \
  --ks-pass "pass:$PASSWORD" --key-pass "pass:$PASSWORD" \
  --out walter-system.apk app-release-aligned.apk
rm -f app-release-aligned.apk walter-system.apk.idsig
"$JAVA_HOME/bin/java" -jar "$BUILD_TOOLS/lib/apksigner.jar" verify --print-certs walter-system.apk | grep "SHA-256"
cp walter-system.apk ../client/public/download/walter-system.apk
echo "Copied to client/public/download/walter-system.apk"
