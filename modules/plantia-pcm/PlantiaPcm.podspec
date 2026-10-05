Pod::Spec.new do |s|
  s.name = 'PlantiaPcm'
  s.version = '1.0.0'
  s.summary = 'Sonora PCM block renderer'
  s.description = 'Shared native implementation of the Sonora sample loop.'
  s.license = { :type => 'MIT AND LGPL-2.0-or-later', :file => 'third_party/lame-3.100/COPYING' }
  s.author = 'Plantia'
  s.homepage = 'https://expo.dev'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.vendored_frameworks = 'ios/vendor/Sfizz.xcframework'
  s.frameworks = 'Accelerate'
  s.source_files = 'ios/*.{h,mm,swift}', 'cpp/*.{h,cpp}', 'third_party/lame-3.100/config.h', 'third_party/lame-3.100/include/lame.h', 'third_party/lame-3.100/libmp3lame/*.{c,h}', 'third_party/lame-3.100/libmp3lame/vector/lame_intrin.h'
  s.preserve_paths = 'third_party/sfizz-1.2.3/src/sfizz.h', 'third_party/sfizz-1.2.3/src/sfizz_message.h', 'third_party/lame-3.100/COPYING', 'third_party/lame-3.100/LICENSE', 'third_party/lame-3.100/README'
  s.public_header_files = 'ios/PlantiaPcmBridge.h'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES', 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'OTHER_CPLUSPLUSFLAGS' => '$(inherited) -O3 -ffp-contract=off',
    'HEADER_SEARCH_PATHS' => '$(inherited) ${PODS_TARGET_SRCROOT}/third_party/lame-3.100 ${PODS_TARGET_SRCROOT}/third_party/lame-3.100/include ${PODS_TARGET_SRCROOT}/third_party/lame-3.100/libmp3lame',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) HAVE_CONFIG_H'
  }
end
