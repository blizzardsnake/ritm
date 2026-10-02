package ch.duartesantos.opengym

import org.junit.Test
import org.junit.Assert.*

class HealthSyncPolicyTest {
    private val status = mapOf<String, Any?>("availability" to "available", "backgroundSupported" to true, "backgroundGranted" to true, "permissions" to mapOf("steps" to true))
    @Test fun backgroundReadRequiresOptInSupportedFeatureAndActualPermissions() {
        assertTrue(canReadHealthInBackground(status, true, "owner", setOf("mi")))
        assertFalse(canReadHealthInBackground(status, false, "owner", setOf("mi")))
        assertFalse(canReadHealthInBackground(status + ("backgroundSupported" to false), true, "owner", setOf("mi")))
        assertFalse(canReadHealthInBackground(status + ("backgroundGranted" to false), true, "owner", setOf("mi")))
        assertFalse(canReadHealthInBackground(status + ("availability" to "unavailable"), true, "owner", setOf("mi")))
        assertFalse(canReadHealthInBackground(status + ("permissions" to mapOf("steps" to false)), true, "owner", setOf("mi")))
        assertFalse(canReadHealthInBackground(status, true, "", setOf("mi")))
        assertFalse(canReadHealthInBackground(status, true, "owner", emptySet()))
    }
}
