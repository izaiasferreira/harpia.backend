const AVAILABLE_MODULES = [
    // Busca Instalação
    { id: 'search_in', name: 'Busca Instalação' },
    { id: 'update_search_in', name: 'Atualizar Busca Instalação' },
    // Justificativa de Instalação
    { id: 'justify', name: 'Consultar Justificativa de Instalação' },
    { id: 'create_justify', name: 'Criar Justificativa' },
    { id: 'update_justify', name: 'Atualizar Justificativa' },
    { id: 'delete_justify', name: 'Deletar Justificativa' },
    // Justificativa de Pendência
    { id: 'justify_pending', name: 'Consultar Justificativas de Pendências' },
    { id: 'create_justify_pending', name: 'Criar Justificativa de Pendência' },
    { id: 'update_justify_pending', name: 'Atualizar Justificativa de Pendência' },
    { id: 'delete_justify_pending', name: 'Deletar Justificativa de Pendência' },
    // Diário de Bordo
    { id: 'daily_report', name: 'Consultar Diário de Bordo' },
    { id: 'create_daily_report', name: 'Criar Diário de Bordo' },
    { id: 'update_daily_report', name: 'Atualizar Diário de Bordo' },
    { id: 'delete_daily_report', name: 'Deletar Diário de Bordo' },
    // Inventário
    { id: 'inventory', name: 'Inventário' },
    { id: 'create_inventory', name: 'Criar Inventário' },
    { id: 'update_inventory', name: 'Atualizar Inventário' },
    { id: 'delete_inventory', name: 'Deletar Inventário' },
    // Usuários
    { id: 'users', name: 'Usuários' },
    { id: 'create_user', name: 'Criar Usuário' },
    { id: 'update_user', name: 'Atualizar Usuário' },
    { id: 'delete_user', name: 'Deletar Usuário' },
    // Filiais
    { id: 'branches', name: 'Filiais' },
    { id: 'create_branch', name: 'Criar Filial' },
    { id: 'update_branch', name: 'Atualizar Filial' },
    { id: 'delete_branch', name: 'Deletar Filial' },
    // Permissões
    { id: 'permissions', name: 'Permissions' },
    { id: 'create_permission', name: 'Criar Permissão' },
    { id: 'update_permission', name: 'Atualizar Permissão' },
    { id: 'delete_permission', name: 'Deletar Permissão' },
    // Agentes
    { id: 'users_agents', name: 'Consultar Agentes' },
    { id: 'create_user_agent', name: 'Criar Agente' },
    { id: 'update_user_agent', name: 'Atualizar Agente' },
    { id: 'delete_user_agent', name: 'Deletar Agente' },
    { id: 'send_message_user_agent', name: 'Enviar Mensagem para Agente' },
    // Interativos
    { id: 'training_projects', name: 'Projetos de Treinamento' },
    { id: 'create_training_project', name: 'Criar Projeto de Treinamento' },
    { id: 'update_training_project', name: 'Atualizar Projeto de Treinamento' },
    { id: 'delete_training_project', name: 'Deletar Projeto de Treinamento' },
    // Modelos de Mensagem
    { id: 'message_templates', name: 'Consultar Modelos de Mensagem' },
    { id: 'create_message_template', name: 'Criar Modelo de Mensagem' },
    { id: 'update_message_template', name: 'Atualizar Modelo de Mensagem' },
    { id: 'delete_message_template', name: 'Deletar Modelo de Mensagem' },
    // Relatórios de Segurança
    { id: 'security_reports', name: 'Consultar Relatórios de Segurança' },
    { id: 'create_security_report', name: 'Criar Relatório de Segurança' },
    { id: 'delete_security_report', name: 'Deletar Relatório de Segurança' },
    // Formulários Dinâmicos
    { id: 'forms', name: 'Consultar Formulários' },
    { id: 'create_form', name: 'Criar Formulário' },
    { id: 'update_form', name: 'Atualizar Formulário' },
    { id: 'delete_form', name: 'Deletar Formulário' },
    { id: 'delete_form_response', name: 'Deletar Resposta de Formulário' },
    // Badges
    { id: 'badges', name: 'Consultar Badges' },
    { id: 'create_badge', name: 'Criar Badge' },
    { id: 'update_badge', name: 'Atualizar Badge' },
    { id: 'delete_badge', name: 'Deletar Badge' },
    // Ceneduc Cards
    { id: 'ceneduc', name: 'Consultar Cards CenEduc' },
    { id: 'create_ceneduc', name: 'Criar Card CenEduc' },
    { id: 'update_ceneduc', name: 'Atualizar Card CenEduc' },
    { id: 'delete_ceneduc', name: 'Deletar Card CenEduc' },
    // Monitoramento (Tracking)
    { id: 'tracking', name: 'Monitoramento de Agentes' },
    // Notas de Serviço
    { id: 'service_notes', name: 'Consultar Notas de Serviço' },
    { id: 'create_service_note', name: 'Criar Nota de Serviço' },
    { id: 'update_service_note', name: 'Atualizar Nota de Serviço' },
    { id: 'delete_service_note', name: 'Deletar Nota de Serviço' },
    { id: 'assign_service_notes', name: 'Atribuir Notas de Serviço' },
    { id: 'import_service_notes', name: 'Importar Notas de Serviço' },
    // Consulta de Serviços
    { id: 'services_consult', name: 'Consulta Global de Serviços' },
    // PINs App Nativo
    { id: 'app_pins', name: 'PINs App Nativo' },
    // Revalidação de Fotos
    { id: 'revalidate', name: 'Revalidar Fotos (Auditoria)' },
    { id: 'revalidate_write', name: 'Salvar Resultado de Revalidação' }
];

async function listModules() {
    return AVAILABLE_MODULES;
}

module.exports = {
    listModules
};