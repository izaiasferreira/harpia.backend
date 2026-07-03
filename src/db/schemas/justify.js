const { VALID_STATE_VALUES, VALID_STATE_VALUES_ALL } = require('../../constants/states');
const z = require('zod');

const justificativaSchema = z.object({
  id: z.number().int().optional(),
  instalacao: z.string().min(1).max(50),
  tipo: z.string().max(100).nullable().optional(),
  motivo: z.string().nullable().optional(),
  justificativa: z.string().nullable().optional(),
  foto: z.string().nullable().optional(),
  data_leit_prev: z.string().max(30).nullable().optional(),
  author: z.string().min(1).max(50).transform(v => v.toLowerCase()),
  estado: z.enum(VALID_STATE_VALUES_ALL).transform(v => v.toLowerCase()),
  quantidade: z.number().int().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const justifyPendingSchema = z.object({
  id: z.number().int().optional(),
  autor: z.string().min(1).max(50).transform(v => v.toLowerCase()),
  quantidade: z.number().int(),
  tipo: z.string().max(100).nullable().optional(),
  unidade_leitura: z.string().max(50).nullable().optional(),
  instalacao: z.union([z.string(), z.array(z.string()), z.record(z.any())]).nullable().optional(),
  motivo: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  foto: z.string().nullable().optional(),
  estado: z.enum(VALID_STATE_VALUES_ALL).default('pi').transform(v => v.toLowerCase()),
  status: z.enum(['pendente', 'respondido']).default('pendente'),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const justificativaCreateSchema = justificativaSchema;
const justifyPendingCreateSchema = justifyPendingSchema;

module.exports = {
  justificativaSchema,
  justificativaCreateSchema,
  justifyPendingSchema,
  justifyPendingCreateSchema
};
