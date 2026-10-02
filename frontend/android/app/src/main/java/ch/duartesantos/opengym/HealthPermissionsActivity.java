package ch.duartesantos.opengym;

import android.os.Bundle;
import android.graphics.Color;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

/** Public permission rationale only. No private profile, workout or health data is shown here. */
public class HealthPermissionsActivity extends AppCompatActivity {
    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(9, 12, 17));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (28 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding * 2, padding, padding * 2);
        TextView title = new TextView(this);
        title.setText(R.string.ritm_health_privacy_title);
        title.setTextSize(27); title.setTextColor(Color.rgb(221, 255, 115));
        TextView body = new TextView(this);
        body.setText(R.string.ritm_health_privacy_body);
        body.setTextSize(17); body.setTextColor(Color.rgb(247, 249, 252));
        body.setPadding(0, padding, 0, padding); body.setLineSpacing(5, 1.1f);
        content.addView(title); content.addView(body); scroll.addView(content); setContentView(scroll);
    }
}
