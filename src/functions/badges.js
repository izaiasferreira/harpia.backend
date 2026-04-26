const AVAILABLE_BADGES = [
    {
        id: 2,
        title: "Roteirizador Master",
        description: "Completou o treinamento de abertura de notas de Remanejamento",
        earned: true,
        imageUrl: "https://api.izi.tec.br/files/assets/emblema3.png"
    },
    {
        id: 3,
        title: "Amigo da Segurança",
        description: "Completou o treinamento de reporte de perigos na rota",
        earned: true,
        imageUrl: "https://api.izi.tec.br/files/assets/emblema2.png"
    },
    {
        id: 1,
        title: "Limpador de Rota",
        description: "Completou o treinamento de abertura de notas de Desligamento",
        earned: true,
        imageUrl: "https://api.izi.tec.br/files/assets/emblema1.png"
    },
    {
        id: 4,
        title: "Visão de Águia",
        description: "Completou o treinamento atenção e prevenção a erros de leitura.",
        earned: true,
        imageUrl: "https://api.izi.tec.br/files/assets/emblema4.png"
    },

];

async function listBadges() {
    return AVAILABLE_BADGES;
}

module.exports = {
    listBadges
};