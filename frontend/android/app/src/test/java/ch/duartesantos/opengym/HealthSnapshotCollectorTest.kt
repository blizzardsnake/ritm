package ch.duartesantos.opengym

import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.Assert.*

class HealthSnapshotCollectorTest {
    private val now = Instant.parse("2026-10-02T12:00:00Z")
    @Test fun missingMeasurementIsUnknownButAnObservedZeroSurvives() = runBlocking {
        val collector = HealthSnapshotCollector("owner", setOf("mi"), 2, now, ZoneId.of("Europe/Moscow"), false)
        val result = collector.collect(setOf("steps")) { metric ->
            assertEquals("steps", metric)
            HealthMetricBatch(daily = mapOf(LocalDate.parse("2026-10-02") to HealthDailyMeasurement(0.0, setOf("mi"))))
        }
        val days = result["daily"] as List<Map<String, Any?>>
        assertNull(days[0]["steps"])
        assertEquals(0.0, days[1]["steps"])
        assertEquals(setOf("steps"), (result["completedMetrics"] as List<*>).toSet())
        assertEquals("permission_denied", (result["metricStatus"] as Map<*,*>)["sleep"])
        assertEquals("no_data", (days[0]["metricStatus"] as Map<*,*>)["steps"])
    }
    @Test fun anInterruptedMetricNeverPublishesPartialDataOrBlocksOtherPermissions() = runBlocking {
        val collector = HealthSnapshotCollector("owner", setOf("mi"), 2, now, ZoneId.of("UTC"), false)
        val result = collector.collect(setOf("steps", "distance", "sleep")) { metric ->
            when (metric) {
                "steps" -> throw java.io.IOException("quota")
                "distance" -> throw SecurityException("revoked")
                else -> HealthMetricBatch(records = listOf(mapOf("origin" to "mi", "sourceId" to "sleep-1")))
            }
        }
        assertEquals(listOf("sleep"), result["completedMetrics"])
        assertEquals("read_error", (result["metricStatus"] as Map<*,*>)["steps"])
        assertEquals("permission_denied", (result["metricStatus"] as Map<*,*>)["distance"])
        assertEquals(1, (result["sleep"] as List<*>).size)
    }
    @Test fun aSourceOutsideSelectionCannotLeakIntoThePublishedMeasurement() = runBlocking {
        val collector = HealthSnapshotCollector("owner", setOf("mi"), 2, now, ZoneId.of("UTC"), false)
        val result = collector.collect(setOf("steps", "sleep")) { metric ->
            if (metric == "steps") HealthMetricBatch(daily = mapOf(LocalDate.parse("2026-10-02") to HealthDailyMeasurement(120.0, setOf("phone"))))
            else HealthMetricBatch(records = listOf(mapOf("origin" to "phone", "sourceId" to "private")))
        }
        assertEquals(emptyList<String>(), result["completedMetrics"])
        assertTrue((result["sleep"] as List<*>).isEmpty())
        assertNull((result["daily"] as List<Map<String, Any?>>)[1]["steps"])
    }
    @Test fun longHistoryIsExplicitlyLimitedAndWakeDateUsesTheRecordedOffset() {
        val collector = HealthSnapshotCollector("owner", setOf("mi"), 365, now, ZoneId.of("Europe/Moscow"), false)
        assertEquals(LocalDate.parse("2026-09-03"), collector.from)
        assertEquals(LocalDate.parse("2026-10-02"), collector.to)
        assertTrue(collector.historyLimited)
        assertEquals(LocalDate.parse("2026-10-01"), collector.endDate(Instant.parse("2026-10-02T01:00:00Z"), ZoneOffset.ofHours(-7)))
    }
    @Test fun sleepLookbackDoesNotRequestRestrictedHistoryBeforeTheFirstGrant() {
        val restricted = HealthSnapshotCollector("owner", setOf("mi"), 30, now, ZoneId.of("UTC"), false)
        assertEquals(Instant.parse("2026-09-02T12:00:00Z"), restricted.readFrom)
        val authorised = HealthSnapshotCollector("owner", setOf("mi"), 30, now, ZoneId.of("UTC"), true)
        assertEquals(Instant.parse("2026-09-01T00:00:00Z"), authorised.readFrom)
    }
}
