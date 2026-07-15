const { VALID_STATE_VALUES } = require('../constants/states');


function generateCustomLinks({ state, id, user }) {

    const links = [
        {
            "id": "profile-app",
            "label": "Perfil",
            "description": "Meu perfil",
            "url": `/profile`,
            "emoji": "User",
            "color": "text-indigo-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "security-checklist-app",
            "label": "Checklist de Segurança",
            "description": "Faça seu checklist",
            "url": `/checklists`,
            "emoji": "ShieldCheck",
            "color": "text-green-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "security-report-app",
            "label": "Reportes de segurança",
            "description": "Consulte perigos na rota",
            "url": `/security-reports`,
            "emoji": "Shield",
            "color": "text-orange-600",
            "states":VALID_STATE_VALUES
        },
        {
            "id": "ceneduc-app",
            "label": "Ceneduc",
            "description": "Cursos",
            "url": `/ceneduc`,
            "emoji": "BookOpen",
            "color": "text-blue-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "chatmessages-app",
            "label": "Chat",
            "description": "Converse com o suporte",
            "url": '/chat',
            "emoji": "MessageCircle",
            "color": "text-purple-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "servicos-app",
            "label": "Serviços",
            "description": "Meus serviços atribuídos",
            "url": '/service-notes',
            "emoji": "Smartphone",
            "color": "text-yellow-600",
            "states": ['pi']
        },
        {
            "id": "busca-app",
            "label": "Pesquisar Instalação",
            "description": "Encontre instalações",
            "url": `/search`,
            "emoji": "MapPinned",
            "color": "text-red-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "inventario-app",
            "label": "Inventário",
            "description": "Cadastre os equipamentos",
            "url": `/inventory`,
            "emoji": "Box",
            "color": "text-yellow-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "daily-report-app",
            "label": "Diário de bordo",
            "description": "Como foi seu dia?",
            "url": `/daily-report`,
            "emoji": "Newspaper",
            "color": "text-green-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "justify-pending-app",
            "label": "Justificar pendências",
            "description": "Justifique suas pendências",
            "url": `/justify-pending`,
            "emoji": "AlertTriangle",
            "color": "text-indigo-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "atestado-app",
            "label": "Atestado",
            "description": "Seu atestado",
            "url": `/atestado`,
            "emoji": "DocumentText",
            "color": "text-red-600",
            "states": ['pi']
        }
    ]

    let links_filtered = links.filter(link => link.states.includes(state));

    links_filtered.forEach(link => {
        link.url = link.url.replace('${id}', id);
    });

    if (user.id === 'T38876') {
        links_filtered.unshift();
        links_filtered.unshift();
    }

    return links_filtered
}

module.exports = {
    generateCustomLinks
};
