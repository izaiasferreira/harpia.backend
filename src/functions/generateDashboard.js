require('dotenv').config();
function getAssetsLink(fileName) {
    const assetsLink = process.env.PUBLIC_BASE_URL + '/files/assets/' + fileName;
    return assetsLink;
}
function generateDashboard({ state, id, today_date, stats }) {

    let banners = [
        {
            imageUrl: getAssetsLink('banner7.png'),
            action: { type: 'link', url: '/inventory' }
        },
        {
            imageUrl: getAssetsLink('banner4.png'),
            action: { type: 'link', url: `https://forms.cattalk.com.br/form/satisfacao-ceneged-bot?id=${id}` }
        },
        {
            imageUrl: getAssetsLink('banner5.png'),
            action: { type: 'link', url: '' }
        }
    ]


    if (state === 'pi') {
        banners.push({
            imageUrl: getAssetsLink('banner6.png'),
            action: { type: 'link', url: '/search' }
        })
    }

    let widgets = [
        {
            id: 'banner_promo',
            type: 'bannerCarousel',
            size: { colSpan: 3, rowSpan: 1 },
            data: {
                autoSlideInterval: 5000,
                banners: banners
            },
        },
        {
            id: 'stat_leituras',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Leituras',
                value: String(stats.quant_leituras),
                icon: 'BookCheck',
                color: 'text-emerald-500 bg-emerald-50/10'
            },
            action: { type: 'link', url: '/services?filter=all' }
        },
        {
            id: 'stat_pendencias',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Pendências',
                value: String(stats.pending.length),
                icon: 'AlertTriangle',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/services?filter=all' }
        },
        {
            id: 'stat_perdas',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Perdas Geradas',
                value: `${stats.perdas} Kwh`,
                icon: 'Zap',
                color: 'text-yellow-500 bg-yellow-50/10'
            },
            action: { type: 'link', url: '/perdas' }
        },
        {
            id: 'chart_producao_hora',
            type: 'chartCard',
            size: { colSpan: 3, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Leituras por Hora',
                dataset: stats.hourly_dataset
            },
        },
        {
            id: 'stat_total_time',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Tempo Total de Trabalho',
                value: stats.total_time_fmt,
                icon: 'Clock',
                color: 'text-blue-500 bg-blue-50/10'
            },
            action: { type: 'link', url: '/services?filter=all' }
        },
        {
            id: 'stat_pause_time',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Tempo em Pausa',
                value: stats.pause_time_fmt,
                icon: 'CirclePause',
                color: 'text-blue-500 bg-blue-50/10'
            }
        },
        {
            id: 'stat_work_time',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Tempo Efetivo',
                value: stats.work_time_fmt,
                icon: 'ClockCheck',
                color: 'text-blue-500 bg-blue-50/10'
            }
        },
        {
            id: 'stat_cnl',
            type: 'statCard',
            size: { colSpan: 2, rowSpan: 1 },
            data: {
                title: 'Quantidade de CNL',
                value: String(stats.cnl),
                icon: 'UserX',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/services?filter=cnl' }
        },
        {
            id: 'stat_percent_cnl',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Percentual de CNL',
                value: `${stats.percent_cnl.toFixed(1)}%`,
                icon: 'TrendingUp',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/services?filter=cnl' }
        },
        {
            id: 'chart_cnl_semana',
            type: 'chartCard',
            size: { colSpan: 3, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'CNL da semana',
                dataset:
                    stats.weekly_cnl_stats['labels'].map((label, i) => {
                        return {
                            label: label,
                            value: parseInt(stats.weekly_cnl_stats['series'][i])
                        }
                    })
            },
        },
        {
            id: 'stat_c12_hora',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'C12 Fora de Horário',
                value: String(stats.quant_c12_out_hour),
                subtitle: 'Antes das 08:00',
                icon: 'Moon',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/services?filter=c12_out_time' }
        },
        {
            id: 'stat_c12',
            type: 'statCard',
            size: { colSpan: 2, rowSpan: 1 },
            data: {
                title: 'Total de C12',
                value: String(stats.quant_c12),
                icon: 'House',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/services?filter=c12' }
        },
        {
            id: 'stat_c12_nova',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'C12 em Ligação Nova',
                value: String(stats.licacao_nova_c12),
                icon: 'HousePlus',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/services?filter=c12_ligacao_nova' }
        },
        {
            id: 'stat_c12_fast',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'C12 Rápido',
                value: String(stats.fast_c12),
                icon: 'UserPlus',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/services?filter=fast_c12' }
        },
        {
            id: 'stat_first_c12',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'C12 Entrante',
                value: String(stats.first_c12),
                icon: 'SearchAlert',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/services?filter=first_c12' }
        },
    ];

    //caso o id não comece com letra, adicionar um alerta
    if (!id.match(/^[a-zA-Z]/)) {
        widgets.unshift({
            id: 'alert_1',
            type: 'alertCard',
            size: { colSpan: 3, rowSpan: 1 },
            data: {
                title: "Atenção",
                message: "Identificamos que seu cadastro está incorreto. Feche essa página e digite /cadastro para se cadastrar novamente.",
                severity: "warning"
            },
        });
    }

    if (['F26469341', 'T30088', 'T54295'].includes(id)) {
        widgets.unshift({
            id: 'alert_2',
            type: 'alertCard',
            size: { colSpan: 3, rowSpan: 1 },
            data: {
                title: "OBRIGADO!",
                message: "Seu comentário de melhoria na pesquisa de satisfação foi ouvido e aprovado! Já estamos trabalhando nisso. Agradecemos a sua sugestão!",
                severity: "success"
            },
        });
    }

    return {
        layout: {
            columns: 3,
            gap: 12,
            baseRowHeight: 140
        },
        widgets
    };
}


