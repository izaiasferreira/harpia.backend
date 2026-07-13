const z = require('zod');
const EQUIPMENT_STATUS = ['disponivel', 'em_uso', 'manutencao', 'inativo'];
const EQUIPMENT_CONDICAO = ['otimo', 'bom', 'regular', 'ruim', 'danificado'];

const ASSIGNMENT_STATUS = ['ativa', 'encerrada'];
const REQUEST_STATUS    = ['pendente', 'aprovado', 'rejeitado'];

const equipmentSchema = z.object({
  id:       z.number().int().optional(),
  tipo:     z.string(),
  estado:   z.string().min(2).max(2).transform(v => v.toLowerCase()),
  regional: z.string().max(255).nullable().optional(),
  seccional: z.string().max(255).nullable().optional(),
  dados:    z.record(z.any()).default({}),  // JSONB — validado por equipmentTypes.js
  status:   z.enum(EQUIPMENT_STATUS).default('disponivel'),
  condicao: z.enum(EQUIPMENT_CONDICAO).default('bom'),
  fotos:    z.array(z.string()).default([]),
  criado_por: z.string().max(100).nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

const equipmentCreateSchema = equipmentSchema;
const equipmentUpdateSchema = equipmentSchema.partial().omit({ tipo: true });

const assignmentSchema = z.object({
  id:           z.number().int().optional(),
  equipment_id: z.number().int(),
  agente:       z.string().min(1).max(50).transform(v => v.toLowerCase()),

  assignado_por:      z.string().max(100).nullable().optional(),
  assignado_por_nome: z.string().max(200).nullable().optional(),
  data_associacao:    z.date().optional(),

  data_desassociacao:     z.date().nullable().optional(),
  desassociado_por:       z.string().max(100).nullable().optional(),
  desassociado_por_nome:  z.string().max(200).nullable().optional(),

  status:    z.enum(ASSIGNMENT_STATUS).default('ativa'),
  observacao: z.string().max(500).nullable().optional(),
  created_at: z.date().optional(),
});

const equipmentRequestSchema = z.object({
  id:           z.number().int().optional(),
  equipment_id: z.number().int(),
  agente:       z.string().min(1).max(50).transform(v => v.toLowerCase()),
  foto_url:     z.string().min(1),
  latitude:     z.number().nullable().optional(),
  longitude:    z.number().nullable().optional(),
  status:       z.enum(REQUEST_STATUS).default('pendente'),
  observacao_agente: z.string().max(500).nullable().optional(),
  created_at:   z.date().optional(),
});

module.exports = {
  equipmentSchema,
  equipmentCreateSchema,
  equipmentUpdateSchema,
  assignmentSchema,
  equipmentRequestSchema,
  ASSIGNMENT_STATUS,
  REQUEST_STATUS,
};
