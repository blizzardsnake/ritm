package ch.duartesantos.opengym;
import org.junit.Test;
import static org.junit.Assert.*;

public class PersonalUpdatePolicyTest {
    private static final String REPO = "blizzardsnake/ritm";
    private static final String URL = "https://github.com/blizzardsnake/ritm/releases/download/ritm-v1.3.9-personal.3/RITM-1.3.9-personal.3.apk";
    @Test public void onlyExactPinnedReleaseUrlsAreAccepted() {
        assertTrue(PersonalUpdatePolicy.trustedReleaseUrl(URL, REPO));
        for (String bad : new String[] { URL.replace("https:", "http:"), URL.replace("blizzardsnake", "other"), URL + "?x=1", URL + "#x", URL.replace("github.com", "github.com.evil.example"), URL.replace("github.com", "user@github.com"), URL.replace("github.com", "github.com:444"), "file:///tmp/a.apk", null }) {
            assertFalse(bad, PersonalUpdatePolicy.trustedReleaseUrl(bad, REPO));
        }
    }
    @Test public void redirectsMustRemainHttpsOnExactGithubAssetHosts() {
        assertTrue(PersonalUpdatePolicy.trustedRedirect("https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sig=x"));
        assertTrue(PersonalUpdatePolicy.trustedRedirect("https://objects.githubusercontent.com/path?sig=x"));
        assertFalse(PersonalUpdatePolicy.trustedRedirect("https://release-assets.githubusercontent.com.evil.example/path"));
        assertFalse(PersonalUpdatePolicy.trustedRedirect("http://objects.githubusercontent.com/path"));
        assertFalse(PersonalUpdatePolicy.trustedRedirect("https://user@github.com/a"));
    }
    @Test public void packageVersionAndSignerMustMatchThePersonalUpgrade() {
        String cert = "a".repeat(64);
        assertTrue(PersonalUpdatePolicy.acceptsIdentity("local.opengym.personal", 10002, cert, "local.opengym.personal", 10003, cert, 10003, cert));
        assertFalse(PersonalUpdatePolicy.acceptsIdentity("local.opengym.personal", 10003, cert, "local.opengym.personal", 10003, cert, 10003, cert));
        assertFalse(PersonalUpdatePolicy.acceptsIdentity("local.opengym.personal", 10002, cert, "local.opengym.personal", 10001, cert, 10003, cert));
        assertFalse(PersonalUpdatePolicy.acceptsIdentity("local.opengym.personal", 10002, cert, "ch.duartesantos.opengym", 10003, cert, 10003, cert));
        assertFalse(PersonalUpdatePolicy.acceptsIdentity("local.opengym.personal.test", 10002, cert, "local.opengym.personal", 10003, cert, 10003, cert));
        assertFalse(PersonalUpdatePolicy.acceptsIdentity("local.opengym.personal", 10002, cert, "local.opengym.personal", 10003, "b".repeat(64), 10003, cert));
        assertFalse(PersonalUpdatePolicy.acceptsIdentity("local.opengym.personal", 10002, "b".repeat(64), "local.opengym.personal", 10003, cert, 10003, cert));
    }
}
