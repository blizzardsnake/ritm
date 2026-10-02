package ch.duartesantos.opengym

import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import com.getcapacitor.*
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(name = "PersonalHealth")
class PersonalHealthPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private fun reader() = HealthConnectReader(context)
    private fun perform(call: PluginCall, operation: suspend () -> Map<String, Any?>) = performJson(call) { JSObject(JSONObject(operation()).toString()) }
    private fun performJson(call: PluginCall, operation: suspend () -> JSObject) {
        scope.launch {
            try { call.resolve(operation()) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { call.reject(e.message ?: "Health Connect operation failed") }
        }
    }
    @PluginMethod fun getStatus(call: PluginCall) = perform(call) {
        reader().status(call.getBoolean("discoverOrigins", false) == true) +
            mapOf("backgroundScheduled" to HealthSyncCoordinator(context).scheduled())
    }
    @PluginMethod override fun requestPermissions(call: PluginCall) {
        scope.launch {
            try {
                val reader = reader()
                if (reader.availability() != "available") { call.resolve(JSObject(JSONObject(reader.status()).toString())); return@launch }
                val metrics = call.getArray("metrics") ?: JSArray(HealthSnapshotCollector.METRICS)
                val requested = linkedSetOf<String>()
                for (index in 0 until metrics.length()) requested.add(HealthConnectReader.PERMISSIONS[metrics.getString(index)] ?: error("Invalid health permission"))
                if (call.getBoolean("background", false) == true && reader.supports(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)) requested.add(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND)
                if (call.getBoolean("history", false) == true && reader.supports(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY)) requested.add(HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY)
                if (requested.isEmpty()) { call.resolve(JSObject(JSONObject(reader.status()).toString())); return@launch }
                val contract = PermissionController.createRequestPermissionResultContract()
                val intent = contract.createIntent(context, requested)
                activity.runOnUiThread { startActivityForResult(call, intent, "permissionsResult") }
            } catch (e: Exception) { call.reject(e.message ?: "Could not open health permissions") }
        }
    }
    @ActivityCallback protected fun permissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call != null) perform(call) { reader().status(discover = true) }
    }
    @PluginMethod fun readSnapshot(call: PluginCall) = perform(call) {
        val profile = call.getString("profileId") ?: error("Invalid health profile")
        val origins = jsonOrigins(call.getArray("origins") ?: JSONArray())
        val days = call.getInt("days", 7) ?: 7
        HealthReadMutex.mutex.withLock {
            val snapshot = reader().snapshot(profile, origins, days)
            HealthSyncStorage(context).publish(snapshot)
            mapOf("generation" to snapshot.getValue("generation"), "completedMetrics" to snapshot.getValue("completedMetrics"), "historyLimited" to snapshot.getValue("historyLimited"))
        }
    }
    @PluginMethod fun scheduleSync(call: PluginCall) = perform(call) {
        HealthSyncCoordinator(context).schedule(call.getBoolean("enabled", false) == true,
            call.getString("profileId", "") ?: "", jsonOrigins(call.getArray("origins") ?: JSONArray()))
    }
    @PluginMethod fun readMailbox(call: PluginCall) = performJson(call) {
        HealthReadMutex.mutex.withLock {
        val entry = HealthSyncStorage(context).mailbox.read()
        if (entry == null) JSObject() else {
            val json = JSObject(entry.payload)
            require(json.getString("generation") == entry.generation) { "Damaged health import queue" }
            json
        }
        }
    }
    @PluginMethod fun ackMailbox(call: PluginCall) = perform(call) {
        mapOf("acknowledged" to HealthSyncStorage(context).mailbox.ack(call.getString("generation") ?: error("Invalid health generation"), call.getBoolean("archive", false) == true))
    }
    @PluginMethod fun openSettings(call: PluginCall) {
        try {
            val intent = if (reader().availability() == "provider_update_required") Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"))
                else Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            activity.startActivity(intent)
            call.resolve()
        } catch (e: Exception) { call.reject("Could not open Health Connect settings") }
    }
    override fun handleOnDestroy() { scope.cancel() }
}
