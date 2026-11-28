package com.allanbalo.movieshub;

import android.annotation.SuppressLint;
import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.util.Rational;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private BridgeWebChromeClient chromeClient;
    private OnBackPressedCallback onBackPressedCallback;
    private int requestedOrientationBeforeFullscreen;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    public void onCreate(Bundle savedInstanceState) {
        // Explicitly enable Hardware Acceleration for the window for smooth video playback
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        super.onCreate(savedInstanceState);

        // Draw the app behind Android's status and navigation bars. The web UI
        // applies safe-area padding to interactive controls so they stay usable.
        configureEdgeToEdgeWindow();

        // Register modern OnBackPressedCallback for predictive back gestures and custom view exit
        onBackPressedCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null && chromeClient != null) {
                    chromeClient.onHideCustomView();
                }
            }
        };
        getOnBackPressedDispatcher().addCallback(this, onBackPressedCallback);

        final WebView webView = this.bridge.getWebView();
        if (webView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
                applySafeAreaCss(webView, insets);
                return insets;
            });
            ViewCompat.requestApplyInsets(webView);

            // Enable Hardware Acceleration on WebView layer level too
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

            // 1. Block Popup Windows & Enable Full-Screen Video Support
            chromeClient = new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onShowCustomView(View view, CustomViewCallback callback) {
                    if (customView != null) {
                        onHideCustomView();
                        return;
                    }

                    customView = view;
                    customViewCallback = callback;
                    onBackPressedCallback.setEnabled(true);
                    requestedOrientationBeforeFullscreen = getRequestedOrientation();
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

                    // Hide the main WebView when full-screen is active
                    // Use INVISIBLE instead of GONE to ensure the WebView stays active for the video stream
                    webView.setVisibility(View.INVISIBLE);

                    // Add the video view to the root DecorView
                    ViewGroup decor = (ViewGroup) getWindow().getDecorView();
                    decor.addView(customView, new FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                    ));

                    // Hide system UI for immersive full-screen using modern WindowInsetsController API if possible
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        WindowInsetsController controller = getWindow().getInsetsController();
                        if (controller != null) {
                            controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                            controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                        }
                    } else {
                        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                                View.SYSTEM_UI_FLAG_FULLSCREEN |
                                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
                        decor.setSystemUiVisibility(flags);
                    }
                }

                @Override
                public void onHideCustomView() {
                    if (customView == null) {
                        return;
                    }

                    ViewGroup decor = (ViewGroup) getWindow().getDecorView();
                    decor.removeView(customView);
                    customView = null;
                    onBackPressedCallback.setEnabled(false);

                    if (customViewCallback != null) {
                        customViewCallback.onCustomViewHidden();
                        customViewCallback = null;
                    }

                    // Restore the main WebView visibility
                    webView.setVisibility(View.VISIBLE);

                    // Restore system UI
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        WindowInsetsController controller = getWindow().getInsetsController();
                        if (controller != null) {
                            controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                        }
                    }

                    // Reapply edge-to-edge after exiting immersive video. On older
                    // Android versions this also restores the layout system flags.
                    configureEdgeToEdgeWindow();

                    setRequestedOrientation(requestedOrientationBeforeFullscreen);
                }

                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    // Prevent the creation of new windows (popups) on click
                    return false;
                }
            };
            webView.setWebChromeClient(chromeClient);

            // 2. Advanced Ad-Blocking & Redirect Protection integrated with Capacitor
            webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request == null || request.getUrl() == null) {
                        return false;
                    }
                    String url = request.getUrl().toString();
                    String host = request.getUrl().getHost();

                    // Always allow Capacitor internal traffic (bridge, local files)
                    if (url.startsWith("capacitor://") || url.startsWith("https://localhost") || url.startsWith("http://localhost")) {
                        return super.shouldOverrideUrlLoading(view, request);
                    }

                    // Allow known video sources, APIs, and CDN providers
                    if (host != null && (
                            host.contains("vidsrc") ||
                            host.contains("2embed") ||
                            host.contains("tmdb") ||
                            host.contains("google") ||
                            host.contains("cloudinary") ||
                            host.contains("akamai") ||
                            host.contains("autoembed") ||
                            host.contains("superembed") ||
                            host.contains("embed.su") ||
                            host.contains("vidlink") ||
                            host.contains("flicky") ||
                            host.contains("moviesapi") ||
                            host.contains("smashy") ||
                            host.contains("gdriveplayer") ||
                            host.contains("aniwave")
                    )) {
                        return super.shouldOverrideUrlLoading(view, request);
                    }

                    // Block 'intent://' and 'market://' links often used to force-open ad apps/Play Store
                    String scheme = request.getUrl().getScheme();
                    if (scheme != null && (scheme.equals("intent") || scheme.equals("market"))) {
                        return true;
                    }

                    // Block top-level redirects that happen without user interaction (auto-redirect ads)
                    if (request.isForMainFrame() && !request.hasGesture()) {
                        return true;
                    }

                    // Fallback for unknown external redirects: block to prevent hijacking
                    return true;
                }

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (request == null || request.getUrl() == null) {
                        return super.shouldInterceptRequest(view, request);
                    }
                    String url = request.getUrl().toString().toLowerCase(Locale.ROOT);
                    String host = request.getUrl().getHost();

                    // Block common ad/tracker domains and scripts by keyword
                    // But EXEMPT whitelisted streaming domains from keyword blocking to avoid breaking players
                    boolean isWhitelisted = host != null && (
                            host.contains("vidsrc") || host.contains("2embed") || host.contains("autoembed") ||
                            host.contains("superembed") || host.contains("vidlink") || host.contains("smashy")
                    );

                    if (!isWhitelisted) {
                        if (url.contains("ads.") || url.contains("doubleclick") || url.contains("popads") ||
                                url.contains("adservice") || url.contains("exoclick") || url.contains("propellerads") ||
                                url.contains("google-analytics") || url.contains("/ads/")) {
                            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                        }
                    }

                    // Crucial: Let Capacitor handle its local assets
                    return super.shouldInterceptRequest(view, request);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    applySafeAreaCss(view, ViewCompat.getRootWindowInsets(view));
                    // Inject CSS to hide common ad overlays that might still load inside the page
                    String cssInjection = "javascript:(function() {" +
                            "var style = document.createElement('style');" +
                            "style.innerHTML = '.ad-unit, .adsbygoogle, #pop-overlay, .popunder, [class*=\"-ad-\"] { display: none !important; }';" +
                            "document.head.appendChild(style);" +
                            "})()";
                    view.loadUrl(cssInjection);
                }
            });

            WebSettings settings = webView.getSettings();

            // Strict Popup Prevention
            settings.setSupportMultipleWindows(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);

            // Media & Storage configuration (optimized for movie streaming)
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            // Mask the "WebView" user agent to bypass player blocks that detect mobile WebViews
            String userAgent = settings.getUserAgentString().replace("; wv", "");
            settings.setUserAgentString(userAgent);

            // Ensure cookies work across origins for player session tokens
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }
    }

    private void configureEdgeToEdgeWindow() {
        android.view.Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
    }

    private void applySafeAreaCss(WebView webView, WindowInsetsCompat insets) {
        if (webView == null || insets == null) {
            return;
        }

        Insets safe = insets.getInsets(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        );
        float density = getResources().getDisplayMetrics().density;
        String script = "(function(){var s=document.documentElement.style;" +
            "s.setProperty('--native-safe-area-top','" + (safe.top / density) + "px');" +
            "s.setProperty('--native-safe-area-right','" + (safe.right / density) + "px');" +
            "s.setProperty('--native-safe-area-bottom','" + (safe.bottom / density) + "px');" +
            "s.setProperty('--native-safe-area-left','" + (safe.left / density) + "px');" +
            "})();";
        webView.evaluateJavascript(script, null);
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || bridge == null || customView != null || isInPictureInPictureMode()) {
            return;
        }

        WebView webView = bridge.getWebView();
        if (webView == null) {
            return;
        }

        webView.evaluateJavascript(
            "(function(){var p=document.getElementById('player-container');var f=document.getElementById('player');" +
                "return !!p&&!!f&&(p.classList.contains('player-open')||p.classList.contains('pip-mode'))&&!!f.getAttribute('src');})()",
            result -> {
                if (!"true".equals(result) || isFinishing() || isInPictureInPictureMode()) {
                    return;
                }

                webView.evaluateJavascript("document.body.classList.add('native-pip-mode')", null);
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9))
                    .build();
                if (!enterPictureInPictureMode(params)) {
                    webView.evaluateJavascript("document.body.classList.remove('native-pip-mode')", null);
                }
            }
        );
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) {
            webView.evaluateJavascript(
                "document.body.classList.toggle('native-pip-mode'," + isInPictureInPictureMode + ")",
                null
            );
        }
    }
}
