package cz.waltersystem.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The whole app: https://app.waltersystem.cz in Android's System WebView.
 *
 * A browser gives a website the microphone, a file picker, downloads and
 * links to other apps for free; a WebView does none of that on its own, so
 * this class does it:
 * - microphone (Jarvis's voice): the page's request is granted once Android's
 *   RECORD_AUDIO permission is, and only for our own site;
 * - file inputs: Android's picker;
 * - files the page makes in memory (blob: links, Jarvis's Word/PDF/Excel,
 *   document previews): the page's own bridge (client/src/nativeBridge.ts)
 *   sends them here as base64, and they are saved to Downloads and opened;
 * - every link off our site (mailto:, tel:, Gmail/Outlook compose, the web)
 *   opens in the app that handles it; popups (target=_blank) too.
 */
public class MainActivity extends ComponentActivity {
    private static final String BRIDGE_NAME = "WalterAndroid";

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileCallback;
    private PermissionRequest pendingPermission;
    private ActivityResultLauncher<Intent> fileChooser;
    private ActivityResultLauncher<String> micPermission;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw under the system bars; the purple root shows through around the
        // page, with light icons on it.
        EdgeToEdge.enable(this,
                SystemBarStyle.dark(Color.TRANSPARENT),
                SystemBarStyle.dark(Color.TRANSPARENT));
        super.onCreate(savedInstanceState);

        fileChooser = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> deliverFiles(result.getResultCode(), result.getData()));
        micPermission = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                this::onMicPermission);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(ContextCompat.getColor(this, R.color.brand));
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // The page stays clear of the status bar, the navigation bar, a notch
        // and the keyboard (adjustResize does nothing edge to edge).
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        configureWebView();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    // Keep the page (and an unsent message) for when the app is
                    // opened again, as a browser tab would.
                    moveTaskToBack(true);
                }
            }
        });

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(BuildConfig.START_URL);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Jarvis reads answers aloud without a tap on each one.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        // Lets the site tell it is running in this app (InstallAppButton).
        settings.setUserAgentString(settings.getUserAgentString()
                + " WalterSystemApp/" + BuildConfig.VERSION_NAME);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        // Only our own site can reach the bridge.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, BRIDGE_NAME,
                    Collections.singleton("https://" + BuildConfig.APP_HOST),
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        String data = message.getData();
                        if (data != null) handleBridgeMessage(data);
                    });
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Frames (the Office document preview) load where they are.
                if (!request.isForMainFrame()) return false;
                return openOutsideIfForeign(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOfflinePage();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The page's engine crashed or was killed for memory: start over.
                recreate();
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                handlePermissionRequest(request);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = callback;
                Intent intent = params.createIntent();
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    fileChooser.launch(intent);
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingFileCallback = null;
                    return false;
                }
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                                          Message resultMsg) {
                // target=_blank and window.open: a throwaway view that only
                // learns the address, then the link opens where it belongs.
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    private boolean handled;

                    private void take(Uri uri) {
                        if (handled || uri == null) return;
                        handled = true;
                        if (isOwnSite(uri)) webView.loadUrl(uri.toString());
                        else openOutside(uri);
                        main.post(popup::destroy);
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        take(request.getUrl());
                        return true;
                    }

                    @Override
                    public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                        if (url != null && !url.equals("about:blank")) take(Uri.parse(url));
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        // A plain download link on our site (not a blob: the bridge has
        // those): Android's download manager, with the session cookies.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme)) return;
            try {
                DownloadManager.Request request = new DownloadManager.Request(uri);
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                manager.enqueue(request);
                toast(getString(R.string.saved_to_downloads, name));
            } catch (RuntimeException e) {
                openOutside(uri);
            }
        });
    }

    // ---- Links -------------------------------------------------------------

    private static boolean isOwnSite(Uri uri) {
        return "https".equals(uri.getScheme()) && BuildConfig.APP_HOST.equals(uri.getHost());
    }

    /** True when the address was handed to another app. */
    private boolean openOutsideIfForeign(Uri uri) {
        if (isOwnSite(uri)) return false;
        String scheme = uri.getScheme();
        // The offline page's own data: address, and in-page blob:/data: URLs.
        if ("data".equals(scheme) || "blob".equals(scheme) || "about".equals(scheme)) return false;
        openOutside(uri);
        return true;
    }

    private void openOutside(Uri uri) {
        try {
            Intent intent;
            if ("intent".equals(uri.getScheme())) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            toast(getString(R.string.no_app_for_link));
        }
    }

    // ---- Microphone --------------------------------------------------------

    private void handlePermissionRequest(PermissionRequest request) {
        boolean ours = BuildConfig.APP_HOST.equals(request.getOrigin().getHost());
        boolean wantsMic = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsMic = true;
        }
        if (!ours || !wantsMic) {
            request.deny();
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            return;
        }
        if (pendingPermission != null) pendingPermission.deny();
        pendingPermission = request;
        micPermission.launch(Manifest.permission.RECORD_AUDIO);
    }

    private void onMicPermission(boolean granted) {
        PermissionRequest request = pendingPermission;
        pendingPermission = null;
        if (request == null) return;
        if (granted) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            request.deny();
            toast(getString(R.string.mic_denied));
        }
    }

    // ---- File inputs -------------------------------------------------------

    private void deliverFiles(int resultCode, Intent data) {
        ValueCallback<Uri[]> callback = pendingFileCallback;
        pendingFileCallback = null;
        if (callback == null) return;
        if (resultCode != RESULT_OK || data == null) {
            callback.onReceiveValue(null);
            return;
        }
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        callback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
    }

    // ---- Files from the page (the bridge) -----------------------------------

    /**
     * {"type":"file","data":"<base64>","filename":"x.docx","mime":"...","open":false}
     * saves to Downloads and opens it; with "open":true (a document preview)
     * it is only opened, from the cache.
     */
    private void handleBridgeMessage(String json) {
        io.execute(() -> {
            try {
                JSONObject message = new JSONObject(json);
                if (!"file".equals(message.optString("type"))) return;
                byte[] bytes = Base64.decode(message.getString("data"), Base64.DEFAULT);
                String mime = message.optString("mime", "");
                String name = fileName(message.optString("filename", ""), mime);
                if (mime.isEmpty()) mime = mimeFromName(name);
                boolean onlyOpen = message.optBoolean("open", false);
                Uri uri = onlyOpen ? writeToCache(name, bytes) : writeToDownloads(name, mime, bytes);
                String finalMime = mime;
                main.post(() -> {
                    if (!onlyOpen) toast(getString(R.string.saved_to_downloads, name));
                    viewFile(uri, finalMime);
                });
            } catch (Exception e) {
                main.post(() -> toast(getString(R.string.file_failed)));
            }
        });
    }

    private Uri writeToCache(String name, byte[] bytes) throws Exception {
        File dir = new File(getCacheDir(), "opened");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("cache");
        File file = new File(dir, name);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".files", file);
    }

    private Uri writeToDownloads(String name, String mime, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("insert");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("open");
                out.write(bytes);
            }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        }
        // Android 7–9: the shared Downloads folder needs a storage permission,
        // so the file goes to the app's own one and is opened from there.
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) return writeToCache(name, bytes);
        File file = new File(dir, name);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".files", file);
    }

    private void viewFile(Uri uri, String mime) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, mime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            toast(getString(R.string.no_app_for_file));
        }
    }

    private static String fileName(String given, String mime) {
        String name = given == null ? "" : given.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (name.isEmpty() || name.startsWith(".")) name = "soubor" + name;
        if (!name.contains(".")) {
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            if (ext != null) name = name + "." + ext;
        }
        return name.length() > 120 ? name.substring(name.length() - 120) : name;
    }

    private static String mimeFromName(String name) {
        String ext = MimeTypeMap.getFileExtensionFromUrl(Uri.encode(name));
        String mime = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
        return mime == null ? "application/octet-stream" : mime;
    }

    // ---- Offline -----------------------------------------------------------

    private void showOfflinePage() {
        String html = "<!doctype html><html lang=cs><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;font-family:sans-serif;display:flex;min-height:100vh;align-items:center;"
                + "justify-content:center;background:#f6f4fb;color:#1f1235;text-align:center;padding:24px;box-sizing:border-box'>"
                + "<div><h2 style='margin:0 0 8px'>Nelze se připojit</h2>"
                + "<p style='margin:0 0 20px;color:#5f5873'>Walter System potřebuje internet. Zkontrolujte připojení.</p>"
                + "<a href='" + BuildConfig.START_URL + "' style='display:inline-block;background:#7C3AED;color:#fff;"
                + "padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600'>Zkusit znovu</a></div>";
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ---- Lifecycle ---------------------------------------------------------

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        io.shutdown();
        webView.destroy();
        super.onDestroy();
    }
}
