const { VALID_STATE_VALUES, VALID_STATE_VALUES_ALL } = require('../../constants/states');
const z = require('zod');

const dailyReportSchema = z.object({
  id: z.number().int().optional(),
  autor: z.string().min(1).max(50).optional(),
  nota: z.number().int().min(1).max(5).refine(val => val >= 1 && val <= 5, {
    message: "Nota deve ser entre 1 e 5"
  }),
  motivo: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  foto: z.string().nullable().optional(),
  estado: z.enum(VALID_STATE_VALUES_ALL).default('pi').transform(v => v.toLowerCase()).optional(),
  data_report: z.string().or(z.date()).optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const dailyReportCreateSchema = dailyReportSchema;

module.exports = {
  dailyReportSchema,
  dailyReportCreateSchema
};