async function generateDashboardAdmin(user) {

    const widgets = [
        {
            id: 'total-users',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Usuários Cadastrados',
                value: '48',
                subtitle: 'Agentes ativos no sistema',
                icon: 'users',
                color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
            },
            action: { type: 'link', url: '/control/users' },
        },
        {
            id: 'pending-justifies',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Justificativas Pendentes',
                value: '12',
                subtitle: 'Aguardando revisão',
                icon: 'file-text',
                color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
            },
            action: { type: 'link', url: '/control/justify-pending' },
        },
        {
            id: 'daily-reports',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Relatórios Hoje',
                value: '34',
                subtitle: 'De 48 agentes esperados',
                icon: 'check-circle',
                color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
            },
            action: { type: 'link', url: '/control/daily-reports' },
        },
        {
            id: 'alert-pending',
            type: 'alertCard',
            size: { colSpan: 3, rowSpan: 1 },
            data: {
                title: 'Atenção',
                message: '12 justificativas de pendências aguardam sua revisão. Clique aqui para visualizá-las.',
                severity: 'warning',
            },
            action: { type: 'link', url: '/control/justify-pending' },
        },
        {
            id: 'chart-reports-week',
            type: 'chartCard',
            size: { colSpan: 2, rowSpan: 2 },
            data: {
                chartType: 'bar',
                title: 'Relatórios por dia (semana atual)',
                dataset: [
                    { label: 'Seg', value: 38 },
                    { label: 'Ter', value: 42 },
                    { label: 'Qua', value: 29 },
                    { label: 'Qui', value: 45 },
                    { label: 'Sex', value: 34 },
                ],
            },
        },
        {
            id: 'inventory-count',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Inventários Registrados',
                value: '41',
                subtitle: 'PDAs e impressoras',
                icon: 'package',
                color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
            },
            action: { type: 'link', url: '/control/inventory' },
        },
        {
            id: 'branches-count',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Filiais Ativas',
                value: '6',
                subtitle: 'PI e MA',
                icon: 'map-pin',
                color: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
            },
            action: { type: 'link', url: '/control/branches' },
        },
    ]

    return {
        layout: { columns: 3, gap: 16, baseRowHeight: 165 },
        widgets
    };
}

module.exports = {
    generateDashboard,
    generateDashboardAdmin
};