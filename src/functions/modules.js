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
    { id: 'create_users_agents', name: 'Criar Agente' },
    { id: 'update_users_agents', name: 'Atualizar Agente' },
    { id: 'delete_users_agents', name: 'Deletar Agente' },
    { id: 'send_message_to_agent', name: 'Enviar Mensagem para Agente' }
];

async function listModules() {
    return AVAILABLE_MODULES;
}

module.exports = {
    listModules
};