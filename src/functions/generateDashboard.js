require('dotenv').config();
const { APP_STATES } = require('../constants/states');

function getAssetsLink(fileName) {
    const assetsLink = process.env.PUBLIC_BASE_URL + '/files/assets/' + fileName;
    return assetsLink;
}
function generateDashboard({ state, id, stats }) {

    let banners = [
        {
            imageUrl: getAssetsLink('banner7.png'),
            action: { type: 'link', url: '/inventory' }
        },
        {
            imageUrl: getAssetsLink('banner5.png'),
            action: { type: 'link', url: '' }
        },
        {
            imageUrl: getAssetsLink('banner6.png'),
            action: { type: 'link', url: '/search' }
        }
    ]


    let widgets = [
        {
            id: 'stat_leituras',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Leituras Realizadas',
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
                title: 'Leituras Pendentes',
                value: String(stats.pending.length),
                icon: 'AlertTriangle',
                color: 'text-red-500 bg-red-50/10'
            },
            action: { type: 'link', url: '/justify-pending' }
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
        // {
        //     id: 'banner_promo',
        //     type: 'bannerCarousel',
        //     size: { colSpan: 3, rowSpan: 1 },
        //     data: {
        //         autoSlideInterval: 5000,
        //         banners: banners
        //     },
        // },
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
        {
            id: 'chart_month_leituras',
            type: 'chartCard',
            size: { colSpan: 2, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Leituras do mês',
                description: 'Leituras realizadas e não lidas',
                dataset: [
                    { label: "Lidos", value: stats.month_leituras },
                    { label: "Não lidos", value: stats.month_cnl }
                ],

            },
        },
        {
            id: 'stat_month_total_leituras',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Total de leituras',
                value: String(stats.month_total_leituras),
                icon: 'Check',
                color: 'text-emerald-500 bg-emerald-50/10'
            },
            action: { type: 'link', url: '/services?filter=all' }
        },

    ];

    // if (stats.pending_justifies.length > 0) {
    //     widgets.unshift({
    //         id: 'alert_2',
    //         type: 'alertCard',
    //         size: { colSpan: 3, rowSpan: 1 },
    //         data: {
    //             title: "ATENÇÃO!",
    //             message: "Você possui pendências a justificar. Por favor, acesse o menu lateral e clique em 'Justificar Pendências'.",
    //             severity: "warning"
    //         },
    //     });
    // }

    return {
        layout: {
            columns: 3,
            gap: 12,
            baseRowHeight: 140
        },
        widgets
    };
}


async function generateDashboardAdmin({ user, stats }) {
    // console.log(user)
    const widgets = [
        {
            id: 'total-users',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Usuários Cadastrados',
                value: stats.users_agents?.length,
                subtitle: 'Agentes cadastrados no sistema',
                icon: 'users',
                color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
            },
            action: { type: 'link', url: '/control/agents' },
        },
        {
            id: 'chart-reports-week',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Quantidade por processo',
                dataset: [
                    { label: 'Cobrança', value: stats.users_agents?.filter(u => u.setor === 'COBRANÇA').length },
                    { label: 'Negociação', value: stats.users_agents?.filter(u => u.setor === 'NEGOCIAÇÃO').length },
                    { label: 'Leitura', value: stats.users_agents?.filter(u => u.setor === 'LEITURA').length },
                ],
            },
        }, {
            id: 'chart-reports-state',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 2 },
            data: {
                chartType: 'donut',
                title: 'Quantidade por estado',
                dataset: APP_STATES.map(s => ({
                    label: s.label, 
                    value: stats.users_agents?.filter(u => u.estado === s.value).length 
                })),
            },
        },
        {
            id: 'inventory-count',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Inventários Registrados',
                value: stats.inventory?.length,
                subtitle: 'PDAs, impressoras e maquinetas',
                icon: 'package',
                color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
            },
            action: { type: 'link', url: '/control/inventory' },
        },
        {
            id: 'pending-justifies',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Justificativas Pendentes',
                value: stats.justify_pending?.length,
                subtitle: 'Aguardando resposta',
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
                title: 'Diários de bordo',
                value: stats.daily_report?.length,
                subtitle: 'Enviados hoje',
                icon: 'check-circle',
                color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
            },
            action: { type: 'link', url: '/control/daily-reports' },
        }
    ]

    return {
        layout: { columns: 3, gap: 16, baseRowHeight: 165 },
        widgets
    };
}

async function generateAdminDashboard({ user, stats }) {
    const widgets = [
        {
            id: 'total-users',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Usuários Cadastrados',
                value: String(stats.totalUsers),
                subtitle: 'Colaboradores visíveis',
                icon: 'Users',
                color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
            },
            action: { type: 'link', url: '/control/agents' },
        },
        {
            id: 'today-logins',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Agentes Logados Hoje',
                value: `${stats.todayLogins} de ${stats.totalUsers}`,
                subtitle: 'Heartbeats registrados no dia',
                icon: 'LogIn',
                color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
            },
            action: { type: 'link', url: '/control/agents' },
        },
        {
            id: 'inventory-agents',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Agentes com Inventário',
                value: `${stats.agentsWithInventory} de ${stats.totalUsers}`,
                subtitle: 'Possuem equipamento associado',
                icon: 'Package',
                color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
            },
            action: { type: 'link', url: '/control/inventory' },
        },
        {
            id: 'chart-login-status',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 3 },
            data: {
                chartType: 'donut',
                title: 'Status de Login',
                dataset: [
                    { label: 'Online', value: stats.loginStatus?.online || 0 },
                    { label: 'Offline', value: stats.loginStatus?.offline || 0 },
                    { label: 'Pendente', value: stats.loginStatus?.pending || 0 },
                    { label: 'Nunca Gerado PIN', value: stats.loginStatus?.none || 0 },
                ],
            },
        },
        {
            id: 'chart-reports-situacao',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Agentes por Situação',
                dataset: stats.bySituacao || [],
            },
        },
        {
            id: 'chart-reports-status',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Agentes por Status',
                dataset: stats.byStatus || [],
            },
        },
        {
            id: 'chart-reports-state',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Agentes por Estado',
                dataset: stats.byEstado || [],
            },
        },
        {
            id: 'chart-reports-regional',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Agentes por Regional',
                dataset: stats.byRegional || [],
            },
        },
        {
            id: 'chart-reports-processo',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Agentes por Processo',
                dataset: stats.byProcesso || [],
            },
        },
        {
            id: 'chart-inventory-items',
            type: 'chartCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                chartType: 'bar',
                title: 'Itens de Inventário por Tipo',
                dataset: stats.inventoryByType || [],
            },
        },
    ];

    return {
        layout: { columns: 3, gap: 16, baseRowHeight: 165 },
        widgets
    };
}

module.exports = {
    generateDashboard,
    generateDashboardAdmin,
    generateAdminDashboard
};