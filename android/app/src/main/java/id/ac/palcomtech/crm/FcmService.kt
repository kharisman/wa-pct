package id.ac.palcomtech.crm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

const val CHANNEL_ID = "pesan_masuk"

class FcmService : FirebaseMessagingService() {

    // Token baru → simpan; MainActivity yang mendaftarkannya ke server (pakai sesi login web)
    override fun onNewToken(token: String) {
        getSharedPreferences("fcm", Context.MODE_PRIVATE).edit().putString("token", token).apply()
    }

    // Dipanggil saat pesan datang & app di foreground (kalau background, sistem tampil sendiri)
    override fun onMessageReceived(msg: RemoteMessage) {
        val title = msg.notification?.title ?: "Pesan masuk"
        val body = msg.notification?.body ?: msg.data["body"] ?: ""
        showNotification(this, title, body, msg.data["wa_id"])
    }
}

fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val ch = NotificationChannel(CHANNEL_ID, "Pesan masuk", NotificationManager.IMPORTANCE_HIGH)
        ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }
}

fun showNotification(ctx: Context, title: String, body: String, waId: String? = null) {
    ensureChannel(ctx)
    val intent = Intent(ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra("wa_id", waId)
    val pi = PendingIntent.getActivity(ctx, waId?.hashCode() ?: 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle(title)
        .setContentText(body)
        .setAutoCancel(true)
        .setContentIntent(pi)
        .build()
    ctx.getSystemService(NotificationManager::class.java).notify(System.currentTimeMillis().toInt(), n)
}
