package ch.duartesantos.opengym

import java.time.Instant
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import kotlinx.coroutines.CancellationException

internal data class HealthDailyMeasurement(
    val value: Double?, val origins: Set<String>,
    val sourceRecords: List<Map<String, Any?>> = emptyList(),
    val start: Long? = null, val end: Long? = null,
)
internal data class HealthMetricBatch(
    val daily: Map<LocalDate, HealthDailyMeasurement> = emptyMap(),
    val records: List<Map<String, Any?>> = emptyList(),
)

/** Collect each metric completely before publishing it, so pagination failures cannot delete history. */
internal class HealthSnapshotCollector(
    val profileId: String, val origins: Set<String>, days: Int,
    val now: Instant, val zone: ZoneId, val historyAllowed: Boolean,
) {
    companion object {
        val METRICS = listOf("steps", "distance", "activeKcal", "totalKcal", "sleep", "heartRate", "activities")
        val DAILY_FIELDS = mapOf("steps" to "steps", "distance" to "distanceM", "activeKcal" to "activeKcal", "totalKcal" to "totalKcal")
    }
    val to: LocalDate = now.atZone(zone).toLocalDate()
    val from: LocalDate
    val historyLimited: Boolean
    val readFrom: Instant
    init {
        require(profileId.isNotBlank() && profileId.length <= 256) { "Invalid health profile" }
        require(origins.isNotEmpty() && origins.all { it.isNotBlank() && it.length <= 256 && !it.contains('|') }) { "Choose a health data source" }
        require(days in 1..365) { "Read 1–365 days of health history" }
        val effectiveDays = if (historyAllowed) days else minOf(days, 30)
        from = to.minusDays(effectiveDays.toLong() - 1)
        historyLimited = effectiveDays < days
        val lookback = from.minusDays(2).atStartOfDay(zone).toInstant()
        readFrom = if (historyAllowed) lookback else maxOf(lookback, now.minus(Duration.ofDays(30)))
    }
    fun endDate(end: Instant, offset: ZoneOffset?): LocalDate =
        if (offset != null) end.atOffset(offset).toLocalDate() else end.atZone(zone).toLocalDate()
    fun includesEnd(end: Instant, offset: ZoneOffset?): Boolean {
        val date = endDate(end, offset)
        return date >= from && date <= to && !end.isAfter(now)
    }
    suspend fun collect(permissions: Set<String>, read: suspend (String) -> HealthMetricBatch): Map<String, Any?> {
        val rows = linkedMapOf<LocalDate, MutableMap<String, Any?>>()
        var date = from
        while (date <= to) {
            rows[date] = linkedMapOf("date" to date.toString(), "steps" to null, "distanceM" to null, "activeKcal" to null, "totalKcal" to null)
            date = date.plusDays(1)
        }
        val status = linkedMapOf<String, String>()
        val completed = mutableListOf<String>()
        val records = mutableMapOf<String, List<Map<String, Any?>>>()
        val perDayStatus = rows.keys.associateWith { linkedMapOf<String, String>() }
        val perDaySources = rows.keys.associateWith { linkedMapOf<String, List<Map<String, Any?>>>() }
        val perDayIntervals = rows.keys.associateWith { linkedMapOf<String, Map<String, Any?>>() }
        for (metric in METRICS) {
            records[metric] = emptyList()
            if (metric !in permissions) {
                status[metric] = "permission_denied"
                perDayStatus.values.forEach { it[metric] = "permission_denied" }
                continue
            }
            try {
                val batch = read(metric)
                // Validate the whole batch before changing a row.
                require(batch.records.all { it["origin"] in origins && (it["sourceId"] as? String)?.isNotBlank() == true }) { "Invalid health source" }
                require(batch.daily.values.all { measurement ->
                    measurement.origins.all { it in origins } &&
                    (measurement.value == null || (measurement.value.isFinite() && measurement.value >= 0 && measurement.origins.isNotEmpty())) &&
                    measurement.sourceRecords.all { it["origin"] in origins && (it["sourceId"] as? String)?.isNotBlank() == true }
                }) { "Invalid health aggregate" }
                val field = DAILY_FIELDS[metric]
                if (field != null) for ((day, row) in rows) {
                    val measurement = batch.daily[day]
                    row[field] = measurement?.value
                    perDayStatus.getValue(day)[metric] = if (measurement?.value != null) "available" else "no_data"
                    perDaySources.getValue(day)[metric] = measurement?.sourceRecords ?: emptyList()
                    if (measurement != null) perDayIntervals.getValue(day)[metric] = mapOf("start" to measurement.start, "end" to measurement.end, "origins" to measurement.origins.sorted())
                }
                records[metric] = batch.records
                status[metric] = if (batch.records.isNotEmpty() || batch.daily.values.any { it.value != null }) "available" else "no_data"
                completed.add(metric)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val failure = if (e is SecurityException) "permission_denied" else "read_error"
                status[metric] = failure
                perDayStatus.values.forEach { it[metric] = failure }
            }
        }
        return linkedMapOf(
            "schemaVersion" to 1, "generation" to String.format(java.util.Locale.ROOT, "%013d-%s", now.toEpochMilli(), UUID.randomUUID()),
            "profileId" to profileId, "generatedAt" to now.toEpochMilli(), "timezone" to zone.id,
            "window" to mapOf("from" to from.toString(), "to" to to.toString()), "origins" to origins.sorted(),
            "permissions" to METRICS.associateWith { it in permissions }, "completedMetrics" to completed,
            "metricStatus" to status, "historyLimited" to historyLimited,
            "daily" to rows.map { (day, row) -> row + mapOf("metricStatus" to perDayStatus.getValue(day), "sourceRecords" to perDaySources.getValue(day), "intervals" to perDayIntervals.getValue(day)) },
            "sleep" to records.getValue("sleep"), "heartRate" to records.getValue("heartRate"), "activities" to records.getValue("activities"),
        )
    }
}
