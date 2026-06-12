const z = require('zod');

const maxStr = (max) => z.string().transform(v => v.length > max ? v.slice(0, max) : v);

const trackingPointSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  latitude: z.number().or(z.string().transform(Number)),
  longitude: z.number().or(z.string().transform(Number)),
  speed: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  battery_level: z.number().or(z.string().transform(Number)).nullable().optional(),
  is_charging: z.boolean().nullable().optional(),
  network_type: z.string().max(20).nullable().optional(),
  gps_enabled: z.boolean().nullable().optional(),
  device_model: maxStr(200).nullable().optional(),
  device_platform: z.string().max(20).nullable().optional(),
  os_version: z.string().max(20).nullable().optional(),
  recorded_at: z.date().or(z.string().transform(v => new Date(v))),
  synced_at: z.date().optional()
});

const unifiedPointSchema = z.object({
  id: z.string().optional(),
  lat: z.number().or(z.string().transform(Number)),
  lng: z.number().or(z.string().transform(Number)),
  speed: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  batteryLevel: z.number().nullable().optional(),
  isCharging: z.boolean().nullable().optional(),
  networkType: z.string().max(20).nullable().optional(),
  gpsEnabled: z.boolean().nullable().optional(),
  deviceModel: maxStr(200).nullable().optional(),
  devicePlatform: z.string().max(20).nullable().optional(),
  osVersion: z.string().max(20).nullable().optional(),
  timestamp: z.number().or(z.string().transform(Number)),
});

const speedViolationSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  latitude: z.number().or(z.string().transform(Number)),
  longitude: z.number().or(z.string().transform(Number)),
  speed: z.number().or(z.string().transform(Number)),
  speed_limit: z.number().or(z.string().transform(Number)).default(50),
  recorded_at: z.date().or(z.string().transform(v => new Date(v))),
  synced_at: z.date().optional()
});

const trackingAgentConfigSchema = z.object({
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  speed_limit_kmh: z.number().min(1).max(300).default(81),
});

const trackingGlobalConfigSchema = z.object({
  key: z.string().min(1).max(50),
  value: z.string(),
});

const fallIncidentSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  status: z.enum(['pending', 'confirmed', 'false_positive']).default('pending'),
  recorded_at: z.date().or(z.string().transform(v => new Date(v))),
  confirmed_at: z.date().nullable().optional(),
  notes: z.string().nullable().optional(),
  synced_at: z.date().optional()
});

const agentAlertLogSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  alert_type: z.string().max(30),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  details: z.union([z.string(), z.record(z.any())]).nullable().optional(),
  recorded_at: z.date().or(z.string().transform(v => new Date(v))),
  synced_at: z.date().optional()
});

module.exports = {
  trackingPointSchema,
  unifiedPointSchema,
  speedViolationSchema,
  trackingAgentConfigSchema,
  trackingGlobalConfigSchema,
  fallIncidentSchema,
  agentAlertLogSchema
};
