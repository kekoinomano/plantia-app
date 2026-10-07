const { AndroidConfig, withAndroidManifest, withAppBuildGradle } = require("expo/config-plugins");

// Keep release's identity unchanged; debug can coexist with the installed APK.
module.exports = (config) => {
  config = withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.$["android:label"] = "${saviasoundAppLabel}";
    return config;
  });
  return withAppBuildGradle(config, (config) => {
    const marker = "// saviasound: separate development installation";
    if (!config.modResults.contents.includes(marker)) {
      config.modResults.contents += `
${marker}
android {
    defaultConfig {
        manifestPlaceholders.saviasoundAppLabel = "saviasound"
    }
    buildTypes {
        debug {
            applicationIdSuffix ".dev"
            manifestPlaceholders.saviasoundAppLabel = "saviasound Dev"
        }
    }
}
`;
    }
    return config;
  });
};
