package expo.modules.plantiapcm

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.facebook.react.ReactApplication

/** Home and screen lock leave the session alone. A recents swipe ends it natively,
 * even if JS is busy. Stopping only the notification service doesn't stop PCM. */
class PlantiaPlaybackLifecycleService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
  override fun onTaskRemoved(rootIntent: Intent?) {
    (application as? ReactApplication)?.reactHost?.destroy("Plantia removed from recents", null)
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }
}
