package com.standardnotes;

import com.reactnativecommunity.webview.RNCWebView;
import com.reactnativecommunity.webview.RNCWebViewClient;
import com.reactnativecommunity.webview.RNCWebViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import android.view.inputmethod.InputConnectionWrapper;
import com.facebook.react.module.annotations.ReactModule;
import com.reactnativecommunity.webview.RNCWebViewWrapper;

import android.util.Log;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import androidx.annotation.NonNull;

import java.io.ByteArrayInputStream;
import java.util.HashMap;

@ReactModule(name = CustomWebViewManager.REACT_CLASS)
public class CustomWebViewManager extends RNCWebViewManager {
	/* This name must match what we’re referring to in JS */
	protected static final String REACT_CLASS = "CustomWebView";

	/**
	 * Offline build: blocks every request the WebView makes to a host outside the allowlist,
	 * including <img>, <link>, <iframe> and CSS url() loads that the JavaScript guard
	 * (OfflineAllowlist.ts) cannot see. The blocked request gets an empty 403 response at once.
	 * With network isolation on (the default) only the local network is allowed; with it off, the
	 * internet is allowed too, except Standard Notes' own domains (NetworkIsolationSetting).
	 */
	protected static class CustomWebViewClient extends RNCWebViewClient {
		private static final String TAG = "OfflineAllowlist";

		@Override
		public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
			String url = request.getUrl() != null ? request.getUrl().toString() : null;
			boolean isolated = NetworkIsolationSetting.isEnabled(view != null ? view.getContext() : null);
			if (OfflineAllowlist.isAllowedUrl(url, isolated)) {
				return super.shouldInterceptRequest(view, request);
			}

			Log.w(TAG, "blocked " + request.getMethod() + " " + url);
			return new WebResourceResponse(
				"text/plain",
				"utf-8",
				403,
				"Blocked by offline build",
				new HashMap<String, String>(),
				new ByteArrayInputStream(new byte[0])
			);
		}
	}

	protected static class CustomWebView extends RNCWebView {
		public CustomWebView(ThemedReactContext reactContext) {
			super(reactContext);
		}

		@Override
		public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
			InputConnection con = super.onCreateInputConnection(outAttrs);
			if (con == null) {
				return null;
			}
			return new CustomInputConnection(con, true);
		}

		private class CustomInputConnection extends InputConnectionWrapper {
			public CustomInputConnection(InputConnection target, boolean mutable) {
				super(target, mutable);
			}

			@Override
			public boolean sendKeyEvent(KeyEvent event) {
				if (event.getAction() == KeyEvent.ACTION_DOWN && event.getKeyCode() == KeyEvent.KEYCODE_DEL) {
					// Un-comment if you wish to cancel the backspace:
					// return false;
				}
				return super.sendKeyEvent(event);
			}

			@Override
			public boolean deleteSurroundingText(int beforeLength, int afterLength) {       
				// magic: in latest Android, deleteSurroundingText(1, 0) will be called for backspace
				if (beforeLength == 1 && afterLength == 0) {
					// backspace
					return sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL)) 
						&& sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DEL));
				}
				return super.deleteSurroundingText(beforeLength, afterLength);
			}
		}
	}

	@Override
	public RNCWebViewWrapper createViewInstance(ThemedReactContext reactContext) {
		return super.createViewInstance(reactContext);
	}

	@Override
	public String getName() {
		return REACT_CLASS;
	}

	/**
	 * Offline build: this previously took an RNCWebView, which never overrode the library's
	 * addEventEmitters(ThemedReactContext, RNCWebViewWrapper), so CustomWebViewClient was never
	 * installed. Same body as the library's, with the custom client.
	 */
	@Override
	protected void addEventEmitters(@NonNull ThemedReactContext reactContext, RNCWebViewWrapper viewWrapper) {
		viewWrapper.getWebView().setWebViewClient(new CustomWebViewClient());
	}
}
