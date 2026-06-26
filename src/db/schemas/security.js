const z = require('zod');

const securityReportSchema = z.object({
  id: z.number().int().optional(),
  autor: z.string().min(1).max(50).transform(v => v.toLowerCase()).optional(),
  motivo: z.string().min(1),
  observacao: z.string().nullable().optional(),
  latitude: z.string().nullable().optional(),
  longitude: z.string().nullable().optional(),
  estado: z.string().max(2).default('pi').transform(v => v.toLowerCase()),
  seccional: z.string().nullable().optional(),
  regional: z.string().nullable().optional(),
  created_at: z.date().optional()
});

const securityCheckSchema = z.object({
  id: z.number().int().optional(),
  autor: z.string().min(1).max(50).transform(v => v.toLowerCase()).optional(),
  latitude: z.string().nullable().optional(),
  longitude: z.string().nullable().optional(),
  estado: z.string().max(2).default('pi').transform(v => v.toLowerCase()),
  data_check: z.string().or(z.date()).optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const securityReportCreateSchema = securityReportSchema;
const securityCheckCreateSchema = securityCheckSchema;

module.exports = {
  securityReportSchema,
  securityReportCreateSchema,
  securityCheckSchema,
  securityCheckCreateSchema
};
