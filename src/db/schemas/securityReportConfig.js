const z = require('zod');

const perigoSchema = z.object({
  valor: z.string().min(1),
  cor: z.string().optional().default('#ef4444'),
  ordem: z.number().int().optional().default(0),
});

const tipoAcidenteSchema = z.object({
  valor: z.string().min(1),
  ordem: z.number().int().optional().default(0),
});

const filtersSchema = z.object({
  cargo: z.array(z.string()).optional().default([]),
  regional: z.array(z.string()).optional().default([]),
  seccional: z.array(z.string()).optional().default([]),
}).optional().default({});

const hazardDataSchema = z.object({
  perigos: z.array(perigoSchema).optional().default([]),
  filters: filtersSchema,
});

const accidentDataSchema = z.object({
  tipos_acidente: z.array(tipoAcidenteSchema).optional().default([]),
  filters: filtersSchema,
});

const configDataSchema = z.object({
  perigos: z.array(perigoSchema).optional().default([]),
  tipos_acidente: z.array(tipoAcidenteSchema).optional().default([]),
  filters: filtersSchema,
});

const createSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  config_type: z.enum(['hazards', 'accidents']).optional().default('hazards'),
  estado: z.string().max(2).nullable().optional(),
  data: configDataSchema.optional().default({}),
  is_active: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  config_type: z.enum(['hazards', 'accidents']).optional(),
  estado: z.string().max(2).nullable().optional(),
  data: configDataSchema.optional(),
  is_active: z.boolean().optional(),
});

module.exports = { createSchema, updateSchema, configDataSchema, perigoSchema, tipoAcidenteSchema, hazardDataSchema, accidentDataSchema };
