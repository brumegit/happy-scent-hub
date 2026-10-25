package me.brume.diffuser;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.bird.Bird;
import com.bird.contact.models.Attributes;
import com.bird.contact.models.ExternalIdentifier;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import kotlin.coroutines.EmptyCoroutineContext;
import kotlinx.coroutines.BuildersKt;

/**
 * JS name "BirdPush". The Bird Android SDK receives the Firebase push token by
 * itself (BirdFirebaseMessagingService); this plugin asks the Android 13+
 * notification permission, links the Bird contact to the web install id and
 * reports subscribedPush so Bird journeys can target the phone.
 */
@CapacitorPlugin(
    name = "BirdPush",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class BirdPushPlugin extends Plugin {
    private static final String TAG = "BirdPush";
    private static final String PREFS = "brume-bird";
    private static final String EXTERNAL_ID_KEY = "external-id";

    private static Bird bird;
    private static String lastError;

    static synchronized Bird bird(Context context) {
        if (bird == null) {
            try {
                bird = new Bird(context.getApplicationContext());
            } catch (Throwable error) {
                lastError = "Bird init failed: " + error;
                Log.e(TAG, lastError);
            }
        }
        return bird;
    }

    @Override
    public void load() {
        bird(getContext());
    }

    private boolean needsRuntimePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU;
    }

    private String permission() {
        if (!needsRuntimePermission()) return "granted";
        PermissionState state = getPermissionState("notifications");
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private JSObject status() {
        JSObject result = new JSObject();
        String permission = permission();
        Bird instance = bird(getContext());
        result.put("permission", permission);
        // Android has no explicit token callback here: the Bird SDK registers
        // the Firebase token itself as soon as it is running and allowed.
        result.put("registered", instance != null && "granted".equals(permission));
        result.put("birdReady", instance != null);
        if (lastError != null) result.put("error", lastError);
        return result;
    }

    /** Runs a Bird suspend call off the main thread. Failures never reach the app. */
    private void runBird(BirdTask task) {
        Bird instance = bird(getContext());
        if (instance == null) return;
        new Thread(() -> {
            try {
                BuildersKt.runBlocking(EmptyCoroutineContext.INSTANCE, (scope, continuation) -> task.run(instance, continuation));
            } catch (Throwable error) {
                lastError = "Bird call failed: " + error;
                Log.e(TAG, lastError);
            }
        }).start();
    }

    private interface BirdTask {
        Object run(Bird bird, kotlin.coroutines.Continuation<? super kotlin.Unit> continuation);
    }

    private void setSubscribed(boolean subscribed) {
        runBird((b, c) -> b.getContact().putAttributes(new Attributes().put("subscribedPush", subscribed), c));
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (!needsRuntimePermission() || getPermissionState("notifications") == PermissionState.GRANTED) {
            setSubscribed(true);
            call.resolve(status());
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        setSubscribed("granted".equals(permission()));
        call.resolve(status());
    }

    @PluginMethod
    public void sync(PluginCall call) {
        String externalId = call.getString("externalId");
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (externalId != null && !externalId.isEmpty() && !externalId.equals(prefs.getString(EXTERNAL_ID_KEY, null))) {
            runBird((b, c) -> b.getContact().identify(new ExternalIdentifier(externalId), c));
            prefs.edit().putString(EXTERNAL_ID_KEY, externalId).apply();
        }
        String permission = permission();
        if (!"prompt".equals(permission)) setSubscribed("granted".equals(permission));
        call.resolve(status());
    }
}
