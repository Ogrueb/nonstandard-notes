package com.standardnotes;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * Offline build: the network isolation setting, stored on the device in SharedPreferences.
 * It is never synced and is not cleared when signing out.
 *
 * On (the default): the WebView may only reach the local network.
 * Off: it may also reach the internet, except Standard Notes' own domains.
 *
 * Read by the WebView client (on a background thread, for every request) and by the React Native
 * shell before it creates the WebView. Any failure to read it counts as on (fail closed).
 */
public final class NetworkIsolationSetting {
    private static final String TAG = "OfflineAllowlist";
    private static final String PREFS_NAME = "offline_build";
    private static final String KEY_ENABLED = "network_isolation_enabled";

    /** Cached value; null until first read */
    private static volatile Boolean cachedEnabled = null;

    private NetworkIsolationSetting() {}

    public static boolean isEnabled(Context context) {
        Boolean cached = cachedEnabled;
        if (cached != null) {
            return cached;
        }
        if (context == null) {
            return true;
        }
        boolean enabled;
        try {
            enabled = prefs(context).getBoolean(KEY_ENABLED, true);
        } catch (Exception e) {
            Log.w(TAG, "could not read network isolation setting; treating it as on", e);
            return true;
        }
        cachedEnabled = enabled;
        return enabled;
    }

    /** Writes synchronously, so the value is on disk before the app reloads. */
    public static boolean setEnabled(Context context, boolean enabled) {
        boolean saved = prefs(context).edit().putBoolean(KEY_ENABLED, enabled).commit();
        if (saved) {
            cachedEnabled = enabled;
            Log.i(TAG, "network isolation " + (enabled ? "on" : "off"));
        }
        return saved;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
