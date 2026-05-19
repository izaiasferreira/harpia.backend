const { link } = require("../routes/agente");

function generateCustomLinks({ state, id, user }) {

    const links = [
        {
            "id": "profile-app",
            "label": "Perfil",
            "description": "Meu perfil",
            "url": `/profile`,
            "emoji": "User",
            "color": "text-green-600",
            "states": ['pi', 'ma']
        },
        {
            "id": "security-report-app",
            "label": "Reportes de segurança",
            "description": "Consulte perigos na rota",
            "url": `/security-reports`,
            "emoji": "Shield",
            "color": "text-red-600",
            "states": ['pi']
        },
        {
            "id": "ceneduc-app",
            "label": "Ceneduc",
            "description": "Cursos",
            "url": `/ceneduc`,
            "emoji": "BookOpen",
            "color": "text-red-600",
            "states": ['pi', 'ma']
        },
        {
            "id": "servicos-app",
            "label": "Serviços",
            "description": "Meus serviços atribuídos",
            "url": '/service-notes',
            "emoji": "Smartphone",
            "color": "text-blue-600",
            "states": ['pi']
        },
        {
            "id": "busca-app",
            "label": "Pesquisar Instalação",
            "description": "Encontre instalações",
            "url": `/search`,
            "emoji": "MapPinned",
            "color": "text-green-600",
            "states": ['pi', 'ma']
        },
        {
            "id": "inventario-app",
            "label": "Inventário",
            "description": "Cadastre os equipamentos",
            "url": `/inventory`,
            "emoji": "Box",
            "color": "text-yellow-600",
            "states": ['pi', 'ma']
        },
        {
            "id": "daily-report-app",
            "label": "Diário de bordo",
            "description": "Como foi seu dia?",
            "url": `/daily-report`,
            "emoji": "Newspaper",
            "color": "text-blue-600",
            "states": ['pi', 'ma']
        },
        {
            "id": "justify-pending-app",
            "label": "Justificar pendências",
            "description": "Justifique suas pendências",
            "url": `/justify-pending`,
            "emoji": "AlertTriangle",
            "color": "text-red-600",
            "states": ['pi', 'ma']
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