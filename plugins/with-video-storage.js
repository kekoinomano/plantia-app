const { withAndroidManifest } = require('expo/config-plugins');

module.exports = config => withAndroidManifest(config, config => {
  const manifest = config.modResults.manifest;
  manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const permissions = manifest['uses-permission'] ?? [];
  const name = 'android.permission.WRITE_EXTERNAL_STORAGE';
  let permission = permissions.find(item => item.$['android:name'] === name);
  if (!permission) {
    permission = { $: { 'android:name': name } };
    permissions.push(permission);
  }
  permission.$['android:maxSdkVersion'] = '28';
  permission.$['tools:replace'] = 'android:maxSdkVersion';
  manifest['uses-permission'] = permissions;
  return config;
});
