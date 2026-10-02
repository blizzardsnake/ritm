package ch.duartesantos.opengym

internal fun canReadHealthInBackground(status: Map<String, Any?>, enabled: Boolean, profileId: String, origins: Set<String>): Boolean =
    enabled && profileId.isNotBlank() && origins.isNotEmpty() && status["availability"] == "available" &&
        status["backgroundSupported"] == true && status["backgroundGranted"] == true &&
        (status["permissions"] as? Map<*, *>)?.values?.any { it == true } == true
