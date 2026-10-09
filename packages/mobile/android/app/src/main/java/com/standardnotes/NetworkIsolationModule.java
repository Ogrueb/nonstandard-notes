package com.standardnotes;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Offline build: lets the React Native shell read and change the network isolation setting
 * (NetworkIsolationSetting). Exposed to JavaScript as NativeModules.NetworkIsolation.
 */
public class NetworkIsolationModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public NetworkIsolationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "NetworkIsolation";
    }

    @ReactMethod
    public void isEnabled(Promise promise) {
        promise.resolve(NetworkIsolationSetting.isEnabled(reactContext));
    }

    @ReactMethod
    public void setEnabled(boolean enabled, Promise promise) {
        try {
            if (NetworkIsolationSetting.setEnabled(reactContext, enabled)) {
                promise.resolve(enabled);
            } else {
                promise.reject("E_NETWORK_ISOLATION", "Could not save the network isolation setting");
            }
        } catch (Exception e) {
            promise.reject("E_NETWORK_ISOLATION", e);
        }
    }
}
