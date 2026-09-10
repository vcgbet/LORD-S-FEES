const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, VerticalAlign,
} = require('docx');
const { FEE_ITEMS, FEE_KEYS } = require('./fees');
const { reportSummary } = require('./exportPdf');

const SCHOOL = "THE LORD'S GREAT ACADEMY";
const DARK = '123B2A';

function gh(n) {
  const v = Number(n) || 0;
  return 'GH\u00A2 ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d || '\u2014');
}
function stamp() { return new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 12); }

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align === 'center' ? AlignmentType.CENTER : opts.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after ?? 80 },
    children: [new TextRun({
      text: String(text ?? ''),
      bold: !!opts.bold,
      italics: !!opts.italics,
      size: opts.size || 22,
      color: opts.color,
      font: 'Calibri',
    })],
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align === 'right' ? AlignmentType.RIGHT : opts.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: 30, after: 30 },
      children: [new TextRun({
        text: String(text ?? ''),
        bold: !!opts.bold,
        size: opts.size || 18,
        color: opts.color,
        font: 'Calibri',
      })],
    })],
  });
}

const HEAD_W = [5, 12, 13, 8, 30, 8, 24];
const HEAD = ['#', 'Date', 'Dept', 'Class', 'Learner', 'Type', 'Total (GH\u00A2)'];

async function reportDocx(entries, meta, res) {
  const sum = reportSummary(entries);
  const parts = [];
  if (meta.from) parts.push('From ' + fmtDate(meta.from));
  if (meta.to) parts.push('To ' + fmtDate(meta.to));
  if (meta.department) parts.push('Department: ' + meta.department);
  if (meta.class) parts.push('Class: ' + meta.class);
  if (meta.batchId) parts.push('Batch #' + meta.batchId);

  const mainRows = [
    new TableRow({
      tableHeader: true,
      children: HEAD.map((h, i) => cell(h, { bold: true, fill: DARK, color: 'FFFFFF', width: HEAD_W[i], align: i === 6 ? 'right' : 'left' })),
    }),
  ];
  entries.forEach((e, i) => {
    mainRows.push(new TableRow({
      children: [
        cell(String(i + 1), { width: HEAD_W[0] }),
        cell(fmtDate(e.date_of_payment), { width: HEAD_W[1] }),
        cell(e.department, { width: HEAD_W[2] }),
        cell(e.class, { width: HEAD_W[3] }),
        cell(String(e.learner_name || '').toUpperCase(), { width: HEAD_W[4] }),
        cell(String(e.payment_type || '').toUpperCase() === 'PART' ? 'PART' : 'FULL', { width: HEAD_W[5] }),
        cell((Number(e.total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { width: HEAD_W[6], align: 'right' }),
      ],
    }));
  });
  mainRows.push(new TableRow({
    children: [
      cell('', {}), cell('', {}), cell('', {}), cell('', {}), cell('', {}),
      cell('GRAND TOTAL', { bold: true, width: HEAD_W[5], align: 'right' }),
      cell(sum.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { bold: true, width: HEAD_W[6], align: 'right', fill: 'EAF3EE' }),
    ],
  }));

  const feeRows = [
    new TableRow({
      tableHeader: true,
      children: [cell('Fee Category', { bold: true, fill: DARK, color: 'FFFFFF', width: 70 }), cell('Total (GH\u00A2)', { bold: true, fill: DARK, color: 'FFFFFF', width: 30, align: 'right' })],
    }),
  ];
  for (const f of FEE_ITEMS) {
    feeRows.push(new TableRow({
      children: [cell(f.label, { width: 70 }), cell((Number(sum.byFee[f.key]) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { width: 30, align: 'right' })],
    }));
  }
  feeRows.push(new TableRow({
    children: [cell('GRAND TOTAL', { bold: true, width: 70, fill: 'EAF3EE' }), cell(sum.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { bold: true, width: 30, align: 'right', fill: 'EAF3EE' })],
  }));

  const doc = new Document({
    creator: 'Lord\'s Great Academy Fees System',
    title: 'Fees Collection Report',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      properties: {},
      children: [
        p(SCHOOL, { bold: true, size: 32, align: 'center', after: 40 }),
        p('FEES COLLECTION REPORT', { bold: true, size: 26, align: 'center', after: 120 }),
        p(parts.length ? parts.join('    |    ') : 'All entries', { size: 20, align: 'center', color: '555555', after: 40 }),
        p('Generated: ' + new Date().toUTCString() + '     \u2022     Prepared by: ' + (meta.by || '\u2014'), { size: 20, align: 'center', color: '555555', after: 240 }),
        p(`Entries: ${entries.length}    \u2022    Full Payments: ${sum.full}    \u2022    Part Payments: ${sum.part}    \u2022    Total Collected: ${gh(sum.totalAmount)}`, { bold: true, size: 22, after: 200 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: mainRows }),
        p('', { after: 160 }),
        p('FEE BREAKDOWN (TOTALS ACROSS ALL ENTRIES)', { bold: true, size: 24, after: 120 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: feeRows }),
        p('', { after: 160 }),
        p(`GRAND TOTAL: ${gh(sum.totalAmount)}`, { bold: true, size: 26, align: 'right', after: 360 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: { bottom: { style: 'single', size: 6, color: '999999' } }, children: [p('Prepared By (Bursar)', { align: 'center', size: 18, color: '555555' })] }),
              new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: { bottom: { style: 'single', size: 6, color: '999999' } }, children: [p('Verified By (Administrator)', { align: 'center', size: 18, color: '555555' })] }),
            ],
          })],
        }),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="Fees-Collection-Report-${stamp()}.docx"`);
  res.send(buf);
}

module.exports = { reportDocx };
