package me.brume.diffuser;

import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        // Bird's SDK requires Android 8 (API 26); on older phones we skip
        // registration entirely so its classes are never loaded. The web
        // layer treats a missing plugin as "push unavailable".
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            registerPlugin(BirdPushPlugin.class);
        }
        super.onCreate(savedInstanceState);
    }
}
