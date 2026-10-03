package ch.duartesantos.opengym;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Runs only on a disposable emulator: no account, watch or provider key. */
@RunWith(AndroidJUnit4.class)
public class RitmLaunchTest {
    @Test public void offlineNativeShellRendersAndKeepsUpgradeProbe() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        try (java.io.InputStream assets = context.getAssets().open("public/index.html")) {
            assertTrue(assets.read() >= 0);
        }
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(launch);
        instrumentation.waitForIdleSync();
        WebView view = activity.getBridge().getWebView();
        instrumentation.runOnMainSync(() -> view.getSettings().setBlockNetworkLoads(true));
        String text = "";
        long deadline = android.os.SystemClock.elapsedRealtime() + 120000;
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            CountDownLatch ready = new CountDownLatch(1);
            AtomicReference<String> reply = new AtomicReference<>("\"\"");
            instrumentation.runOnMainSync(() -> view.evaluateJavascript("document.body.innerText", value -> { reply.set(value); ready.countDown(); }));
            assertTrue("WebView callback", ready.await(10, TimeUnit.SECONDS));
            text = new JSONArray("[" + reply.get() + "]").optString(0, "");
            if (text.length() > 30) break;
            Thread.sleep(500);
        }
        assertTrue("Local React shell must render", text.length() > 30);
        assertFalse(text.contains("Webpage not available"));
        context.getSharedPreferences("ritm_upgrade_probe", Context.MODE_PRIVATE).edit().putString("fixture", "emulator-only").commit();
        Bitmap screenshot = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(screenshot);
        try (FileOutputStream out = new FileOutputStream(new File(context.getFilesDir(), "ritm-emulator-launch.png"))) { screenshot.compress(Bitmap.CompressFormat.PNG, 100, out); }
        screenshot.recycle();
        instrumentation.runOnMainSync(activity::finish);
    }
}
