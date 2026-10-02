package ch.duartesantos.opengym

import android.content.Context
import android.content.pm.PackageManager
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.reflect.KClass
import kotlinx.coroutines.CancellationException

internal class HealthConnectReader(private val context: Context) {
    companion object {
        val TYPES: Map<String, KClass<out Record>> = linkedMapOf(
            "steps" to StepsRecord::class, "distance" to DistanceRecord::class,
            "activeKcal" to ActiveCaloriesBurnedRecord::class, "totalKcal" to TotalCaloriesBurnedRecord::class,
            "sleep" to SleepSessionRecord::class, "heartRate" to HeartRateRecord::class, "activities" to ExerciseSessionRecord::class,
        )
        val PERMISSIONS = TYPES.mapValues { HealthPermission.getReadPermission(it.value) }
    }
    private val cache = context.getSharedPreferences("ritm_health", Context.MODE_PRIVATE)
    private fun client() = HealthConnectClient.getOrCreate(context)
    fun availability(): String = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider_update_required"
        else -> "unavailable"
    }
    fun supports(feature: Int): Boolean = availability() == "available" &&
        client().features.getFeatureStatus(feature) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
    suspend fun granted(): Set<String> = if (availability() == "available") client().permissionController.getGrantedPermissions() else emptySet()
    private fun label(packageName: String): String = try {
        @Suppress("DEPRECATION") val info = context.packageManager.getApplicationInfo(packageName, 0)
        context.packageManager.getApplicationLabel(info).toString()
    } catch (e: PackageManager.NameNotFoundException) { packageName }

    suspend fun status(discover: Boolean = false): Map<String, Any?> {
        val availability = availability()
        if (availability != "available") return mapOf("availability" to availability, "permissions" to PERMISSIONS.keys.associateWith { false }, "sources" to emptyList<Any>())
        val permissions = granted()
        val errors = linkedMapOf<String, String>()
        if (discover && PERMISSIONS.values.any { it in permissions }) {
            val found = linkedSetOf<String>()
            val now = Instant.now()
            val zone = ZoneId.systemDefault()
            for ((metric, type) in TYPES) if (PERMISSIONS.getValue(metric) in permissions) {
                try {
                    val records = allRecords(type, emptySet(), now.atZone(zone).toLocalDate().minusDays(8).atStartOfDay(zone).toInstant(), now)
                    records.mapTo(found) { it.metadata.dataOrigin.packageName }
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) { errors[metric] = if (e is SecurityException) "permission_denied" else "read_error" }
            }
            found.remove("")
            // Retain known origins when a discovery query failed; label the partial search.
            if (errors.isNotEmpty()) found.addAll(cache.getStringSet("sources", emptySet()) ?: emptySet())
            if (!cache.edit().putStringSet("sources", found).putLong("discoveredAt", now.toEpochMilli()).commit()) throw java.io.IOException("Could not save health sources")
        }
        return mapOf(
            "availability" to availability, "permissions" to PERMISSIONS.mapValues { it.value in permissions },
            "sources" to (cache.getStringSet("sources", emptySet()) ?: emptySet()).sorted().map { mapOf("packageName" to it, "label" to label(it)) },
            "discoveredAt" to cache.getLong("discoveredAt", 0), "discoveryErrors" to errors,
            "backgroundSupported" to supports(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND),
            "backgroundGranted" to (HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in permissions),
            "historySupported" to supports(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY),
            "historyGranted" to (HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in permissions),
            "lastWorkerAt" to cache.getLong("lastWorkerAt", 0), "workerStatus" to cache.getString("workerStatus", "never"),
        )
    }
    suspend fun snapshot(profileId: String, origins: Set<String>, days: Int, background: Boolean = false): Map<String, Any?> {
        require(availability() == "available") { "Health Connect is unavailable" }
        val permissions = granted()
        if (background) require(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in permissions) { "Background health permission is not granted" }
        val now = Instant.now()
        val zone = ZoneId.systemDefault()
        val collector = HealthSnapshotCollector(profileId, origins, days, now, zone,
            supports(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY) && HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in permissions)
        val allowed = PERMISSIONS.filterValues { it in permissions }.keys
        val result = collector.collect(allowed) { metric -> readMetric(metric, collector) }
        return result + ("background" to background)
    }
    private suspend fun <T : Record> allRecords(type: KClass<T>, origins: Set<String>, from: Instant, to: Instant): List<T> {
        val records = mutableListOf<T>()
        var token: String? = null
        val seen = hashSetOf<String>()
        do {
            val response = client().readRecords(ReadRecordsRequest(
                recordType = type, timeRangeFilter = TimeRangeFilter.between(from, to),
                dataOriginFilter = origins.map { DataOrigin(it) }.toSet(), pageSize = 1000, pageToken = token,
            ))
            records.addAll(response.records)
            token = response.pageToken?.takeIf { it.isNotEmpty() }
            if (token != null && !seen.add(token)) throw java.io.IOException("Repeated Health Connect page token")
        } while (token != null)
        return records
    }
    private data class Times(val start: Instant, val end: Instant, val startOffset: ZoneOffset?, val endOffset: ZoneOffset?)
    private fun times(record: Record): Times = when (record) {
        is StepsRecord -> Times(record.startTime, record.endTime, record.startZoneOffset, record.endZoneOffset)
        is DistanceRecord -> Times(record.startTime, record.endTime, record.startZoneOffset, record.endZoneOffset)
        is ActiveCaloriesBurnedRecord -> Times(record.startTime, record.endTime, record.startZoneOffset, record.endZoneOffset)
        is TotalCaloriesBurnedRecord -> Times(record.startTime, record.endTime, record.startZoneOffset, record.endZoneOffset)
        is SleepSessionRecord -> Times(record.startTime, record.endTime, record.startZoneOffset, record.endZoneOffset)
        is HeartRateRecord -> Times(record.startTime, record.endTime, record.startZoneOffset, record.endZoneOffset)
        is ExerciseSessionRecord -> Times(record.startTime, record.endTime, record.startZoneOffset, record.endZoneOffset)
        else -> error("Unsupported health type")
    }
    private fun source(record: Record): Map<String, Any?> {
        val metadata = record.metadata
        val time = times(record)
        val device = metadata.device
        require(metadata.id.isNotBlank() && metadata.dataOrigin.packageName.isNotBlank()) { "Invalid health source record" }
        val result = linkedMapOf<String, Any?>(
            "sourceId" to metadata.id, "origin" to metadata.dataOrigin.packageName,
            "start" to time.start.toEpochMilli(), "end" to time.end.toEpochMilli(),
            "startOffsetMinutes" to time.startOffset?.totalSeconds?.div(60), "endOffsetMinutes" to time.endOffset?.totalSeconds?.div(60),
            "modifiedAt" to metadata.lastModifiedTime.toEpochMilli(), "recordingMethod" to metadata.recordingMethod,
            "device" to device?.let { mapOf("type" to it.type, "manufacturer" to it.manufacturer, "model" to it.model) },
        )
        when (record) {
            is StepsRecord -> { result["value"] = record.count; result["unit"] = "count" }
            is DistanceRecord -> { result["value"] = record.distance.inMeters; result["unit"] = "m" }
            is ActiveCaloriesBurnedRecord -> { result["value"] = record.energy.inKilocalories; result["unit"] = "kcal" }
            is TotalCaloriesBurnedRecord -> { result["value"] = record.energy.inKilocalories; result["unit"] = "kcal" }
        }
        return result
    }
    private suspend fun readMetric(metric: String, window: HealthSnapshotCollector): HealthMetricBatch {
        // Include the preceding night and timezone travel at the boundaries; filter on original wake offsets below.
        val raw = allRecords(TYPES.getValue(metric), window.origins, window.readFrom, window.now)
        if (metric in HealthSnapshotCollector.DAILY_FIELDS) {
            val sources = linkedMapOf<LocalDate, MutableList<Map<String, Any?>>>()
            for (record in raw) {
                val time = times(record)
                val metadata = source(record)
                var date = maxOf(window.from, window.endDate(time.start, time.startOffset))
                val last = minOf(window.to, window.endDate(time.end, time.endOffset))
                while (date <= last) { sources.getOrPut(date) { mutableListOf() }.add(metadata); date = date.plusDays(1) }
            }
            return when (metric) {
                "steps" -> daily(StepsRecord.COUNT_TOTAL, window, sources) { it.toDouble() }
                "distance" -> daily(DistanceRecord.DISTANCE_TOTAL, window, sources) { it.inMeters }
                "activeKcal" -> daily(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, window, sources) { it.inKilocalories }
                else -> daily(TotalCaloriesBurnedRecord.ENERGY_TOTAL, window, sources) { it.inKilocalories }
            }
        }
        val records = raw.filter { val time = times(it); window.includesEnd(time.end, time.endOffset) }.map { record ->
            val base = source(record)
            when (record) {
                is SleepSessionRecord -> base + mapOf("title" to record.title, "stages" to record.stages.map { mapOf("start" to it.startTime.toEpochMilli(), "end" to it.endTime.toEpochMilli(), "stage" to it.stage) })
                is HeartRateRecord -> base + mapOf("samples" to record.samples.map { mapOf("at" to it.time.toEpochMilli(), "bpm" to it.beatsPerMinute) })
                is ExerciseSessionRecord -> base + mapOf("title" to record.title, "exerciseType" to record.exerciseType)
                else -> error("Unsupported health interval")
            }
        }
        return HealthMetricBatch(records = records)
    }
    private suspend fun <T : Any> daily(metric: AggregateMetric<T>, window: HealthSnapshotCollector,
        sources: Map<LocalDate, List<Map<String, Any?>>>, value: (T) -> Double): HealthMetricBatch {
        val response = client().aggregateGroupByPeriod(AggregateGroupByPeriodRequest(
            metrics = setOf(metric), timeRangeFilter = TimeRangeFilter.between(window.from.atStartOfDay(), LocalDateTime.ofInstant(window.now, window.zone)),
            timeRangeSlicer = Period.ofDays(1), dataOriginFilter = window.origins.map { DataOrigin(it) }.toSet(),
        ))
        val daily = response.associate { row ->
            val date = row.startTime.toLocalDate()
            val actualOrigins = row.result.dataOrigins.map { it.packageName }.toSet()
            date to HealthDailyMeasurement(if (actualOrigins.isEmpty()) null else row.result[metric]?.let(value), actualOrigins,
                sources[date] ?: emptyList(), row.startTime.atZone(window.zone).toInstant().toEpochMilli(), row.endTime.atZone(window.zone).toInstant().toEpochMilli())
        }.toMutableMap()
        // Empty aggregate buckets may be omitted. Preserve IDs/device metadata without fabricating a value.
        for ((date, records) in sources) if (date !in daily) daily[date] = HealthDailyMeasurement(null, records.mapNotNull { it["origin"] as? String }.toSet(), records)
        return HealthMetricBatch(daily = daily)
    }
}
