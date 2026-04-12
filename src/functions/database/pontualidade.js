const { pi_pool, ma_pool } = require('../../db');

function isDiaUtil(data, feriados) {
    const d = new Date(data);
    const diaSemana = d.getDay();
    if (diaSemana === 0) return false;
    const dataStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    if (feriados.has(dataStr)) return false;
    return true;
}

function adicionarDiasUteis(data, dias, feriados) {
    const result = new Date(data);
    let adicionados = 0;
    while (adicionados < dias) {
        result.setDate(result.getDate() + 1);
        if (isDiaUtil(result, feriados)) {
            adicionados++;
        }
    }
    return result;
}

async function pontualidade(state = 'pi', region = 'all') {
    let query = `
    SELECT *
    FROM matriz
    WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
  `;
    const params = [];
    if (region !== 'all') {
        query += ` AND regional = $1`;
        params.push(region.toUpperCase());
    }

    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    if (rows.length === 0) return { type: 'text', text: 'Nenhuma instalação encontrada.' };

    let query_last_update = `
    SELECT data
    FROM vars
    WHERE nome='abap_hora'
  `;

    const { rows: rows_last_update } = state === 'pi' ? await pi_pool.query(query_last_update) : await ma_pool.query(query_last_update);
    const last_update = rows_last_update[0].data;

    const unified = {};
    for (const row of rows) {
        if (!unified[row.regional]) unified[row.regional] = {};
        if (!unified[row.regional][row.seccional]) unified[row.regional][row.seccional] = [];
        unified[row.regional][row.seccional].push(row);
    }

    const { rows: rows_feriados } = state === 'pi' ? await pi_pool.query("SELECT date FROM feriados") : await ma_pool.query("SELECT date FROM feriados");
    const feriados = new Set(rows_feriados.map(f => {
        const d = new Date(f.date);
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    }));



    let text = `Última atualização: ${last_update}\n\n`;
    for (const reg of Object.keys(unified)) {
        let total_concluido = 0;
        let total_geral = 0;
        text += `REGIONAL ${reg}\n\n`;
        for (const sec of Object.keys(unified[reg])) {
            text += ` - *${sec.trim()} :* \n`;
            const etapas = [...new Set(unified[reg][sec].map(r => r.etapa))].sort();
            for (const etapa of etapas) {
                const data_prev = unified[reg][sec].filter(r => r.etapa === etapa)[0].data_leit_prev;
                const now = new Date();

                const diasAdicionais = (parseInt(etapa) >= 25 && parseInt(etapa) <= 30) ? 3 : 1;
                const dataPrevDate = new Date(data_prev);
                const limitePontualidade = adicionarDiasUteis(dataPrevDate, diasAdicionais, feriados);
                limitePontualidade.setHours(10, 0, 0, 0);

                const aindaNaJanela = now <= limitePontualidade;

                const quant_total = unified[reg][sec].filter(r => r.etapa === etapa).length;
                const quant_concluido = unified[reg][sec].filter(r => {
                    if (r.etapa !== etapa || r.concluido !== 'CONCLUIDO') return false;
                    const dataPrev = new Date(r.data_leit_prev);
                    const dataConclusao = new Date(r.data_conclusao);
                    const limite = adicionarDiasUteis(dataPrev, diasAdicionais, feriados);
                    limite.setHours(10, 0, 0, 0);
                    return dataConclusao <= limite;
                }).length;

                const quant_pendente = unified[reg][sec].filter(r => r.etapa === etapa && r.concluido === 'PENDENTE').length;

                const is_parcial = quant_pendente > 0 && quant_pendente < quant_total && aindaNaJanela;

                text += `> Etapa ${etapa}: ${((quant_concluido / quant_total) * 100).toFixed(2)}% ${is_parcial ? `(Parcial)` : ''}\n`;
                text += `> NP: ${quant_concluido} | FP: ${quant_total - quant_concluido - quant_pendente} | PEND: ${quant_pendente}\n\n`;
                total_concluido += quant_concluido;
                total_geral += quant_total;
            }
        }
        text += `\nTOTAL: ${((total_concluido / total_geral) * 100).toFixed(2)}%\n`;
    }
    return { type: 'text', text };
}

async function pontualidadeJson(state = 'pi', region = 'all') {
    let query = `
    SELECT *
    FROM matriz
    WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
  `;
    const params = [];
    if (region !== 'all') {
        query += ` AND regional = $1`;
        params.push(region.toUpperCase());
    }

    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    if (rows.length === 0) return { type: 'text', text: 'Nenhuma instalação encontrada.' };

    const unified = {};
    for (const row of rows) {
        if (!unified[row.regional]) unified[row.regional] = {};
        if (!unified[row.regional][row.seccional]) unified[row.regional][row.seccional] = [];
        unified[row.regional][row.seccional].push(row);
    }

    const { rows: rows_feriados } = state === 'pi' ? await pi_pool.query("SELECT date FROM feriados") : await ma_pool.query("SELECT date FROM feriados");
    const feriados = new Set(rows_feriados.map(f => {
        const d = new Date(f.date);
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    }));



    let result = []
    for (const reg of Object.keys(unified)) {
        let total_concluido = 0;
        let total_geral = 0;
        for (const sec of Object.keys(unified[reg])) {
            let etapa_result = []
            const etapas = [...new Set(unified[reg][sec].map(r => r.etapa))].sort();
            for (const etapa of etapas) {
                const data_prev = unified[reg][sec].filter(r => r.etapa === etapa)[0].data_leit_prev;
                const now = new Date();

                const diasAdicionais = (parseInt(etapa) >= 25 && parseInt(etapa) <= 30) ? 3 : 1;
                const dataPrevDate = new Date(data_prev);
                const limitePontualidade = adicionarDiasUteis(dataPrevDate, diasAdicionais, feriados);
                limitePontualidade.setHours(10, 0, 0, 0);

                const aindaNaJanela = now <= limitePontualidade;

                const quant_total = unified[reg][sec].filter(r => r.etapa === etapa).length;
                const quant_concluido = unified[reg][sec].filter(r => {
                    if (r.etapa !== etapa || r.concluido !== 'CONCLUIDO') return false;
                    const dataPrev = new Date(r.data_leit_prev);
                    const dataConclusao = new Date(r.data_conclusao);
                    const limite = adicionarDiasUteis(dataPrev, diasAdicionais, feriados);
                    limite.setHours(10, 0, 0, 0);
                    return dataConclusao <= limite;
                }).length;

                const quant_pendente = unified[reg][sec].filter(r => r.etapa === etapa && r.concluido === 'PENDENTE').length;

                const is_parcial = quant_pendente > 0 && quant_pendente < quant_total && aindaNaJanela;

                etapa_result.push({
                    etapa: etapa,
                    percentual: ((quant_concluido / quant_total) * 100).toFixed(2),
                    status: is_parcial ? 'PARCIAL' : '',
                    quant_dias_adicionais: diasAdicionais,
                    data_prev: new Date(data_prev).toLocaleDateString('pt-BR') + ' ' + new Date(data_prev).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    limite: limitePontualidade.toLocaleDateString('pt-BR') + ' ' + limitePontualidade.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    np: quant_concluido,
                    fp: quant_total - quant_concluido - quant_pendente,
                    pend: quant_pendente
                })
                total_concluido += quant_concluido;
                total_geral += quant_total;
            }
            result.push({
                regional: reg,
                seccional: sec,
                supervisor: null,
                etapas: etapa_result,
            })
        }

    }
    return result;
}

module.exports = {
    pontualidade,
    pontualidadeJson
};
