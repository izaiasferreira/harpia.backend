const AVAILABLE_MODULES = [
    // Busca Instalação
    { id: 'search_in', name: 'Busca Instalação', group: 'Busca Instalação' },
    { id: 'update_search_in', name: 'Atualizar Busca Instalação', group: 'Busca Instalação' },
    // Justificativa de Instalação
    { id: 'justify', name: 'Consultar Justificativa de Instalação', group: 'Justificativa de Instalação' },
    { id: 'create_justify', name: 'Criar Justificativa', group: 'Justificativa de Instalação' },
    { id: 'update_justify', name: 'Atualizar Justificativa', group: 'Justificativa de Instalação' },
    { id: 'delete_justify', name: 'Deletar Justificativa', group: 'Justificativa de Instalação' },
    // Justificativa de Pendência
    { id: 'justify_pending', name: 'Consultar Justificativas de Pendências', group: 'Justificativa de Pendência' },
    { id: 'update_justify_pending', name: 'Atualizar Justificativa de Pendência', group: 'Justificativa de Pendência' },
    { id: 'delete_justify_pending', name: 'Deletar Justificativa de Pendência', group: 'Justificativa de Pendência' },
    // Diário de Bordo
    { id: 'daily_report', name: 'Consultar Diário de Bordo', group: 'Diário de Bordo' },
    { id: 'update_daily_report', name: 'Atualizar Diário de Bordo', group: 'Diário de Bordo' },
    { id: 'delete_daily_report', name: 'Deletar Diário de Bordo', group: 'Diário de Bordo' },
    // Inventário
    { id: 'inventory', name: 'Inventário (Legado)', group: 'Inventário' },
    { id: 'update_inventory', name: 'Atualizar Inventário (Legado)', group: 'Inventário' },
    { id: 'delete_inventory', name: 'Deletar Inventário (Legado)', group: 'Inventário' },
    // Equipamentos
    { id: 'equipments', name: 'Consultar Equipamentos', group: 'Inventário' },
    { id: 'approve_equipment_request', name: 'Aprovar Solicitações de Equipamento', group: 'Inventário' },
    { id: 'create_equipment', name: 'Cadastrar Equipamento', group: 'Inventário' },
    { id: 'update_equipment', name: 'Editar Equipamento', group: 'Inventário' },
    { id: 'delete_equipment', name: 'Excluir Equipamento', group: 'Inventário' },
    { id: 'assign_equipment', name: 'Associar Equipamento a Agente (Legado)', group: 'Inventário' },
    { id: 'request_equipment_assignment', name: 'Solicitar Associação de Equipamento', group: 'Inventário' },
    { id: 'unassign_equipment', name: 'Desassociar Equipamento', group: 'Inventário' },
    { id: 'approve_equipment_request', name: 'Aprovar Solicitação de Equipamento (Agente)', group: 'Inventário' },
    { id: 'view_equipment_history', name: 'Visualizar Histórico de Equipamento', group: 'Inventário' },
    { id: 'manage_equipment_types', name: 'Gerenciar Tipos de Equipamento', group: 'Inventário' },
    // Usuários
    { id: 'users', name: 'Usuários', group: 'Usuários' },
    { id: 'create_user', name: 'Criar Usuário', group: 'Usuários' },
    { id: 'update_user', name: 'Atualizar Usuário', group: 'Usuários' },
    { id: 'delete_user', name: 'Deletar Usuário', group: 'Usuários' },
    // Colaboradores
    { id: 'users_agents', name: 'Consultar Agentes', group: 'Colaboradores (Agentes)' },
    { id: 'create_user_agent', name: 'Criar Agente', group: 'Colaboradores (Agentes)' },
    { id: 'update_user_agent', name: 'Atualizar Agente', group: 'Colaboradores (Agentes)' },
    { id: 'delete_user_agent', name: 'Deletar Agente', group: 'Colaboradores (Agentes)' },
    { id: 'bulk_update_user_agent', name: 'Edição em Massa de Agentes', group: 'Colaboradores (Agentes)' },
    { id: 'manage_agents', name: 'Gerenciar Status/Situação de Agentes', group: 'Colaboradores (Agentes)' },
    // Permissões e Acessos
    { id: 'permissions', name: 'Permissions', group: 'Permissões e Acessos' },
    { id: 'create_permission', name: 'Criar Permissão', group: 'Permissões e Acessos' },
    { id: 'update_permission', name: 'Atualizar Permissão', group: 'Permissões e Acessos' },
    { id: 'delete_permission', name: 'Deletar Permissão', group: 'Permissões e Acessos' },
    { id: 'admin', name: 'Admin (Tokens de API)', group: 'Permissões e Acessos' },
    // Comunicação
    { id: 'send_message_user_agent', name: 'Enviar Mensagem para Agente', group: 'Comunicação' },
    { id: 'message_templates', name: 'Consultar Modelos de Mensagem', group: 'Comunicação' },
    { id: 'create_message_template', name: 'Criar Modelo de Mensagem', group: 'Comunicação' },
    { id: 'update_message_template', name: 'Atualizar Modelo de Mensagem', group: 'Comunicação' },
    { id: 'delete_message_template', name: 'Deletar Modelo de Mensagem', group: 'Comunicação' },
    { id: 'chat', name: 'Chat Suporte Técnico', group: 'Comunicação' },
    // Segurança e Monitoramento
    { id: 'security_reports', name: 'Consultar Relatórios de Segurança', group: 'Segurança e Monitoramento' },
    { id: 'delete_security_report', name: 'Deletar Relatório de Segurança', group: 'Segurança e Monitoramento' },
    { id: 'resolve_security_report', name: 'Resolver / Validar Relatório de Segurança', group: 'Segurança e Monitoramento' },
    { id: 'tracking', name: 'Monitoramento de Agentes', group: 'Segurança e Monitoramento' },
    { id: 'tracking_live', name: 'Monitoramento: Ao Vivo', group: 'Segurança e Monitoramento' },
    { id: 'tracking_history', name: 'Monitoramento: Histórico', group: 'Segurança e Monitoramento' },
    { id: 'tracking_speed', name: 'Monitoramento: Velocidade', group: 'Segurança e Monitoramento' },
    { id: 'tracking_falls', name: 'Monitoramento: Quedas', group: 'Segurança e Monitoramento' },
    { id: 'tracking_settings', name: 'Configurações de Tracking', group: 'Segurança e Monitoramento' },
    { id: 'delete_accident', name: 'Excluir Acidente', group: 'Segurança e Monitoramento' },
    { id: 'crash_detection', name: 'Consultar Incidentes de Queda', group: 'Segurança e Monitoramento' },
    { id: 'update_crash_incident', name: 'Atualizar Incidente de Queda', group: 'Segurança e Monitoramento' },
    { id: 'resolve_crash_incident', name: 'Resolver / Validar Incidente de Queda', group: 'Segurança e Monitoramento' },
    { id: 'manage_security_reports_config', name: 'Gerenciar Configurações de Reporte de Segurança', group: 'Segurança e Monitoramento' },
    { id: 'geofences', name: 'Cercas Virtuais (Visualização)', group: 'Segurança e Monitoramento' },
    { id: 'create_geofence', name: 'Criar Cerca Virtual', group: 'Segurança e Monitoramento' },
    { id: 'update_geofence', name: 'Atualizar Cerca Virtual', group: 'Segurança e Monitoramento' },
    { id: 'delete_geofence', name: 'Deletar Cerca Virtual', group: 'Segurança e Monitoramento' },
    // Educação e Treinamentos
    { id: 'trainings', name: 'Projetos de Treinamento', group: 'Educação e Treinamentos' },
    { id: 'create_training', name: 'Criar Projeto de Treinamento', group: 'Educação e Treinamentos' },
    { id: 'update_training', name: 'Atualizar Projeto de Treinamento', group: 'Educação e Treinamentos' },
    { id: 'delete_training', name: 'Deletar Projeto de Treinamento', group: 'Educação e Treinamentos' },
    { id: 'badges', name: 'Consultar Badges', group: 'Educação e Treinamentos' },
    { id: 'create_badge', name: 'Criar Badge', group: 'Educação e Treinamentos' },
    { id: 'update_badge', name: 'Atualizar Badge', group: 'Educação e Treinamentos' },
    { id: 'delete_badge', name: 'Deletar Badge', group: 'Educação e Treinamentos' },
    { id: 'ceneduc', name: 'Consultar Cards CenEduc', group: 'Educação e Treinamentos' },
    { id: 'create_ceneduc', name: 'Criar Card CenEduc', group: 'Educação e Treinamentos' },
    { id: 'update_ceneduc', name: 'Atualizar Card CenEduc', group: 'Educação e Treinamentos' },
    { id: 'delete_ceneduc', name: 'Deletar Card CenEduc', group: 'Educação e Treinamentos' },
    // Formulários
    { id: 'forms', name: 'Consultar Formulários', group: 'Formulários' },
    { id: 'create_form', name: 'Criar Formulário', group: 'Formulários' },
    { id: 'update_form', name: 'Atualizar Formulário', group: 'Formulários' },
    { id: 'delete_form', name: 'Deletar Formulário', group: 'Formulários' },
    { id: 'delete_form_response', name: 'Deletar Resposta de Formulário', group: 'Formulários' },
    // Checklists
    { id: 'checklists', name: 'Consultar Checklists de Segurança', group: 'Segurança e Monitoramento' },
    { id: 'manage_checklist_templates', name: 'Gerenciar Templates de Checklist', group: 'Segurança e Monitoramento' },
    { id: 'delete_checklist_template', name: 'Deletar Template de Checklist', group: 'Segurança e Monitoramento' },
    { id: 'delete_checklist', name: 'Excluir Checklist', group: 'Segurança e Monitoramento' },
    { id: 'create_agent_exemption', name: 'Criar Isenção de Checklist (Agentes)', group: 'Segurança e Monitoramento' },
    { id: 'delete_agent_exemption', name: 'Excluir Isenção de Checklist (Agentes)', group: 'Segurança e Monitoramento' },
    { id: 'view_agent_exemptions', name: 'Visualizar Isenções de Checklist (Agentes)', group: 'Segurança e Monitoramento' },
    { id: 'resolve_nonconformity', name: 'Resolver Não Conformidades', group: 'Segurança e Monitoramento' },
    { id: 'unresolve_nonconformity', name: 'Desfazer Resolução de Não Conformidade', group: 'Segurança e Monitoramento' },
    // Serviços
    { id: 'service_notes', name: 'Consultar Notas de Serviço', group: 'Serviços' },
    { id: 'create_service_note', name: 'Criar Nota de Serviço', group: 'Serviços' },
    { id: 'update_service_note', name: 'Atualizar Nota de Serviço', group: 'Serviços' },
    { id: 'delete_service_note', name: 'Deletar Nota de Serviço', group: 'Serviços' },
    { id: 'assign_service_notes', name: 'Atribuir Notas de Serviço', group: 'Serviços' },
    { id: 'import_service_notes', name: 'Importar Notas de Serviço', group: 'Serviços' },
    { id: 'services_consult', name: 'Consulta Global de Serviços', group: 'Serviços' },
    // Auditoria e App
    { id: 'revalidate', name: 'Revalidar Fotos (Auditoria)', group: 'Auditoria e App' },
    { id: 'revalidate_write', name: 'Salvar Resultado de Revalidação', group: 'Auditoria e App' },
    { id: 'app_pins', name: 'PINs App Nativo', group: 'Auditoria e App' },
    { id: 'configs', name: 'Configurações', group: 'Auditoria e App' }
];

async function listModules() {
    return AVAILABLE_MODULES;
}

module.exports = {
    listModules
};