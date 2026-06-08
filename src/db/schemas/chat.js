const z = require('zod');

const chatRoomSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  name: z.string().max(255).default('Suporte Técnico'),
  type: z.string().max(50).default('suporte'),
  created_at: z.date().optional()
});

const chatMessageSchema = z.object({
  id: z.number().int().optional(),
  room_id: z.number().int(),
  sender_id: z.string().min(1).max(50),
  sender_type: z.enum(['agent', 'admin']),
  sender_name: z.string().max(100),
  message: z.string().nullable().optional(),
  message_type: z.string().max(50).default('text'),
  file_url: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  read: z.boolean().default(false),
  channel: z.string().max(50).default('internal'),
  metadata: z.union([z.string(), z.record(z.any())]).nullable().optional(),
  created_at: z.date().optional()
});

const chatRoomCreateSchema = chatRoomSchema;
const chatMessageCreateSchema = chatMessageSchema;

module.exports = {
  chatRoomSchema,
  chatRoomCreateSchema,
  chatMessageSchema,
  chatMessageCreateSchema
};
