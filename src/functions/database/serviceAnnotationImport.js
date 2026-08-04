const XLSX = require('xlsx');
const { create_service_annotation } = require('./serviceAnnotations');

const VALID_TIPOS = ['Remanejamento', 'Anotação', 'Coordenada'];
const VALID_IDENTIFICACAO = ['Medidor', 'Instalação', 'Unidade Consumidora'];
const VALID_ESTADOS = ['pi', 'ma'];

async function processServiceAnnotationImport(fileBuffer, user) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const autor = user.id || user.nome || 'admin';

    for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;

        const descricao = String(row['DESCRICAO'] || row['Descrição'] || row['Descricao'] || '').trim();
        const tipo = String(row['TIPO'] || row['Tipo'] || '').trim();
        const identificacaoTipo = String(row['IDENTIFICACAO_TIPO'] || row['Identificação'] || '').trim() || null;
        const identificacaoValor = String(row['IDENTIFICACAO_VALOR'] || row['Identificação Valor'] || '').trim() || null;
        const estado = String(row['ESTADO'] || row['Estado'] || 'pi').trim().toLowerCase();
        const regional = String(row['REGIONAL'] || row['Regional'] || '').trim() || null;
        const seccional = String(row['SECCIONAL'] || row['Seccional'] || '').trim() || null;
        const expiresAt = String(row['EXPIRA_EM'] || row['Expira em'] || '').trim() || null;
        const latitude = String(row['LATITUDE'] || row['Latitude'] || '').trim() || null;
        const longitude = String(row['LONGITUDE'] || row['Longitude'] || '').trim() || null;

        if (!descricao) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: DESCRICAO não informada.`);
            continue;
        }
        if (!VALID_TIPOS.includes(tipo)) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: TIPO "${row['TIPO'] || row['Tipo'] || ''}" inválido. Use: ${VALID_TIPOS.join(', ')}`);
            continue;
        }
        if (!VALID_ESTADOS.includes(estado)) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: ESTADO "${row['ESTADO'] || row['Estado'] || ''}" inválido. Use: PI, MA`);
            continue;
        }
        if (identificacaoTipo && !VALID_IDENTIFICACAO.includes(identificacaoTipo)) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: IDENTIFICACAO_TIPO "${identificacaoTipo}" inválido. Use: ${VALID_IDENTIFICACAO.join(', ')}`);
            continue;
        }
        if (expiresAt && isNaN(Date.parse(expiresAt))) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: EXPIRA_EM "${expiresAt}" é uma data inválida. Use o formato AAAA-MM-DD.`);
            continue;
        }

        try {
            await create_service_annotation({
                autor,
                tipo,
                identificacao_tipo: identificacaoTipo,
                identificacao_valor: identificacaoValor,
                descricao,
                latitude,
                longitude,
                estado,
                seccional,
                regional,
                foto: null,
                expires_at: expiresAt,
            });
            successCount++;
        } catch (dbErr) {
            errorCount++;
            errors.push(`Linha ${rowNumber} (${tipo}): ${dbErr.message}`);
        }
    }

    return {
        totalProcessed: rows.length,
        successCount,
        errorCount,
        created: successCount,
        errors,
    };
}

module.exports = { processServiceAnnotationImport };
