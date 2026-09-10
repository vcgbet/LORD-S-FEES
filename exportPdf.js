const PDFDocument = require('pdfkit');
const { FEE_ITEMS, FEE_KEYS } = require('./fees');

const SCHOOL = "THE LORD'S GREAT ACADEMY";
const M = 50;                 // page margin
const PW = 595.28;            // A4 width
const PH = 841.89;            // A4 height

function gh(n) {
  const v = Number(n) || 0;
  return 'GH\u00A2 ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d || '\u2014');
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function stamp() { return new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 12); }
function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }
function money(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ */
/* Single-entry receipt (matches the paper fees collection form)       */
/* ------------------------------------------------------------------ */
function receiptPdf(entry, res) {
  const doc = new PDFDocument({ size: 'A4', margin: M });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Fees-Receipt-${entry.id}-${entry.date_of_payment || todayStr()}.pdf"`);
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(18).text(SCHOOL, M, 52, { align: 'center', width: PW - 2 * M });
  doc.fontSize(13).text('FEES COLLECTION', M, doc.y + 4, { align: 'center', width: PW - 2 * M });
  doc.font('Helvetica').fontSize(9).text('P.O. Box 246, Kumasi \u2013 Ghana', M, doc.y + 4, { align: 'center', width: PW - 2 * M });
  doc.moveDown(0.8);
  doc.moveTo(M, doc.y).lineTo(PW - M, doc.y).stroke();

  let y = doc.y + 10;
  const row = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(10).text(label, M, y, { width: 230, lineBreak: false });
    doc.font('Helvetica').text(truncate(value ?? '\u2014', 48), M + 230, y, { width: PW - 2 * M - 230, lineBreak: false });
    y += 18;
  };
  row('DEPARTMENT:', entry.department);
  row('CLASS:', entry.class);
  row('NAME OF LEARNER:', entry.learner_name);
  const batchDesc = entry.batch_photo
    ? (entry.batch_file_name ? 'Photo + File: ' + entry.batch_file_name : 'Photo attached')
    : (entry.batch_file_name ? 'File: ' + entry.batch_file_name : '\u2014');
  row('BATCH LEARNER UPLOAD:', batchDesc);
  row('DATE OF PAYMENT:', fmtDate(entry.date_of_payment));
  y += 6;

  const isPart = String(entry.payment_type || '').toUpperCase().startsWith('P');
  doc.font('Helvetica-Bold').fontSize(10).text('PAYMENT TYPE:', M, y, { lineBreak: false });
  doc.font('Helvetica').text(
    `[X] ${isPart ? 'PART PAYMENT' : 'FULL PAYMENT'}      [ ] ${isPart ? 'FULL PAYMENT' : 'PART PAYMENT'}`,
    M + 230, y, { lineBreak: false });
  y += 24;

  doc.font('Helvetica-Bold').fontSize(11).text('FEES:', M, y);
  y += 18;
  for (const f of FEE_ITEMS) {
    doc.font('Helvetica').fontSize(10).text(f.label, M + 10, y, { lineBreak: false });
    doc.text(gh(entry[f.key]), M + 320, y, { width: PW - M - (M + 320), align: 'right', lineBreak: false });
    y += 16;
  }
  doc.moveTo(M, y - 4).lineTo(PW - M, y - 4).stroke();
  y += 6;
  doc.font('Helvetica-Bold').fontSize(12).text('TOTAL AMOUNT', M + 10, y, { lineBreak: false });
  doc.text(gh(entry.total), M + 320, y, { width: PW - M - (M + 320), align: 'right', lineBreak: false });
  y += 26;

  if (entry.notes) {
    doc.font('Helvetica-Oblique').fontSize(9).text('Notes: ' + entry.notes, M, y, { width: PW - 2 * M });
    y += 22;
  }

  const sigY = Math.max(y + 16, PH - 110);
  doc.font('Helvetica').fontSize(9);
  doc.moveTo(M, sigY).lineTo(M + 185, sigY).stroke();
  doc.text('Collected By (Bursar)', M, sigY + 5, { width: 185, align: 'center' });
  doc.moveTo(PW - M - 185, sigY).lineTo(PW - M, sigY).stroke();
  doc.text('Received By (Parent/Guardian)', PW - M - 185, sigY + 5, { width: 185, align: 'center' });

  if (entry.batch_photo && String(entry.batch_photo).startsWith('data:image/')) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text('BATCH LEARNER UPLOAD \u2014 PHOTO', M, M);
    doc.font('Helvetica').fontSize(8).text(`Entry #${entry.id} \u2022 ${entry.learner_name} \u2022 ${entry.department} / ${entry.class}`, M, doc.y + 4);
    const b64 = String(entry.batch_photo).split(',')[1];
    try {
      doc.image(Buffer.from(b64, 'base64'), M, M + 40, { fit: [PW - 2 * M, PH - 2 * M - 60], align: 'center' });
    } catch (e) {
      doc.font('Helvetica').fontSize(9).text('(photo could not be embedded)', M, M + 40);
    }
  }
  doc.end();
}

/* ------------------------------------------------------------------ */
/* Multi-entry report (table + fee breakdown + grand total)            */
/* ------------------------------------------------------------------ */
function reportSummary(entries) {
  const totalAmount = entries.reduce((s, e) => s + (Number(e.total) || 0), 0);
  const full = entries.filter((e) => String(e.payment_type || '').toUpperCase().startsWith('F')).length;
  const byFee = {};
  for (const k of FEE_KEYS) byFee[k] = entries.reduce((s, e) => s + (Number(e[k]) || 0), 0);
  return { totalAmount, full, part: entries.length - full, byFee };
}

