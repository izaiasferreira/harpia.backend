const PDFDocument = require('pdfkit');
const axios = require('axios');

/**
 * Gera um PDF profissional para um checklist de segurança.
 * @param {Object} checklist - objeto completo do checklist, incluindo answers e compliance_summary
 * @returns {Promise<Buffer>} Buffer binário do PDF
 */
function generateChecklistPdf(checklist) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks = [];

  return new Promise(async (resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {

      const PRIMARY = '#1a56db';
      const DANGER = '#e02424';
      const SUCCESS = '#057a55';
      const WARNING = '#c27803';
      const GRAY = '#6b7280';
      const LIGHT_BG = '#f3f4f6';

      const pageWidth = doc.page.width - 80; // marginLeft=40, marginRight=40

      // ======= CABEÇALHO =======
      doc.rect(0, 0, doc.page.width, 90).fill(PRIMARY);

      doc.fontSize(20).fillColor('white').font('Helvetica-Bold')
        .text('CENOS', 40, 20, { continued: false });

      doc.fontSize(11).fillColor('white').font('Helvetica')
        .text('Checklist de Segurança', 40, 46);

      // Data e tipo no canto direito
      const dateLabel = checklist.date
        ? new Date(checklist.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '-';
      const typeLabel = checklist.type === 'official' ? 'Oficial' : 'Avulso';

      doc.fontSize(10).fillColor('white').font('Helvetica')
        .text(`Data: ${dateLabel}`, doc.page.width - 200, 25, { width: 160, align: 'right' })
        .text(`Tipo: ${typeLabel}`, doc.page.width - 200, 42, { width: 160, align: 'right' })
        .text(`ID: ${checklist.id ? checklist.id.slice(0, 8).toUpperCase() : '-'}`, doc.page.width - 200, 59, { width: 160, align: 'right' });

      doc.y = 105;

      // ======= DADOS DO AGENTE =======
      doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold')
        .text('Dados do Agente', 40, doc.y);

      doc.moveTo(40, doc.y + 2).lineTo(40 + pageWidth, doc.y + 2).strokeColor(PRIMARY).lineWidth(1.5).stroke();
      doc.y += 10;

      const agentName = checklist.agent ? checklist.agent.name || checklist.agent.id : checklist.agent_id || '-';
      const regional = checklist.regional_name || '-';
      const sectional = checklist.sectional_name || '-';

      doc.fontSize(10).font('Helvetica').fillColor('#374151');
      doc.text(`Agente: ${agentName}`, 40, doc.y, { continued: false });
      doc.text(`Regional: ${regional}  |  Seccional: ${sectional}`, 40, doc.y + 2);

      if (checklist.latitude && checklist.longitude) {
        doc.text(`Geolocalização: ${Number(checklist.latitude).toFixed(6)}, ${Number(checklist.longitude).toFixed(6)}`, 40, doc.y + 2);
      }

      doc.y += 16;

      // ======= RESUMO DE CONFORMIDADE =======
      if (checklist.compliance_summary) {
        const cs = checklist.compliance_summary;

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827')
          .text('Resumo de Conformidade', 40, doc.y);
        doc.moveTo(40, doc.y + 2).lineTo(40 + pageWidth, doc.y + 2).strokeColor(PRIMARY).lineWidth(1.5).stroke();
        doc.y += 10;

        const colW = pageWidth / 4;
        const summaryY = doc.y;

        const summaryItems = [
          { label: 'Total', value: cs.total, color: '#374151' },
          { label: 'Conforme', value: cs.compliant, color: SUCCESS },
          { label: 'Não Conforme', value: cs.non_compliant, color: DANGER },
          { label: 'Críticos', value: cs.critical_non_compliant, color: DANGER },
        ];

        summaryItems.forEach((item, idx) => {
          const x = 40 + idx * colW;
          doc.rect(x, summaryY, colW - 4, 52).fillAndStroke(LIGHT_BG, '#e5e7eb');
          doc.fontSize(22).font('Helvetica-Bold').fillColor(item.color)
            .text(String(item.value), x + 4, summaryY + 6, { width: colW - 8, align: 'center' });
          doc.fontSize(9).font('Helvetica').fillColor(GRAY)
            .text(item.label, x + 4, summaryY + 34, { width: colW - 8, align: 'center' });
        });

        doc.y = summaryY + 62;
      }

      // ======= RESPOSTAS POR SEÇÃO =======
      if (Array.isArray(checklist.answers) && checklist.answers.length > 0) {
        // Agrupar por seção
        const sectionMap = {};
        for (const ans of checklist.answers) {
          const sectionTitle = ans.section_title || 'Geral';
          if (!sectionMap[sectionTitle]) sectionMap[sectionTitle] = [];
          sectionMap[sectionTitle].push(ans);
        }

        for (const [sectionTitle, answers] of Object.entries(sectionMap)) {
          // Título da seção
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827')
            .text(sectionTitle, 40, doc.y + 8);
          doc.moveTo(40, doc.y + 2).lineTo(40 + pageWidth, doc.y + 2).strokeColor('#d1d5db').lineWidth(1).stroke();
          doc.y += 10;

          for (const ans of answers) {
            // Checar espaço na página
            if (doc.y > doc.page.height - 100) {
              doc.addPage();
              doc.y = 40;
            }

            const isCompliant = ans.is_compliant;
            const isExempt = ans.is_exempt;
            const severity = ans.severity;
            const questionType = ans.question_type || 'binary';

            // Determinar label do status
            let statusLabel = '—';
            let statusColor = GRAY;

            if (isExempt) {
              statusLabel = 'Isento';
              statusColor = WARNING;
            } else if (questionType === 'multiple_choice' && ans.answer_value && ans.options) {
              const opts = typeof ans.options === 'string' ? JSON.parse(ans.options) : ans.options;
              const selected = Array.isArray(opts) ? opts.find(o => String(o.value) === String(ans.answer_value)) : null;
              statusLabel = selected ? selected.label : ans.answer_value;
              statusColor = isCompliant === true ? SUCCESS : isCompliant === false ? DANGER : GRAY;
            } else if (questionType === 'rating' && ans.answer_value) {
              statusLabel = `${ans.answer_value}/${ans.options && typeof ans.options === 'object' && !Array.isArray(ans.options) ? (ans.options.max || 5) : 5}`;
              statusColor = isCompliant === true ? SUCCESS : isCompliant === false ? DANGER : GRAY;
            } else if (isCompliant === true) {
              statusLabel = 'Conforme';
              statusColor = SUCCESS;
            } else if (isCompliant === false) {
              statusLabel = 'Não Conforme';
              statusColor = DANGER;
            }

            let severityLabel = '';
            if (severity === 'critical') severityLabel = ' [CRÍTICO]';
            else if (severity === 'alert') severityLabel = ' [ALERTA]';
            else if (severity === 'normal') severityLabel = ' [NORMAL]';

            const rowY = doc.y;
            doc.rect(40, rowY, pageWidth, 24).fillAndStroke(
              isCompliant === false && !isExempt ? '#fef2f2' : isExempt ? '#fffbeb' : 'white',
              '#e5e7eb'
            );

            // Status badge
            doc.rect(40 + pageWidth - 80, rowY + 4, 76, 16).fill(statusColor);
            doc.fontSize(8).font('Helvetica-Bold').fillColor('white')
              .text(statusLabel, 40 + pageWidth - 80, rowY + 8, { width: 76, align: 'center' });

            // Label da pergunta
            const questionSuffix = isCompliant === false && severity && (questionType === 'binary' || !ans.answer_value) ? severityLabel : '';
            doc.fontSize(9).font('Helvetica').fillColor('#374151')
              .text(
                (ans.question_label || '-') + questionSuffix,
                44,
                rowY + 8,
                { width: pageWidth - 100, lineBreak: false }
              );

            doc.y = rowY + 28;
          }

          doc.y += 6;
        }
      } else {
        doc.fontSize(10).font('Helvetica').fillColor(GRAY)
          .text('Nenhuma resposta registrada neste checklist.', 40, doc.y + 8);
        doc.y += 24;
      }

      // ======= ASSINATURA E SELFIE =======
      const imgUrls = [];
      if (checklist.signature_url) imgUrls.push({ key: 'signature', url: checklist.signature_url, label: 'Assinatura do Agente' });
      if (checklist.selfie_url) imgUrls.push({ key: 'selfie', url: checklist.selfie_url, label: 'Selfie do Agente' });

      for (const item of imgUrls) {
        if (doc.y > doc.page.height - 180) doc.addPage();

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827')
          .text(item.label, 40, doc.y + 8);
        doc.moveTo(40, doc.y + 2).lineTo(40 + pageWidth, doc.y + 2).strokeColor(PRIMARY).lineWidth(1.5).stroke();
        doc.y += 10;

        try {
          const resp = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 10000 });
          const imgBuffer = Buffer.from(resp.data);
          const maxImgW = pageWidth;
          const maxImgH = 220;
          doc.image(imgBuffer, 40, doc.y, { fit: [maxImgW, maxImgH], align: 'center', valign: 'center' });
          doc.y += maxImgH + 10;
        } catch {
          doc.fontSize(9).font('Helvetica').fillColor(DANGER)
            .text('(Imagem não disponível)', 40, doc.y + 4);
          doc.y += 20;
        }
      }

      // ======= RODAPÉ =======
      if (doc.y > doc.page.height - 60) doc.addPage();

      const footerY = doc.page.height - 48;
      doc.moveTo(40, footerY).lineTo(40 + pageWidth, footerY).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.fontSize(8).font('Helvetica').fillColor(GRAY)
        .text(
          `Gerado automaticamente pelo sistema CENOS em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
          40,
          footerY + 8,
          { width: pageWidth, align: 'center' }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateChecklistPdf };
