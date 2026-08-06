const { z } = require('zod');

const serviceAnnotationCreateSchema = z.object({
  tipo: z.enum(['Remanejamento', 'Anotação', 'Coordenada'], {
    required_error: 'Tipo é obrigatório',
    invalid_type_error: 'Tipo inválido. Deve ser Remanejamento, Anotação ou Coordenada',
  }),
  identificacao_tipo: z.enum(['Medidor', 'Instalação', 'Unidade Consumidora']).optional().nullable(),
  identificacao_valor: z.string().optional().nullable(),
  descricao: z.string().min(1, 'Descrição é obrigatória'),
  foto: z.string().optional().nullable(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  seccional: z.string().optional().nullable(),
  regional: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

const serviceAnnotationResolveSchema = z.object({
  descricao_solucao: z.string().min(1, 'Descrição da solução é obrigatória'),
  evidencias: z.array(z.object({
    nome_arquivo: z.string(),
    tipo: z.string(),
    caminho: z.string(),
  })).optional().default([]),
});

module.exports = {
  serviceAnnotationCreateSchema,
  serviceAnnotationResolveSchema,
};