function reportHeader(doc, meta) {
  doc.font('Helvetica-Bold').fontSize(16).text(SCHOOL, M, M, { align: 'center', width: PW - 2 * M });
  doc.fontSize(13).text('FEES COLLECTION REPORT', M, doc.y + 4, { align: 'center', width: PW - 2 * M });
  const parts = [];
  if (meta.from) parts.push('From ' + fmtDate(meta.from));
  if (meta.to) parts.push('To ' + fmtDate(meta.to));
  if (meta.department) parts.push('Department: ' + meta.department);
  if (meta.class) parts.push('Class: ' + meta.class);
  if (meta.batchId) parts.push('Batch #' + meta.batchId);
  doc.font('Helvetica').fontSize(9);
  doc.text(
    (parts.length ? parts.join('   |   ') + '   |   ' : '') +
    'Generated: ' + new Date().toUTCString() + '   |   Prepared by: ' + (meta.by || '\u2014'),
    M, doc.y + 4, { align: 'center', width: PW - 2 * M });
  doc.moveDown(0.6);
  doc.moveTo(M, doc.y).lineTo(PW - M, doc.y).stroke();
}

const REPORT_COLS = [
  { label: '#',           x: M + 2,      w: 20,  align: 'left' },
  { label: 'Date',        x: M + 26,     w: 58,  align: 'left' },
  { label: 'Dept',        x: M + 88,     w: 66,  align: 'left' },
  { label: 'Class',       x: M + 158,    w: 40,  align: 'left' },
  { label: 'Learner',     x: M + 202,    w: 150, align: 'left' },
  { label: 'Type',        x: M + 356,    w: 34,  align: 'left' },
  { label: 'Total (GH\u00A2)', x: PW - M - 2 - 92, w: 92, align: 'right' },
];
const ROW_H = 19;

function reportTableHeader(doc, y) {
  doc.rect(M, y - 12, PW - 2 * M, ROW_H).fill('#123b2a');
  doc.fillColor('#ffffff');
  doc.font('Helvetica-Bold').fontSize(8);
  for (const c of REPORT_COLS) {
    doc.text(c.label, c.x + 2, y - 7, { width: c.w, align: c.align, lineBreak: false });
  }
  doc.fillColor('#000000');
}

function reportPdf(entries, meta, res) {
  const doc = new PDFDocument({ size: 'A4', margin: M });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Fees-Collection-Report-${stamp()}.pdf"`);
  doc.pipe(res);

  reportHeader(doc, meta || {});
  const sum = reportSummary(entries);
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(
    `Entries: ${entries.length}      Full Payments: ${sum.full}      Part Payments: ${sum.part}      Total Collected: ${gh(sum.totalAmount)}`,
    M, doc.y + 10, { width: PW - 2 * M });
  doc.moveDown(1);

  if (!entries.length) {
    doc.font('Helvetica').fontSize(10).text('No entries match the selected filters.', M, doc.y);
    doc.end();
    return;
  }

  let y = doc.y + 8;
  reportTableHeader(doc, y);
  y += ROW_H;
  entries.forEach((e, i) => {
    if (y + ROW_H > PH - 60) { doc.addPage(); y = M + 10; reportTableHeader(doc, y); y += ROW_H; }
    doc.font('Helvetica').fontSize(8).fillColor('#000000');
    const vals = [
      String(i + 1), fmtDate(e.date_of_payment), e.department, e.class,
      String(e.learner_name || '').toUpperCase(), String(e.payment_type || '').slice(0, 4).toUpperCase(),
      money(e.total),
    ];
    REPORT_COLS.forEach((c, j) => {
      doc.text(truncate(vals[j], c.label === 'Learner' ? 28 : 20), c.x + 2, y - 7, { width: c.w, align: c.align, lineBreak: false });
    });
    doc.moveTo(M, y).lineTo(PW - M, y).strokeColor('#dddddd').lineWidth(0.5).stroke();
    y += ROW_H;
  });

  // Fee breakdown
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text('FEE BREAKDOWN (TOTALS ACROSS ALL ENTRIES)', M, M);
  let fy = doc.y + 12;
  doc.moveTo(M, fy - 10).lineTo(PW - M, fy - 10).stroke();
  for (const f of FEE_ITEMS) {
    if (fy > PH - 60) { doc.addPage(); fy = M + 10; }
    doc.font('Helvetica').fontSize(10).text(f.label, M + 6, fy);
    doc.text(gh(sum.byFee[f.key]), PW - M - 140, fy, { width: 135, align: 'right' });
    fy += 17;
  }
  doc.moveTo(M, fy - 6).lineTo(PW - M, fy - 6).stroke();
  fy += 8;
  doc.font('Helvetica-Bold').fontSize(12).text('GRAND TOTAL', M + 6, fy);
  doc.text(gh(sum.totalAmount), PW - M - 140, fy, { width: 135, align: 'right' });
  fy += 46;

  doc.font('Helvetica').fontSize(9);
  doc.moveTo(M, fy).lineTo(M + 185, fy).stroke();
  doc.text('Prepared By (Bursar)', M, fy + 5, { width: 185, align: 'center' });
  doc.moveTo(PW - M - 185, fy).lineTo(PW - M, fy).stroke();
  doc.text('Verified By (Administrator)', PW - M - 185, fy + 5, { width: 185, align: 'center' });

  doc.end();
}

module.exports = { receiptPdf, reportPdf, reportSummary, SCHOOL };
