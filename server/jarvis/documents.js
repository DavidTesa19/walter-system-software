// Turning an uploaded document into text Jarvis can read.
//
// Only text ever goes back to the model: a tool result stays in the
// conversation and is re-read on every later turn, so a whole PDF as a
// document block would be paid for again and again (and stored in the
// conversation row). Text formats are read directly, Office files are unzipped
// and their XML stripped, PDFs go through pdf.js; scans and photos, which have
// no text layer, are transcribed once by Claude.

import AdmZip from 'adm-zip';
import Anthropic from '@anthropic-ai/sdk';
import { extractText, getDocumentProxy } from 'unpdf';
import { recordAiUsage } from '../finance/usage.js';

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
// Same model as Jarvis unless set otherwise (a cheaper one is a fine choice:
// transcribing is not hard).
const OCR_MODEL = process.env.JARVIS_OCR_MODEL || process.env.JARVIS_MODEL || 'claude-opus-5-5';
// A scan longer than this is transcribed only in part.
const OCR_MAX_PAGES = 30;

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'log', 'eml', 'ics', 'vcf', 'yaml', 'yml']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export class DocumentTextError extends Error {}

const extensionOf = (filename) => String(filename ?? '').toLowerCase().split('.').pop() ?? '';

const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');

const tidy = (text) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Text files may be UTF-8 or the Windows Czech code page.
function decodeTextFile(buffer) {
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('windows-1250').decode(buffer);
  } catch {
    return utf8;
  }
}

function zipEntryText(zip, name) {
  const entry = zip.getEntry(name);
  return entry ? entry.getData().toString('utf8') : '';
}

// Word: paragraphs from word/document.xml (plus headers and footers).
function docxText(buffer) {
  const zip = new AdmZip(buffer);
  const parts = ['word/document.xml', ...zip.getEntries().map((entry) => entry.entryName).filter((name) => /^word\/(header|footer)\d*\.xml$/.test(name))];
  return parts
    .map((name) =>
      decodeEntities(
        zipEntryText(zip, name)
          .replace(/<w:tab\/>/g, '\t')
          .replace(/<w:br[^>]*\/>/g, '\n')
          // A table row on one line, its cells separated by " | ".
          .replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>')
          .replace(/<\/w:tc>\s*<\/w:tr>/g, '</w:tr>')
          .replace(/<\/w:tc>/g, ' | ')
          .replace(/<\/w:tr>/g, '\n')
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, '')
      )
    )
    .join('\n\n');
}

// Excel: every sheet as rows of semicolon-separated cells.
function xlsxText(buffer, maxRows = 2000) {
  const zip = new AdmZip(buffer);
  const shared = [...zipEntryText(zip, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeEntities([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
  );
  const workbook = zipEntryText(zip, 'xl/workbook.xml');
  const names = [...workbook.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((match) => decodeEntities(match[1]));
  const sheets = zip
    .getEntries()
    .map((entry) => entry.entryName)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));

  return sheets
    .map((name, index) => {
      const rows = [...zipEntryText(zip, name).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, maxRows).map((row) =>
        [...row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
          .map(([, attributes, body = '']) => {
            if (/t="s"/.test(attributes)) return shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])] ?? '';
            if (/t="inlineStr"/.test(attributes)) return decodeEntities([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
            return decodeEntities(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
          })
          .join(';')
          .replace(/;+$/, '')
      );
      return `## List: ${names[index] ?? `List ${index + 1}`}\n${rows.filter(Boolean).join('\n')}`;
    })
    .join('\n\n');
}

// PowerPoint: the text of each slide, in slide order.
function pptxText(buffer) {
  const zip = new AdmZip(buffer);
  return zip
    .getEntries()
    .map((entry) => entry.entryName)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]))
    .map((name, index) => {
      const paragraphs = [...zipEntryText(zip, name).matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
        .map((paragraph) => decodeEntities([...paragraph[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => t[1]).join('')))
        .filter(Boolean);
      return `## Snímek ${index + 1}\n${paragraphs.join('\n')}`;
    })
    .join('\n\n');
}

async function pdfText(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return {
    pages: totalPages,
    text: pages.map((page, index) => `[strana ${index + 1}]\n${String(page ?? '').trim()}`).join('\n\n'),
    letters: pages.join('').replace(/\s+/g, '').length,
  };
}

let anthropicClient = null;
const anthropic = () => {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
};

// A scan or a photo: Claude reads it once and writes the text out.
async function transcribe(block, signal) {
  const stream = anthropic().beta.messages.stream(
    {
      model: OCR_MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            block,
            {
              type: 'text',
              text:
                'Přepiš všechen čitelný text tohoto dokumentu tak, jak je napsaný, v původním jazyce. ' +
                'Zachovej pořadí a odstavce; tabulky piš jako řádky s buňkami oddělenými středníkem; ' +
                'u vícestránkového dokumentu označ začátek každé strany jako [strana N]. ' +
                'Obrázky bez textu popiš jednou krátkou větou v hranatých závorkách. Nic nepřidávej ani nevysvětluj.',
            },
          ],
        },
      ],
    },
    { signal }
  );
  const message = await stream.finalMessage();
  recordAiUsage({
    provider: 'anthropic',
    model: message.model ?? OCR_MODEL,
    feature: 'jarvis_ocr',
    input: message.usage?.input_tokens,
    output: message.usage?.output_tokens,
    cacheRead: message.usage?.cache_read_input_tokens,
    cacheWrite: message.usage?.cache_creation_input_tokens,
  });
  if (message.stop_reason === 'refusal') throw new DocumentTextError('Dokument se nepodařilo přečíst.');
  const text = message.content.filter((item) => item.type === 'text').map((item) => item.text).join('');
  return { text, truncated: message.stop_reason === 'max_tokens' };
}

