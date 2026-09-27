#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$root/modules/plantia-pcm/third_party/sfizz-1.2.3"
output="$root/modules/plantia-pcm/ios/vendor/Sfizz.xcframework"
build_root="${TMPDIR:-/tmp}/plantia-sfizz-ios"
if command -v cmake >/dev/null 2>&1; then
  cmake_bin="$(command -v cmake)"
elif [[ -x "${ANDROID_HOME:-}/cmake/3.22.1/bin/cmake" ]]; then
  cmake_bin="$ANDROID_HOME/cmake/3.22.1/bin/cmake"
else
  echo 'CMake is required to build sfizz for iOS' >&2
  exit 1
fi

build_one() {
  local name="$1" sdk="$2" arch="$3" dir="$build_root/$1"
  "$cmake_bin" -S "$source_dir" -B "$dir" -G Ninja \
    -DCMAKE_MAKE_PROGRAM="$(dirname "$cmake_bin")/ninja" \
    -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_SYSROOT="$sdk" \
    -DCMAKE_OSX_ARCHITECTURES="$arch" -DCMAKE_OSX_DEPLOYMENT_TARGET=16.4 \
    -DCMAKE_BUILD_TYPE=Release -DSFIZZ_JACK=OFF -DSFIZZ_RENDER=OFF \
    -DSFIZZ_SHARED=OFF -DSFIZZ_GIT_SUBMODULE_CHECK=OFF -DENABLE_LTO=OFF
  "$cmake_bin" --build "$dir" --target sfizz_static --parallel 6
  xcrun libtool -static -o "$dir/libSfizz.a" "$dir"/library/lib/*.a
}

mkdir -p "$build_root"
build_one device iphoneos arm64
build_one simulator-arm iphonesimulator arm64
build_one simulator-intel iphonesimulator x86_64
mkdir -p "$build_root/simulator-universal"
lipo -create "$build_root/simulator-arm/libSfizz.a" "$build_root/simulator-intel/libSfizz.a" \
  -output "$build_root/simulator-universal/libSfizz.a"
rm -rf "$output"
mkdir -p "$(dirname "$output")"
xcodebuild -create-xcframework \
  -library "$build_root/device/libSfizz.a" -headers "$source_dir/src" \
  -library "$build_root/simulator-universal/libSfizz.a" -headers "$source_dir/src" \
  -output "$output"
