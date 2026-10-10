package com.jarvis.ceo;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/**
 * Fired on BOOT_COMPLETED. Posts a persistent notification that lets the user
 * tap to re-open JARVIS and re-enable wake word listening.
 *
 * On Android 14+ we cannot start a microphone foreground service directly from
 * a boot receiver. Instead we surface a notification: one tap brings the app
 * to the foreground, and the JS layer automatically re-starts the wake word
 * service because WAKE_WORD_ENABLED=true is persisted in AsyncStorage.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID   = "jarvis_boot";
    private static final String CHANNEL_NAME = "JARVIS Startup";
    private static final int    NOTIF_ID     = 8765;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!android.content.Intent.ACTION_BOOT_COMPLETED.equals(action) &&
            !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }

        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Create notification channel (required API 26+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("JARVIS wake word service auto-start");
            nm.createNotificationChannel(channel);
        }

        // Tap action: bring MainActivity to foreground (JS will auto-start wake word)
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra("autoStartWakeWord", true);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(context, 0, launchIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("JARVIS is ready")
            .setContentText("Tap to activate wake word — \"Jarvis\"")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pi)
            .setAutoCancel(true);

        nm.notify(NOTIF_ID, builder.build());
    }
}