/**
 * The text of one document.
 * Returns { text, method, pages?, note? }; throws DocumentTextError for files
 * that cannot be read (old .doc, archives, …).
 */
export async function documentText(buffer, { filename, mimeType, signal } = {}) {
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new DocumentTextError('Dokument je na přečtení příliš velký.');
  const extension = extensionOf(filename);
  const type = String(mimeType ?? '').toLowerCase();

  if (extension === 'pdf' || type === 'application/pdf') {
    const pdf = await pdfText(buffer);
    // A text layer worth reading: roughly a line or more per page.
    if (pdf.letters >= pdf.pages * 40) return { text: tidy(pdf.text), method: 'pdf', pages: pdf.pages };
    if (pdf.pages > OCR_MAX_PAGES) {
      throw new DocumentTextError(`Dokument je naskenovaný (bez textu) a má ${pdf.pages} stran; přečíst umím naskenované dokumenty do ${OCR_MAX_PAGES} stran.`);
    }
    const scan = await transcribe(
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
      signal
    );
    return {
      text: tidy(scan.text),
      method: 'ocr',
      pages: pdf.pages,
      note: `Naskenovaný dokument, text přepsán z obrázku – čísla a jména ověř.${scan.truncated ? ' Přepis je zkrácený.' : ''}`,
    };
  }

  if (IMAGE_TYPES[extension] || type.startsWith('image/')) {
    const mediaType = IMAGE_TYPES[extension] ?? type;
    if (!Object.values(IMAGE_TYPES).includes(mediaType)) throw new DocumentTextError('Tento formát obrázku neumím přečíst.');
    if (buffer.length > 5 * 1024 * 1024) throw new DocumentTextError('Obrázek je na přečtení příliš velký (víc než 5 MB).');
    const scan = await transcribe({ type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } }, signal);
    return { text: tidy(scan.text), method: 'ocr', note: 'Text přepsán z obrázku – čísla a jména ověř.' };
  }

  if (extension === 'docx' || type.includes('wordprocessingml')) return { text: tidy(docxText(buffer)), method: 'docx' };
  if (extension === 'xlsx' || type.includes('spreadsheetml')) return { text: tidy(xlsxText(buffer)), method: 'xlsx' };
  if (extension === 'pptx' || type.includes('presentationml')) return { text: tidy(pptxText(buffer)), method: 'pptx' };
  if (HTML_EXTENSIONS.has(extension) || type === 'text/html') {
    const html = decodeTextFile(buffer).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n');
    return { text: tidy(decodeEntities(html.replace(/<[^>]+>/g, ''))), method: 'html' };
  }
  if (TEXT_EXTENSIONS.has(extension) || type.startsWith('text/') || type === 'application/json') {
    return { text: tidy(decodeTextFile(buffer)), method: 'text' };
  }
  if (extension === 'doc' || extension === 'xls' || extension === 'ppt') {
    throw new DocumentTextError('Starý formát Office (.doc/.xls/.ppt) neumím přečíst – uložte ho jako .docx/.xlsx/.pptx nebo PDF.');
  }
  throw new DocumentTextError(`Soubory typu .${extension || '?'} neumím přečíst.`);
}
