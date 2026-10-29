// Files Jarvis makes for the user: Word, PDF and Excel. Jarvis writes the
// content as Markdown (headings, paragraphs, lists, tables, bold, links) or,
// for Excel, as sheets of rows; this module lays it out. Nothing is stored:
// the conversation keeps what was asked for, and each download renders the
// file again (a few milliseconds).
//
// PDFs use the Roboto font that ships with pdfmake (it has every Czech
// letter); pdfmake may read only those font files and never fetches URLs.

import { createRequire } from 'node:module';
import path from 'node:path';
import { marked } from 'marked';
import ExcelJS from 'exceljs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
const ROBOTO = require('pdfmake/fonts/Roboto.js');
const FONT_DIR = path.resolve(path.dirname(ROBOTO.Roboto.normal));
pdfmake.setFonts(ROBOTO);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((file) => path.resolve(file).startsWith(FONT_DIR));

export const DOCUMENT_FORMATS = {
  docx: { label: 'Word', extension: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { label: 'PDF', extension: 'pdf', type: 'application/pdf' },
  xlsx: { label: 'Excel', extension: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

export class DocumentError extends Error {}

// A file name people can recognise, without characters Windows refuses.
export function fileName(title, extension) {
  const base = String(title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'Dokument'}.${extension}`;
}

const today = () => new Date().toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'long', year: 'numeric' });

// ---------------------------------------------------------------------------
// Markdown → blocks (the same for Word and PDF)
// ---------------------------------------------------------------------------

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text) => String(text ?? '').replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]);
// Only web and mail links; anything else stays plain text.
const safeLink = (href) => (/^(https?:|mailto:)/i.test(String(href ?? '').trim()) ? String(href).trim() : undefined);

function inlineRuns(tokens = [], style = {}) {
  const runs = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'strong':
        runs.push(...inlineRuns(token.tokens, { ...style, bold: true }));
        break;
      case 'em':
        runs.push(...inlineRuns(token.tokens, { ...style, italic: true }));
        break;
      case 'del':
        runs.push(...inlineRuns(token.tokens, { ...style, strike: true }));
        break;
      case 'link': {
        const link = safeLink(token.href);
        runs.push(...inlineRuns(token.tokens, link ? { ...style, link } : style));
        break;
      }
      case 'codespan':
        runs.push({ ...style, text: decode(token.text), code: true });
        break;
      case 'br':
        runs.push({ ...style, text: '\n' });
        break;
      case 'text':
        if (token.tokens?.length) runs.push(...inlineRuns(token.tokens, style));
        else runs.push({ ...style, text: decode(token.text) });
        break;
      case 'html':
        runs.push({ ...style, text: decode(String(token.text).replace(/<[^>]*>/g, '')) });
        break;
      default:
        if (token.text) runs.push({ ...style, text: decode(token.text) });
    }
  }
  return runs.filter((run) => run.text);
}

const textRuns = (token) => inlineRuns(token.tokens?.length ? token.tokens : [{ type: 'text', text: token.text ?? '' }]);

function listBlock(token) {
  return {
    type: 'list',
    ordered: Boolean(token.ordered),
    items: token.items.map((item) => {
      const runs = [];
      const children = [];
      for (const part of item.tokens ?? []) {
        if (part.type === 'list') children.push(listBlock(part));
        else if (part.type === 'text' || part.type === 'paragraph') {
          if (runs.length) runs.push({ text: '\n' });
          runs.push(...textRuns(part));
        }
      }
      return { runs: item.task ? [{ text: item.checked ? '[x] ' : '[ ] ' }, ...runs] : runs, children };
    }),
  };
}

function toBlocks(tokens) {
  const blocks = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        blocks.push({ type: 'heading', level: Math.min(token.depth, 3), runs: textRuns(token) });
        break;
      case 'paragraph':
      case 'text':
        blocks.push({ type: 'paragraph', runs: textRuns(token) });
        break;
      case 'list':
        blocks.push(listBlock(token));
        break;
      case 'table':
        blocks.push({
          type: 'table',
          header: token.header.map((cell) => textRuns(cell)),
          rows: token.rows.map((row) => row.map((cell) => textRuns(cell))),
        });
        break;
      case 'code':
        blocks.push({ type: 'code', text: token.text });
        break;
      case 'blockquote':
        blocks.push({ type: 'quote', blocks: toBlocks(token.tokens ?? []) });
        break;
      case 'hr':
        blocks.push({ type: 'rule' });
        break;
      default:
      // Blank lines, link definitions, raw HTML blocks.
    }
  }
  return blocks;
}

export const markdownBlocks = (markdown) => toBlocks(marked.lexer(String(markdown ?? '')));

// Wide tables read better on a landscape page.
const isWide = (blocks) => blocks.some((block) => block.type === 'table' && block.header.length > 6);
const plain = (runs) => runs.map((run) => run.text).join('');

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function pdfRuns(runs) {
  return runs.map((run) => {
    const part = { text: run.text };
    if (run.bold) part.bold = true;
    if (run.italic) part.italics = true;
    if (run.strike) part.decoration = 'lineThrough';
    if (run.code) part.background = '#eef2f7';
    if (run.link) Object.assign(part, { link: run.link, color: '#1d4ed8', decoration: 'underline' });
    return part;
  });
}

function pdfBlock(block) {
  switch (block.type) {
    case 'heading':
      return { text: pdfRuns(block.runs), style: `h${block.level}` };
    case 'paragraph':
      return { text: pdfRuns(block.runs), style: 'body' };
    case 'list':
      return {
        [block.ordered ? 'ol' : 'ul']: block.items.map((item) =>
          item.children.length ? { stack: [{ text: pdfRuns(item.runs) }, ...item.children.map(pdfBlock)] } : { text: pdfRuns(item.runs) }
        ),
        style: 'list',
      };
    case 'table': {
      const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length));
      const pad = (cells) => Array.from({ length: columns }, (_, index) => cells[index] ?? []);
      return {
        table: {
          headerRows: 1,
          widths: Array(columns).fill('*'),
          body: [
            pad(block.header).map((cell) => ({ text: pdfRuns(cell), style: 'tableHeader' })),
            ...block.rows.map((row) => pad(row).map((cell) => ({ text: pdfRuns(cell), style: 'tableCell' }))),
          ],
        },
        layout: {
          fillColor: (row) => (row === 0 ? '#e8eef7' : null),
          hLineColor: () => '#cbd5e1',
          vLineColor: () => '#e2e8f0',
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        style: 'table',
      };
    }
    case 'code':
      return { text: block.text, style: 'code' };
    case 'quote':
      return { stack: block.blocks.map(pdfBlock), style: 'quote' };
    case 'rule':
      return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }], margin: [0, 8, 0, 8] };
    default:
      return { text: '' };
  }
}

async function renderPdf({ title, content }) {
  const blocks = markdownBlocks(content);
  const definition = {
    info: { title, author: 'Walter System – Jarvis', creator: 'Walter System' },
    pageSize: 'A4',
    pageOrientation: isWide(blocks) ? 'landscape' : 'portrait',
    pageMargins: [50, 54, 50, 54],
    content: [{ text: title, style: 'title' }, { text: today(), style: 'subtitle' }, ...blocks.map(pdfBlock)],
    footer: (page, pages) => ({
      columns: [
        { text: 'Walter System', style: 'footer' },
        { text: `${page} / ${pages}`, style: 'footer', alignment: 'right' },
      ],
      margin: [50, 18, 50, 0],
    }),
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.25, color: '#1e293b' },
    styles: {
      title: { fontSize: 20, bold: true, color: '#0f172a', margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 9.5, color: '#64748b', margin: [0, 0, 0, 14] },
      h1: { fontSize: 15, bold: true, color: '#0f172a', margin: [0, 12, 0, 5] },
      h2: { fontSize: 12.5, bold: true, color: '#0f172a', margin: [0, 10, 0, 4] },
      h3: { fontSize: 11, bold: true, color: '#334155', margin: [0, 8, 0, 3] },
      body: { margin: [0, 0, 0, 6] },
      list: { margin: [0, 0, 0, 6] },
      table: { margin: [0, 4, 0, 10], fontSize: 9.5 },
      tableHeader: { bold: true, color: '#0f172a' },
      tableCell: {},
      code: { fontSize: 9, background: '#eef2f7', margin: [0, 2, 0, 8] },
      quote: { italics: true, color: '#475569', margin: [14, 2, 0, 8] },
      footer: { fontSize: 8.5, color: '#94a3b8' },
    },
  };
  return pdfmake.createPdf(definition).getBuffer();
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

function docxRuns(runs, base = {}) {
  return runs.flatMap((run) => {
    // A line break inside a paragraph is a break before the next part.
    const parts = String(run.text).split('\n');
    const pieces = parts.map(
      (text, index) =>
        new TextRun({
          text,
          ...(index > 0 ? { break: 1 } : {}),
          ...base,
          ...(run.bold ? { bold: true } : {}),
          ...(run.italic ? { italics: true } : {}),
          ...(run.strike ? { strike: true } : {}),
          ...(run.code ? { font: 'Consolas' } : {}),
          ...(run.link ? { style: 'Hyperlink' } : {}),
        })
    );
    return run.link ? [new ExternalHyperlink({ link: run.link, children: pieces })] : pieces;
  });
}

const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };

function docxBlocks(blocks, state, level = 0) {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case 'heading':
        return [new Paragraph({ heading: HEADINGS[block.level], children: docxRuns(block.runs) })];
      case 'paragraph':
        return [new Paragraph({ children: docxRuns(block.runs), spacing: { after: 120 } })];
      case 'list': {
        // Each numbered list counts from 1 again.
        const instance = block.ordered ? (state.lists += 1) : undefined;
        return block.items.flatMap((item) => [
          new Paragraph({
            children: docxRuns(item.runs),
            ...(block.ordered ? { numbering: { reference: 'jarvis-numbers', level: Math.min(level, 2), instance } } : { bullet: { level: Math.min(level, 2) } }),
          }),
          ...item.children.flatMap((child) => docxBlocks([child], state, level + 1)),
        ]);
      }
      case 'table': {
        const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length));
        const pad = (cells) => Array.from({ length: columns }, (_, index) => cells[index] ?? []);
        const cell = (runs, header) =>
          new TableCell({
            children: [new Paragraph({ children: docxRuns(runs, header ? { bold: true } : {}) })],
            ...(header ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E8EEF7' } } : {}),
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          });
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ tableHeader: true, children: pad(block.header).map((runs) => cell(runs, true)) }),
              ...block.rows.map((row) => new TableRow({ children: pad(row).map((runs) => cell(runs, false)) })),
            ],
          }),
          new Paragraph({ children: [] }),
        ];
      }
      case 'code':
        return [
          new Paragraph({
            children: docxRuns([{ text: block.text, code: true }]),
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF2F7' },
          }),
        ];
      case 'quote':
        // Quoted paragraphs indented and in italics; anything else as it is.
        return block.blocks.flatMap((inner) =>
          inner.type === 'paragraph'
            ? [new Paragraph({ children: docxRuns(inner.runs, { italics: true, color: '475569' }), indent: { left: 567 }, spacing: { after: 120 } })]
            : docxBlocks([inner], state, level)
        );
      case 'rule':
        return [new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 1 } } })];
      default:
        return [];
    }
  });
}

async function renderDocx({ title, content }) {
  const blocks = markdownBlocks(content);
  const document = new Document({
    creator: 'Walter System – Jarvis',
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [
        {
          reference: 'jarvis-numbers',
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: isWide(blocks) ? { page: { size: { orientation: PageOrientation.LANDSCAPE } } } : {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ children: ['Walter System · ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, color: '94A3B8' })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
          new Paragraph({ children: [new TextRun({ text: today(), color: '64748B', size: 20 })], spacing: { after: 240 } }),
          ...docxBlocks(blocks, { lists: 0 }),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

// Sheet names: at most 31 characters, none of []:*?/\, unique.
function sheetNames(names) {
  const used = new Set();
  return names.map((name, index) => {
    const base = String(name ?? '').replace(/[[\]:*?/\\]+/g, ' ').trim().slice(0, 31) || `List ${index + 1}`;
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base.slice(0, 27)} (${n})`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

// Numbers stay numbers; everything else is text (a leading "=" is never a formula).
const cellValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
};

async function renderXlsx({ title, sheets }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Walter System – Jarvis';
  workbook.title = title;
  workbook.created = new Date();
  const names = sheetNames(sheets.map((sheet) => sheet.name));
  sheets.forEach((sheet, index) => {
    const worksheet = workbook.addWorksheet(names[index], { views: [{ state: 'frozen', ySplit: 1 }] });
    const columns = sheet.columns.length;
    worksheet.addRow(sheet.columns.map(String));
    for (const row of sheet.rows) worksheet.addRow(Array.from({ length: columns }, (_, column) => cellValue(row[column])));
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FF0F172A' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    header.alignment = { vertical: 'middle' };
    if (columns > 0) worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns } };
    // Wide enough for the longest value, within reason.
    for (let column = 1; column <= columns; column += 1) {
      let longest = 0;
      worksheet.getColumn(column).eachCell({ includeEmpty: false }, (cell) => {
        longest = Math.max(longest, ...String(cell.value ?? '').split('\n').map((line) => line.length));
      });
      worksheet.getColumn(column).width = Math.min(60, Math.max(8, longest + 2));
    }
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// The tables of a Markdown text as sheets, for an Excel file asked for in prose.
export function tablesAsSheets(markdown, title) {
  const tables = [];
  let heading = null;
  for (const block of markdownBlocks(markdown)) {
    if (block.type === 'heading') heading = plain(block.runs);
    if (block.type === 'table') {
      tables.push({ name: heading ?? title, columns: block.header.map(plain), rows: block.rows.map((row) => row.map(plain)) });
    }
  }
  return tables;
}

/**
 * Renders one document. `spec` is what Jarvis asked for: { format, title,
 * content } for Word and PDF, { format: 'xlsx', title, sheets } for Excel.
 * Returns { buffer, filename, type }.
 */
export async function renderDocument(spec) {
  const format = DOCUMENT_FORMATS[spec.format];
  if (!format) throw new DocumentError(`Neznámý formát ${spec.format}.`);
  let buffer;
  if (spec.format === 'xlsx') {
    const sheets = spec.sheets?.length ? spec.sheets : tablesAsSheets(spec.content ?? '', spec.title);
    if (!sheets.length) throw new DocumentError('Excel potřebuje aspoň jednu tabulku (sheets, nebo tabulku v content).');
    buffer = await renderXlsx({ title: spec.title, sheets });
  } else {
    if (!String(spec.content ?? '').trim()) throw new DocumentError('Dokument nemá žádný obsah.');
    buffer = spec.format === 'pdf' ? await renderPdf(spec) : await renderDocx(spec);
  }
  return { buffer, filename: fileName(spec.filename || spec.title, format.extension), type: format.type };
}
