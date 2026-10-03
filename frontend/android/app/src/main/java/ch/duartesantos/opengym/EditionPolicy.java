package ch.duartesantos.opengym;

/** Official APKs cannot be updates to an independently signed personal fork. */
final class EditionPolicy {
    static boolean allowsUpstreamUpdates(String applicationId) {
        return "ch.duartesantos.opengym".equals(applicationId);
    }
}
