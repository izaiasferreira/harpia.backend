const z = require('zod');

const serviceGroupSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  completion_config: z.union([z.string(), z.record(z.any())]).default('{}'),
  created_by: z.number().int().nullable().optional(),
  allow_all_agents: z.boolean().default(true),
  allowed_agents: z.union([z.string(), z.array(z.string())]).default('[]'),
  allow_agent_creation: z.boolean().default(false),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const markerCategorySchema = z.object({
  id: z.number().int().optional(),
  group_id: z.number().int(),
  name: z.string().min(1).max(100),
  color: z.string().max(7).default('#2563EB'),
  created_at: z.date().optional()
});

const coordinatePointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

const coordinatesPathSchema = z.array(coordinatePointSchema).min(1).max(5).nullable().optional();

const serviceNoteSchema = z.object({
  id: z.number().int().optional(),
  group_id: z.number().int(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  coordinates: z.string().max(100).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
  status: z.enum(['PENDENTE', 'CONCLUIDO']).default('PENDENTE'),
  assigned_to: z.string().max(50).nullable().optional(),
  completed_by: z.string().max(50).nullable().optional(),
  completed_at: z.date().nullable().optional(),
  completion_coordinates: z.string().max(100).nullable().optional(),
  completion_data: z.union([z.string(), z.record(z.any())]).nullable().optional(),
  custom_fields: z.union([z.string(), z.record(z.any())]).nullable().optional(),
  marker_category_id: z.number().int().nullable().optional(),
  coordinates_path: coordinatesPathSchema,
  self_registered: z.boolean().default(false),
  archived: z.boolean().default(false),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const serviceAssignmentSchema = z.object({
  id: z.number().int().optional(),
  service_note_id: z.number().int(),
  agent_id: z.string().max(50),
  assigned_by: z.number().int().nullable().optional(),
  assigned_at: z.date().optional()
});

const serviceGroupCreateSchema = serviceGroupSchema;
const serviceNoteCreateSchema = serviceNoteSchema;

module.exports = {
  serviceGroupSchema,
  serviceGroupCreateSchema,
  markerCategorySchema,
  serviceNoteSchema,
  serviceNoteCreateSchema,
  serviceAssignmentSchema,
  coordinatePointSchema,
  coordinatesPathSchema
};
