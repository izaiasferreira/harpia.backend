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
            id: 'alert_agent_performance',
            type: 'alertCard',
            size: { colSpan: 3, rowSpan: 1 },
            data: {
                title: "DESEMPENHO DA SEMANA",
                message: (stats.percent_cnl && stats.percent_cnl > 10)
                    ? `Atenção: Seu índice de CNL (${stats.percent_cnl.toFixed(1)}%) está acima da semana anterior. Verifique suas pendências.`
                    : `Seu índice de CNL (${(stats.percent_cnl || 0).toFixed(1)}%) está controlado em relação à semana anterior. Continue assim!`,
                severity: (stats.percent_cnl && stats.percent_cnl > 10) ? "warning" : "info"
            },
        },
        {
            id: 'stat_leituras',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Lidas',
                value: String(stats.quant_leituras),
                icon: 'FileCheck',
                variant: 'mint',
                color: 'text-emerald-600 bg-emerald-500/15 dark:text-emerald-400 dark:bg-emerald-500/20'
            },
            action: { type: 'link', url: '/services?filter=all' }
        },
        {
            id: 'stat_pendencias',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Pendentes',
                value: String(stats.pending.length),
                icon: 'Clock',
                variant: 'rose',
                color: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20'
            },
            action: { type: 'link', url: '/justify-pending' }
        },
        {
            id: 'stat_perdas',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Perdas',
                value: `${stats.perdas} Kwh`,
                icon: 'Flame',
                variant: 'amber',
                color: 'text-amber-600 bg-amber-500/15 dark:text-amber-400 dark:bg-amber-500/20'
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
                title: 'Tempo Total',
                value: stats.total_time_fmt,
                icon: 'Timer',
                variant: 'sky',
                color: 'text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20'
            },
            action: { type: 'link', url: '/services?filter=all' }
        },
        {
            id: 'stat_pause_time',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Pausa',
                value: stats.pause_time_fmt,
                icon: 'PauseCircle',
                variant: 'sky',
                color: 'text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20'
            }
        },
        {
            id: 'stat_work_time',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'Efetivo',
                value: stats.work_time_fmt,
                icon: 'Briefcase',
                variant: 'sky',
                color: 'text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20'
            }
        },
        {
            id: 'stat_cnl',
            type: 'statCard',
            size: { colSpan: 2, rowSpan: 1 },
            data: {
                title: 'CNL Total',
                value: String(stats.cnl),
                icon: 'FileX',
                variant: 'rose',
                color: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20'
            },
            action: { type: 'link', url: '/services?filter=cnl' }
        },
        {
            id: 'stat_percent_cnl',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'CNL %',
                value: `${stats.percent_cnl.toFixed(1)}%`,
                icon: 'Percent',
                variant: 'rose',
                color: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20'
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
                title: 'C12 Fora Hora',
                value: String(stats.quant_c12_out_hour),
                subtitle: 'Antes das 08:00',
                icon: 'AlarmClock',
                variant: 'purple',
                color: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20'
            },
            action: { type: 'link', url: '/services?filter=c12_out_time' }
        },
        {
            id: 'stat_c12',
            type: 'statCard',
            size: { colSpan: 2, rowSpan: 1 },
            data: {
                title: 'C12 Total',
                value: String(stats.quant_c12),
                icon: 'Building',
                variant: 'purple',
                color: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20'
            },
            action: { type: 'link', url: '/services?filter=c12' }
        },
        {
            id: 'stat_c12_nova',
            type: 'statCard',
            size: { colSpan: 1, rowSpan: 1 },
            data: {
                title: 'C12 Nova',
                value: String(stats.licacao_nova_c12),
                icon: 'PlusCircle',
                variant: 'purple',
                color: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20'
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
                icon: 'FastForward',
                variant: 'purple',
                color: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20'
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
                icon: 'Inbox',
                variant: 'purple',
                color: 'text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20'
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
                title: 'Total Mês',
                value: String(stats.month_total_leituras),
                icon: 'CalendarCheck',
                variant: 'mint',
                color: 'text-emerald-600 bg-emerald-500/15 dark:text-emerald-400 dark:bg-emerald-500/20'
            },
            action: { type: 'link', url: '/services?filter=all' }
        },

    ];

    if (stats.pending_justifies.length > 0) {
        widgets.unshift({
            id: 'alert_2',
            type: 'alertCard',
            size: { colSpan: 3, rowSpan: 1 },
            data: {
                title: "ATENÇÃO!",
                message: "Você possui pendências a justificar. Por favor, acesse o menu lateral e clique em 'Justificar Pendências'.",
                severity: "warning"
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

module.exports = {
    generateDashboard,
    generateDashboardAdmin
};