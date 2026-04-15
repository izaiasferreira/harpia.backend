const { link } = require("../routes/agente");

function generateCustomLinks({ state, id }) {

    const links = [
        {
            "id": "servicos-app",
            "label": "Serviços",
            "description": "Meus serviços atribuídos",
            "url": 'https://service.izisolucoes.com.br/servicos/default/699e3e5914265fccd12f57ad?matricula=${id}',
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
            "states": ['pi']
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

    const links_filtered = links.filter(link => link.states.includes(state));

    links_filtered.forEach(link => {
        link.url = link.url.replace('${id}', id);
    });

    return links_filtered
}

module.exports = {
    generateCustomLinks
};