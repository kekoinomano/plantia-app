Pod::Spec.new do |s|
  s.name = 'PlantiaPcm'
  s.version = '1.0.0'
  s.summary = 'Sonora PCM block renderer'
  s.description = 'Shared native implementation of the Sonora sample loop.'
  s.license = 'MIT'
  s.author = 'Plantia'
  s.homepage = 'https://expo.dev'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/*.{h,mm,swift}', 'cpp/*.{h,cpp}'
  s.public_header_files = 'ios/PlantiaPcmBridge.h'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17', 'OTHER_CPLUSPLUSFLAGS' => '$(inherited) -O3 -ffp-contract=off' }
end
