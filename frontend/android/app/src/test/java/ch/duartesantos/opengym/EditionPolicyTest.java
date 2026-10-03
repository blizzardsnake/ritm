package ch.duartesantos.opengym;
import org.junit.Test;
import static org.junit.Assert.*;
public class EditionPolicyTest {
    @Test public void personalReleaseAndDebugCannotInstallUpstreamUpdates() {
        assertFalse(EditionPolicy.allowsUpstreamUpdates("local.opengym.personal"));
        assertFalse(EditionPolicy.allowsUpstreamUpdates("local.opengym.personal.test"));
        assertFalse(EditionPolicy.allowsUpstreamUpdates(null));
        assertTrue(EditionPolicy.allowsUpstreamUpdates("ch.duartesantos.opengym"));
    }
}
