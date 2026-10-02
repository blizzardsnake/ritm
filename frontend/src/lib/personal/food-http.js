import { Capacitor, CapacitorHttp } from '@capacitor/core'

export async function requestFoodJson(options) {
  if (Capacitor.isNativePlatform()) {
    return CapacitorHttp.request({ ...options, responseType: 'json', connectTimeout: 10000, readTimeout: 15000 })
  }
  const response = await fetch(options.url, { method: options.method, headers: options.headers,
    signal: AbortSignal.timeout(15000) })
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), data: await response.json() }
}
