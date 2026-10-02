package ch.duartesantos.opengym

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

internal object HealthReadMutex { val mutex = Mutex() }
internal class HealthSyncStorage(context: Context) {
    private val directory = File(context.noBackupFilesDir, "ritm-health")
    val mailbox = HealthMailbox(File(directory, "queue"))
    val config = AtomicHealthFile(File(directory, "sync.json"))
    fun publish(snapshot: Map<String, Any?>) {
        val window = snapshot.getValue("window") as Map<*, *>
        val origins = (snapshot.getValue("origins") as List<*>).joinToString("|")
        val completed = (snapshot.getValue("completedMetrics") as List<*>).map { it.toString() }.sorted().joinToString("|")
        val scope = "${snapshot.getValue("profileId")}/$origins/${window["from"]}/${window["to"]}/$completed"
        mailbox.publish(scope, snapshot.getValue("generation") as String, JSONObject(snapshot).toString())
    }
}
internal fun jsonOrigins(value: JSONArray): Set<String> = (0 until value.length()).map { value.getString(it) }.toSet().also {
    require(it.all { origin -> origin.isNotBlank() && origin.length <= 256 && !origin.contains('|') }) { "Invalid health source" }
}
internal class HealthSyncCoordinator(private val context: Context) {
    companion object { const val WORK_NAME = "ritm-health-import" }
    suspend fun schedule(enabled: Boolean, profileId: String, origins: Set<String>): Map<String, Any?> {
        val status = HealthConnectReader(context).status()
        val permitted = canReadHealthInBackground(status, enabled, profileId, origins)
        val storage = HealthSyncStorage(context)
        val previous = storage.config.read()?.let { JSONObject(it) }
        val changed = previous == null || previous.getBoolean("enabled") != permitted ||
            previous.getString("profileId") != profileId || jsonOrigins(previous.getJSONArray("origins")) != origins
        if (changed) storage.config.write(JSONObject(mapOf("enabled" to permitted, "profileId" to profileId,
            "origins" to origins.sorted(), "generation" to UUID.randomUUID().toString())).toString())
        val manager = WorkManager.getInstance(context)
        if (permitted) {
            val request = PeriodicWorkRequestBuilder<PersonalHealthWorker>(1, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).setRequiresStorageNotLow(true).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES).build()
            manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request).result.get(10, TimeUnit.SECONDS)
        } else manager.cancelUniqueWork(WORK_NAME).result.get(10, TimeUnit.SECONDS)
        return status + mapOf("backgroundScheduled" to permitted)
    }
    fun scheduled(): Boolean? = try {
        WorkManager.getInstance(context).getWorkInfosForUniqueWork(WORK_NAME).get(5, TimeUnit.SECONDS)
            .any { it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.RUNNING }
    } catch (e: Exception) { null }
}

class PersonalHealthWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val cache = applicationContext.getSharedPreferences("ritm_health", Context.MODE_PRIVATE)
        fun outcome(status: String) { cache.edit().putLong("lastWorkerAt", System.currentTimeMillis()).putString("workerStatus", status).apply() }
        try {
            val storage = HealthSyncStorage(applicationContext)
            val expected = storage.config.read() ?: return Result.success()
            val config = JSONObject(expected)
            val profileId = config.getString("profileId")
            val origins = jsonOrigins(config.getJSONArray("origins"))
            val reader = HealthConnectReader(applicationContext)
            if (!canReadHealthInBackground(reader.status(), config.getBoolean("enabled"), profileId, origins)) {
                outcome("permission_or_provider_unavailable")
                WorkManager.getInstance(applicationContext).cancelUniqueWork(HealthSyncCoordinator.WORK_NAME)
                return Result.success()
            }
            return HealthReadMutex.mutex.withLock {
                val snapshot = reader.snapshot(profileId, origins, 7, background = true)
                // Do not publish into a new profile/source selection while the old read was in flight.
                if (storage.config.read() != expected) return@withLock Result.success()
                storage.publish(snapshot)
                val metricStatus = snapshot.getValue("metricStatus") as Map<*, *>
                val retry = metricStatus.values.any { it == "read_error" }
                outcome(if (retry) "partial_read_error" else "success")
                if (retry) Result.retry() else Result.success()
            }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { outcome("read_or_storage_error"); return Result.retry() }
    }
}
