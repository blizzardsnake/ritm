package ch.duartesantos.opengym;

import android.content.Context;
import android.content.SharedPreferences;
import android.view.WindowManager;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Device-only interface privacy. Never writes credentials into the synced workout profile. */
@CapacitorPlugin(name = "RitmLock")
public class RitmLockPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean unlocked = false;
    private volatile boolean biometricPending = false;
    private long pausedAt = 0;
    private SharedPreferences preferences;
    private BiometricPrompt prompt;

    @Override public void load() {
        preferences = getContext().getSharedPreferences("ritm_lock", Context.MODE_PRIVATE);
        applySecureWindow(preferences.getBoolean("enabled", false) || preferences.contains("verifier"));
    }
    private String verifier() {
        if (!preferences.getBoolean("enabled", false) && !preferences.contains("verifier")) return null;
        String encoded = preferences.getString("verifier", null);
        if (!PasswordVerifier.wellFormed(encoded)) throw new IllegalArgumentException("App protection settings could not be read. Retry without deleting your data.");
        return encoded;
    }
    private boolean biometricAvailable() { return BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS; }
    private JSObject status() {
        boolean enabled = verifier() != null;
        JSObject result = new JSObject();
        result.put("enabled", enabled); result.put("unlocked", !enabled || unlocked);
        result.put("biometric", enabled && preferences.getBoolean("biometric", false));
        result.put("biometricAvailable", biometricAvailable()); result.put("platform", "android");
        int biometricStatus = BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        result.put("biometricReason", biometricStatus == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ? "not_enrolled"
                : biometricStatus == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE || biometricStatus == BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED ? "not_supported" : "unavailable");
        result.put("retryAt", preferences.getLong("retryAt", 0));
        return result;
    }
    private void save(SharedPreferences.Editor editor) throws IOException { if (!editor.commit()) throw new IOException("Could not save app protection"); }
    private void verify(String password) throws Exception {
        String encoded = verifier();
        if (encoded == null) throw new IllegalStateException("App protection is not enabled");
        long now = System.currentTimeMillis();
        if (preferences.getLong("retryAt", 0) > now) throw new IllegalArgumentException("Too many attempts. Try again shortly.");
        if (!PasswordVerifier.verify(password, encoded)) {
            int failures = Math.min(100, preferences.getInt("failures", 0) + 1);
            long retryAt = failures >= 5 ? now + Math.min(300000, 30000L << Math.min(4, failures - 5)) : 0;
            save(preferences.edit().putInt("failures", failures).putLong("retryAt", retryAt));
            throw new IllegalArgumentException("Incorrect password");
        }
        save(preferences.edit().putInt("failures", 0).putLong("retryAt", 0));
    }
    private interface Operation { void run() throws Exception; }
    private void perform(PluginCall call, Operation operation) {
        executor.execute(() -> { try { operation.run(); call.resolve(); } catch (Exception e) { call.reject(e.getMessage()); } });
    }
    private void applySecureWindow(boolean enabled) {
        getActivity().runOnUiThread(() -> {
            if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
    }
    @PluginMethod public void getStatus(PluginCall call) {
        executor.execute(() -> { try { call.resolve(status()); } catch (Exception e) { call.reject(e.getMessage()); } });
    }
    @PluginMethod public void configure(PluginCall call) {
        perform(call, () -> {
            String password = call.getString("password");
            PasswordVerifier.validate(password);
            if (verifier() != null) verify(call.getString("currentPassword"));
            boolean biometric = Boolean.TRUE.equals(call.getBoolean("biometric", false));
            if (biometric && !biometricAvailable()) throw new IllegalArgumentException("Set up a fingerprint in your phone settings first");
            String encoded = PasswordVerifier.create(password);
            save(preferences.edit().putBoolean("enabled", true).putString("verifier", encoded).putBoolean("biometric", biometric).putInt("failures", 0).putLong("retryAt", 0));
            unlocked = true; applySecureWindow(true);
        });
    }
    @PluginMethod public void unlock(PluginCall call) { perform(call, () -> { verify(call.getString("password")); unlocked = true; }); }
    @PluginMethod public void remove(PluginCall call) {
        perform(call, () -> { verify(call.getString("password")); save(preferences.edit().clear()); unlocked = false; applySecureWindow(false); });
    }
    @PluginMethod public void lock(PluginCall call) { unlocked = false; call.resolve(); }
    @PluginMethod public void authenticate(PluginCall call) {
        executor.execute(() -> {
            try {
                if (verifier() == null || !preferences.getBoolean("biometric", false) || !biometricAvailable()) throw new IllegalStateException("Fingerprint unlock is not enabled");
                getActivity().runOnUiThread(() -> {
                    if (biometricPending) { call.reject("Authentication is already running"); return; }
                    biometricPending = true;
                    AtomicBoolean finished = new AtomicBoolean(false);
                    prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            if (finished.compareAndSet(false, true)) { biometricPending = false; unlocked = true; call.resolve(); }
                        }
                        @Override public void onAuthenticationError(int code, @NonNull CharSequence message) {
                            if (finished.compareAndSet(false, true)) { biometricPending = false; call.reject(message.toString()); }
                        }
                    });
                    try {
                        prompt.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle(getContext().getString(R.string.ritm_unlock_title))
                                .setSubtitle(getContext().getString(R.string.ritm_unlock_subtitle)).setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                                .setNegativeButtonText(getContext().getString(R.string.ritm_use_password)).build());
                    } catch (Exception e) { biometricPending = false; call.reject(e.getMessage()); }
                });
            } catch (Exception e) { call.reject(e.getMessage()); }
        });
    }
    @Override protected void handleOnPause() { if (!biometricPending) pausedAt = System.currentTimeMillis(); }
    @Override protected void handleOnResume() { if (pausedAt > 0 && System.currentTimeMillis() - pausedAt >= 30000) unlocked = false; pausedAt = 0; }
    @Override protected void handleOnDestroy() { if (prompt != null) prompt.cancelAuthentication(); executor.shutdown(); }
}
