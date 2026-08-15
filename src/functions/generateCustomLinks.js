const { VALID_STATE_VALUES } = require('../constants/states');


function generateCustomLinks({ state, id, user }) {

    const links = [
        // {
        //     "id": "leituras-app",
        //     "label": "Leituras",
        //     "url": `/services`,
        //     "emoji": "BookCheck",
        //     "color": "text-emerald-600",
        //     "states": VALID_STATE_VALUES
        // },
        // {
        //     "id": "perdas-app",
        //     "label": "Perdas",
        //     "url": `/perdas`,
        //     "emoji": "Zap",
        //     "color": "text-amber-600",
        //     "states": VALID_STATE_VALUES
        // },
        {
            "id": "agenda-app",
            "label": "Agenda",
            "url": `/calendar`,
            "emoji": "Calendar",
            "color": "text-purple-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "security-checklist-app",
            "label": "Checklist",
            "url": `/checklists`,
            "emoji": "ShieldCheck",
            "color": "text-green-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "security-report-app",
            "label": "Reportes",
            "url": `/security-reports`,
            "emoji": "Shield",
            "color": "text-orange-600",
            "states":VALID_STATE_VALUES
        },
        {
            "id": "ceneduc-app",
            "label": "Educação",
            "url": `/education`,
            "emoji": "BookOpen",
            "color": "text-blue-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "chatmessages-app",
            "label": "Chat",
            "url": '/chat',
            "emoji": "MessageCircle",
            "color": "text-purple-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "servicos-app",
            "label": "Serviços",
            "url": '/service-notes',
            "emoji": "Smartphone",
            "color": "text-yellow-600",
            "states": ['pi']
        },
        {
            "id": "inventario-app",
            "label": "Inventário",
            "url": `/inventory`,
            "emoji": "Box",
            "color": "text-yellow-600",
            "states": VALID_STATE_VALUES
        },
        {
            "id": "daily-report-app",
            "label": "Diário",
            "url": `/daily-report`,
            "emoji": "Newspaper",
            "color": "text-green-600",
            "states": VALID_STATE_VALUES
        },
        // {
        //     "id": "justify-pending-app",
        //     "label": "Justificar pendências",
        //     "description": "Justifique suas pendências",
        //     "url": `/justify-pending`,
        //     "emoji": "FileX",
        //     "color": "text-red-600",
        //     "states": VALID_STATE_VALUES
        // },
        // {
        //     "id": "atestado-app",
        //     "label": "Atestado",
        //     "description": "Envie seu atestado",
        //     "url": `https://docs.google.com/forms/d/e/1FAIpQLSccADjOMTX5FItKyJaEYQ_4Wqlrup2HgHEqHbkyXuzBrnax2Q/viewform?usp=send_form`,
        //     "emoji": "FileText",
        //     "color": "text-red-600",
        //     "states": ['pi'],
        //     "forceIframe": true
        // }
    ];

    if (user && user.is_gestor) {
        links.push({
            "id": "manager-tracking-app",
            "label": "Monitoramento",
            "description": "Localização e infrações",
            "url": `/tracking`,
            "emoji": "MapPin",
            "color": "text-blue-600",
            "states": VALID_STATE_VALUES
        });
    }

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
