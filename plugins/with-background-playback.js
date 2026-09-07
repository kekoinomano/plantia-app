const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

// Audio API 0.13.3 defaults to stopping its service when the activity is swiped
// away. Keep an active listening session alive until the user presses Stop.
// Register BEFORE Audio API: Expo runs these manifest interceptors in reverse.
module.exports = (config) => withAndroidManifest(config, (config) => {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
  const service = application.service?.find((entry) =>
    entry.$["android:name"] === "com.swmansion.audioapi.system.CentralizedForegroundService",
  );
  if (!service) throw new Error("List with-background-playback before react-native-audio-api in app.json.");
  service.$["android:stopWithTask"] = "false";
  return config;
});
