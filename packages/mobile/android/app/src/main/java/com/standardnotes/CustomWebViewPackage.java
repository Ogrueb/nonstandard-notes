package com.standardnotes;

import java.util.Arrays;
import java.util.Collections;
import java.util.ArrayList;
import java.util.List;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

public class CustomWebViewPackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    /** Offline build: network isolation setting, used together with CustomWebViewManager */
    return Arrays.<NativeModule>asList(new NetworkIsolationModule(reactContext));
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Arrays.<ViewManager>asList(new CustomWebViewManager());
  }
}