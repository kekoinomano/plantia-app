const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

// Keep playback on Home/lock, but remove the foreground service with the task.
// PlantiaPlaybackLifecycleService also tears down the runtime on a recents swipe.
// Register BEFORE Audio API: Expo runs these manifest interceptors in reverse.
module.exports = (config) => withAndroidManifest(config, (config) => {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
  const service = application.service?.find((entry) =>
    entry.$["android:name"] === "com.swmansion.audioapi.system.CentralizedForegroundService",
  );
  if (!service) throw new Error("List with-background-playback before react-native-audio-api in app.json.");
  service.$["android:stopWithTask"] = "true";
  return config;
});
