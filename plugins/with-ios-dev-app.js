const { withInfoPlist, withXcodeProject } = require("expo/config-plugins");

// Give Debug its own iOS identity while keeping Release on the App Store ID.
module.exports = (config) => {
  const bundleId = config.ios.bundleIdentifier;

  config = withInfoPlist(config, (config) => {
    config.modResults.CFBundleDisplayName = "$(SAVIASOUND_APP_NAME)";
    return config;
  });

  return withXcodeProject(config, (config) => {
    for (const buildConfig of Object.values(config.modResults.pbxXCBuildConfigurationSection())) {
      if (!buildConfig || typeof buildConfig !== "object" || !buildConfig.buildSettings) continue;
      if (buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER?.replaceAll('"', "") !== bundleId) continue;

      const isDebug = buildConfig.name === "Debug";
      buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = isDebug ? `${bundleId}.dev` : bundleId;
      buildConfig.buildSettings.SAVIASOUND_APP_NAME = isDebug ? '"saviasound Dev"' : '"saviasound"';
    }
    return config;
  });
};
