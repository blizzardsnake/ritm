package ch.duartesantos.opengym;

import java.net.URI;
import java.util.Set;

/** Pure policy shared by downloader and installer; no Android dependencies. */
final class PersonalUpdatePolicy {
    static final long MAX_APK_BYTES = 128L * 1024 * 1024;
    private static final Set<String> ASSET_HOSTS = Set.of("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com");

    static boolean trustedReleaseUrl(String value, String repository) {
        try {
            URI uri = new URI(value);
            return secure(uri) && "github.com".equals(uri.getHost()) && uri.getRawQuery() == null && uri.getRawFragment() == null
                    && uri.getRawPath().startsWith("/" + repository + "/releases/download/")
                    && uri.getRawPath().matches("/[^/]+/[^/]+/releases/download/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+");
        } catch (Exception ignored) { return false; }
    }

    static boolean trustedRedirect(String value) {
        try { URI uri = new URI(value); return secure(uri) && uri.getRawFragment() == null && ASSET_HOSTS.contains(uri.getHost()); }
        catch (Exception ignored) { return false; }
    }

    private static boolean secure(URI uri) {
        return "https".equals(uri.getScheme()) && uri.getRawUserInfo() == null && uri.getPort() == -1 && uri.getHost() != null;
    }

    static boolean acceptsIdentity(String installedId, long installedCode, String installedSigner, String candidateId,
                                   long candidateCode, String candidateSigner, long expectedCode, String pinnedSigner) {
        return "local.opengym.personal".equals(installedId) && installedId.equals(candidateId)
                && candidateCode > installedCode && candidateCode == expectedCode && pinnedSigner != null
                && pinnedSigner.equals(installedSigner) && pinnedSigner.equals(candidateSigner);
    }
}
