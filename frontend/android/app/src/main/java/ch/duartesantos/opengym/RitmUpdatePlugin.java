package ch.duartesantos.opengym;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Personal channel only. A public manifest never bypasses native APK verification. */
@CapacitorPlugin(name = "RitmUpdate")
public class RitmUpdatePlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile boolean cancelled;
    private volatile HttpURLConnection connection;

    @PluginMethod public void getStatus(PluginCall call) {
        try {
            PackageInfo installed = installedInfo();
            JSObject result = new JSObject();
            result.put("applicationId", installed.packageName);
            result.put("versionCode", versionCode(installed));
            result.put("versionName", installed.versionName);
            result.put("sdk", Build.VERSION.SDK_INT);
            result.put("signingCertSha256", signer(installed));
            result.put("canInstall", getContext().getPackageManager().canRequestPackageInstalls());
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not read installed version", error); }
    }

    @PluginMethod public void download(PluginCall call) {
        final Release release;
        try { release = release(call); } catch (Exception error) { call.reject("Release verification failed", error); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("An update operation is already running"); return; }
        cancelled = false;
        executor.execute(() -> {
            File partial = new File(getContext().getCacheDir(), "ritm-update.part");
            File target = cachedApk();
            try {
                if (target.isFile()) {
                    try { verifyApk(target, release); if (cancelled) throw new IOException("Download cancelled"); progress(release.bytes, release.bytes); call.resolve(); return; }
                    catch (Exception ignored) { if (!target.delete()) throw new IOException("Could not replace cached update"); }
                }
                if (getContext().getCacheDir().getUsableSpace() < release.bytes + 5 * 1024 * 1024) throw new IOException("Not enough storage for update");
                HttpURLConnection response = openDownload(release.url);
                long declared = response.getContentLengthLong();
                if (declared >= 0 && declared != release.bytes) throw new IOException("Release verification failed");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long received = 0, lastProgress = 0;
                try (BufferedInputStream input = new BufferedInputStream(response.getInputStream()); FileOutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[64 * 1024];
                    int length;
                    while ((length = input.read(buffer)) != -1) {
                        if (cancelled) throw new IOException("Download cancelled");
                        received += length;
                        if (received > release.bytes || received > PersonalUpdatePolicy.MAX_APK_BYTES) throw new IOException("Release verification failed");
                        output.write(buffer, 0, length); digest.update(buffer, 0, length);
                        long now = System.currentTimeMillis();
                        if (now - lastProgress >= 150) { progress(received, release.bytes); lastProgress = now; }
                    }
                    output.getFD().sync();
                }
                if (cancelled) throw new IOException("Download cancelled");
                if (received != release.bytes || !release.sha256.equals(hex(digest.digest()))) throw new IOException("Release verification failed");
                verifyApk(partial, release);
                if (cancelled) throw new IOException("Download cancelled");
                if (!partial.renameTo(target)) throw new IOException("Could not save downloaded update");
                progress(received, release.bytes); call.resolve();
            } catch (Exception error) { call.reject(cancelled ? "Download cancelled" : message(error, "Download failed"), error); }
            finally {
                partial.delete();
                HttpURLConnection current = connection; connection = null; if (current != null) current.disconnect();
                busy.set(false);
            }
        });
    }

    @PluginMethod public void cancelDownload(PluginCall call) {
        cancelled = true;
        HttpURLConnection current = connection;
        if (current != null) current.disconnect();
        call.resolve();
    }

    @PluginMethod public void install(PluginCall call) {
        final Release release;
        try { release = release(call); } catch (Exception error) { call.reject("Release verification failed", error); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("An update operation is already running"); return; }
        executor.execute(() -> {
            try {
                // Re-read bytes and signatures at installation time, including after permissions.
                verifyApk(cachedApk(), release);
                getActivity().runOnUiThread(() -> {
                    try {
                        JSObject result = new JSObject();
                        boolean needsPermission = !getContext().getPackageManager().canRequestPackageInstalls();
                        result.put("needsPermission", needsPermission);
                        Intent intent;
                        if (needsPermission) {
                            intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                        } else {
                            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", cachedApk());
                            intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        }
                        getActivity().startActivity(intent);
                        call.resolve(result);
                    } catch (Exception error) { call.reject("Could not open Android installer", error); }
                    finally { busy.set(false); }
                });
            } catch (Exception error) { busy.set(false); call.reject("Release verification failed", error); }
        });
    }

    private HttpURLConnection openDownload(String initialUrl) throws Exception {
        String next = initialUrl;
        for (int redirect = 0; redirect <= 5; redirect++) {
            if (cancelled) throw new IOException("Download cancelled");
            if (redirect > 0 && !PersonalUpdatePolicy.trustedRedirect(next)) throw new IOException("Release verification failed");
            HttpURLConnection current = (HttpURLConnection) new URI(next).toURL().openConnection();
            connection = current;
            current.setInstanceFollowRedirects(false); current.setConnectTimeout(20000); current.setReadTimeout(30000);
            current.setRequestProperty("User-Agent", "RITM-Android-update"); current.setRequestProperty("Accept-Encoding", "identity");
            int status = current.getResponseCode();
            if (status == 200) return current;
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String location = current.getHeaderField("Location"); current.disconnect();
                if (location == null) throw new IOException("Download failed");
                next = new URI(next).resolve(location).toString();
            } else { current.disconnect(); throw new IOException("Could not download update (HTTP " + status + ")"); }
        }
        throw new IOException("Too many download redirects");
    }

    private Release release(PluginCall call) throws Exception {
        String url = call.getString("apkUrl"), hash = call.getString("sha256"), name = call.getString("versionName");
        Integer code = call.getInt("versionCode"), minSdk = call.getInt("minSdk");
        Double bytesValue = call.getDouble("bytes");
        long bytes = bytesValue == null ? -1 : bytesValue.longValue();
        PackageInfo installed = installedInfo();
        if (!PersonalUpdatePolicy.trustedReleaseUrl(url, BuildConfig.RITM_REPOSITORY) || !url.endsWith(".apk")
                || hash == null || !hash.matches("[a-f0-9]{64}") || name == null || !name.matches("[A-Za-z0-9.+_-]{1,80}")
                || code == null || code <= versionCode(installed) || minSdk == null || minSdk < 26 || minSdk > Build.VERSION.SDK_INT
                || bytesValue == null || bytesValue != (double) bytes || bytes < 100000 || bytes > PersonalUpdatePolicy.MAX_APK_BYTES
                || !"local.opengym.personal".equals(installed.packageName) || !BuildConfig.RITM_SIGNER.equals(signer(installed))
                || !BuildConfig.RITM_SIGNER.equals(call.getString("signingCertSha256"))
                || !installed.packageName.equals(call.getString("applicationId"))) throw new IOException("Release verification failed");
        return new Release(url, hash, code, name, minSdk, bytes);
    }

    private void verifyApk(File file, Release release) throws Exception {
        if (!file.isFile() || file.length() != release.bytes) throw new IOException("Release verification failed");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024]; int length;
            while ((length = input.read(buffer)) != -1) digest.update(buffer, 0, length);
        }
        if (!release.sha256.equals(hex(digest.digest()))) throw new IOException("Release verification failed");
        PackageInfo installed = installedInfo();
        PackageInfo candidate = getContext().getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), signatureFlags());
        if (candidate == null || !PersonalUpdatePolicy.acceptsIdentity(installed.packageName, versionCode(installed), signer(installed),
                candidate.packageName, versionCode(candidate), signer(candidate), release.code, BuildConfig.RITM_SIGNER)
                || !release.name.equals(candidate.versionName) || candidate.applicationInfo == null
                || candidate.applicationInfo.minSdkVersion != release.minSdk) throw new IOException("Release verification failed");
    }

    private File cachedApk() { return new File(getContext().getCacheDir(), "ritm-update.apk"); }
    private PackageInfo installedInfo() throws PackageManager.NameNotFoundException { return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), signatureFlags()); }
    private static int signatureFlags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    private static long versionCode(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    private static String signer(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        if (signatures == null || signatures.length != 1) throw new IOException("Release verification failed");
        return hex(MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray()));
    }
    private static String hex(byte[] data) { StringBuilder out = new StringBuilder(); for (byte value : data) out.append(String.format(Locale.ROOT, "%02x", value & 0xff)); return out.toString(); }
    private void progress(long received, long total) { JSObject event = new JSObject(); event.put("received", received); event.put("total", total); notifyListeners("downloadProgress", event); }
    private static String message(Exception error, String fallback) { return error.getMessage() == null ? fallback : error.getMessage(); }
    private record Release(String url, String sha256, int code, String name, int minSdk, long bytes) {}
    @Override protected void handleOnDestroy() { cancelled = true; if (connection != null) connection.disconnect(); executor.shutdownNow(); }
}
