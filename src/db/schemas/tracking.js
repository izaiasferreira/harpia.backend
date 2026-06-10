const z = require('zod');

const trackingPointSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  latitude: z.number().or(z.string().transform(Number)),
  longitude: z.number().or(z.string().transform(Number)),
  speed: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  battery_level: z.number().nullable().optional(),
  network_type: z.string().max(20).nullable().optional(),
  device_model: z.string().max(100).nullable().optional(),
  device_platform: z.string().max(20).nullable().optional(),
  os_version: z.string().max(20).nullable().optional(),
  recorded_at: z.date().or(z.string().transform(v => new Date(v))),
  synced_at: z.date().optional()
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
  speedViolationSchema,
  fallIncidentSchema,
  agentAlertLogSchema
};
