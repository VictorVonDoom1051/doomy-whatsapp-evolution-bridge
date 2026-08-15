import axios from 'axios';
import pdf from 'pdf-parse';
import * as XLSX from 'xlsx-js-style';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { downloadMediaMessage } from './evolutionApi.js';

export type MediaInterpretation =
  | { kind: 'document'; enrichedMessage: string }
  | { kind: 'image'; response: string }
  | { kind: 'storedSpreadsheet'; response: string }
  | { kind: 'comparison'; response: string; base64: string; fileName: string };

export async function interpretMedia(raw: any, request: string, conversationId: string): Promise<MediaInterpretation> {
  const media = await downloadMediaMessage(raw);
  const bytes = Buffer.from(media.base64, 'base64');
  if (!bytes.length) throw new Error('El adjunto llegó vacío.');
  if (bytes.length > config.mediaMaxBytes) {
    throw new Error(`El archivo supera el límite de ${formatMb(config.mediaMaxBytes)} MB.`);
  }

  if (media.mimeType === 'application/pdf' || media.fileName?.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdf(bytes);
    const extracted = normalizePdfText(parsed.text || '');
    if (!extracted) throw new Error('No pude extraer texto del PDF; probablemente está escaneado como imagen.');
    const pending = await loadPendingSpreadsheet(conversationId);
    if (pending) {
      return compareSpreadsheetWithPdf(pending, extracted, media.fileName);
    }
    return {
      kind: 'document',
      enrichedMessage: buildPdfPrompt(request, extracted, media.fileName)
    };
  }

  if (isSpreadsheet(media.mimeType, media.fileName)) {
    const pending = await storeSpreadsheet(conversationId, bytes, media.fileName);
    return {
      kind: 'storedSpreadsheet',
      response: `Guardé ${pending.fileName} y detecté ${pending.folios.length} folio${pending.folios.length === 1 ? '' : 's'}. Ahora envía el PDF y dime que lo compare con el Excel. ✅`
    };
  }

  if (media.mimeType.startsWith('text/')) {
    const text = bytes.toString('utf8').slice(0, config.pdfMaxCharacters);
    return {
      kind: 'document',
      enrichedMessage: `${request}\n\n<documento_adjunto nombre="${safeName(media.fileName)}">\n${text}\n</documento_adjunto>`
    };
  }

  if (media.mimeType.startsWith('image/')) {
    return { kind: 'image', response: await analyzeImage(media.base64, media.mimeType, request) };
  }

  throw new Error(`Todavía no puedo interpretar archivos ${media.mimeType}. Por ahora acepta imágenes, PDF y texto.`);
}

export interface FolioCell { sheet: string; row: number; column: number; value: string; headerRow: number }
export interface PendingSpreadsheet { fileName: string; storedAt: string; workbookBase64: string; folios: FolioCell[] }

async function storeSpreadsheet(conversationId: string, bytes: Buffer, fileName?: string): Promise<PendingSpreadsheet> {
  const workbook = XLSX.read(bytes, { type: 'buffer', cellStyles: true });
  const folios = findWorkbookFolios(workbook);
  if (!folios.length) throw new Error('No encontré una columna o valores con formato de folio en el Excel.');
  const pending: PendingSpreadsheet = {
    fileName: safeSpreadsheetName(fileName),
    storedAt: new Date().toISOString(),
    workbookBase64: bytes.toString('base64'),
    folios
  };
  await mkdir(config.comparisonDataPath, { recursive: true });
  await writeFile(comparisonPath(conversationId), JSON.stringify(pending), 'utf8');
  return pending;
}

async function loadPendingSpreadsheet(conversationId: string): Promise<PendingSpreadsheet | null> {
  const filePath = comparisonPath(conversationId);
  try {
    const info = await stat(filePath);
    if (Date.now() - info.mtimeMs > config.comparisonTtlHours * 3_600_000) return null;
    return JSON.parse(await readFile(filePath, 'utf8')) as PendingSpreadsheet;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

export function compareSpreadsheetWithPdf(pending: PendingSpreadsheet, pdfText: string, pdfName?: string): MediaInterpretation {
  const workbook = XLSX.read(Buffer.from(pending.workbookBase64, 'base64'), { type: 'buffer', cellStyles: true });
  const searchablePdf = normalizeForSearch(pdfText);
  let found = 0;
  const bySheet = new Map<string, FolioCell[]>();
  for (const item of pending.folios) bySheet.set(item.sheet, [...(bySheet.get(item.sheet) || []), item]);

  for (const [sheetName, cells] of bySheet) {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const resultColumn = range.e.c + 1;
    const headerRow = Math.min(...cells.map(cell => cell.headerRow));
    const headerAddress = XLSX.utils.encode_cell({ r: headerRow, c: resultColumn });
    sheet[headerAddress] = {
      t: 's', v: 'Encontrado en PDF',
      s: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '548235' } }, alignment: { horizontal: 'center' } }
    };
    for (const cell of cells) {
      const yes = searchablePdf.includes(normalizeForSearch(cell.value));
      if (yes) found++;
      const address = XLSX.utils.encode_cell({ r: cell.row, c: resultColumn });
      sheet[address] = {
        t: 's', v: yes ? 'SÍ' : 'NO',
        s: yes
          ? { font: { bold: true, color: { rgb: '006100' } }, fill: { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } }, alignment: { horizontal: 'center' } }
          : { font: { bold: true, color: { rgb: '9C0006' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } }, alignment: { horizontal: 'center' } }
      };
    }
    range.e.c = resultColumn;
    sheet['!ref'] = XLSX.utils.encode_range(range);
    const widths = sheet['!cols'] || [];
    widths[resultColumn] = { wch: 20 };
    sheet['!cols'] = widths;
  }

  const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) as Buffer;
  const missing = pending.folios.length - found;
  const outputName = `comparacion_${path.parse(pending.fileName).name}.xlsx`;
  return {
    kind: 'comparison',
    response: `Comparación terminada contra ${safeName(pdfName)}: ${found} encontrados y ${missing} no encontrados. Te envío el Excel marcado; verde significa SÍ y rojo significa NO.`,
    base64: output.toString('base64'),
    fileName: outputName
  };
}

export function findWorkbookFolios(workbook: XLSX.WorkBook): FolioCell[] {
  const results: FolioCell[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const folioHeaders: Array<{ row: number; column: number }> = [];
    for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 20); row++) {
      for (let column = range.s.c; column <= range.e.c; column++) {
        const value = cellString(sheet, row, column);
        if (/\bfolio(?:s)?\b/i.test(value)) folioHeaders.push({ row, column });
      }
    }
    if (folioHeaders.length) {
      for (const header of folioHeaders) {
        for (let row = header.row + 1; row <= range.e.r; row++) {
          const value = cellString(sheet, row, header.column);
          if (isFolioValue(value, true)) results.push({ sheet: sheetName, row, column: header.column, value, headerRow: header.row });
        }
      }
      continue;
    }
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let column = range.s.c; column <= range.e.c; column++) {
        const value = cellString(sheet, row, column);
        if (isFolioValue(value, false)) results.push({ sheet: sheetName, row, column, value, headerRow: range.s.r });
      }
    }
  }
  return results.slice(0, 5000);
}

function cellString(sheet: XLSX.WorkSheet, row: number, column: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
  return cell?.v === undefined || cell?.v === null ? '' : String(cell.v).trim();
}

function isFolioValue(value: string, fromFolioColumn: boolean): boolean {
  if (!value || /^folio(?:s)?$/i.test(value)) return false;
  if (fromFolioColumn) return value.length >= 3 && value.length <= 120;
  return /^(?=.*\d)[A-ZÁÉÍÓÚÑ0-9_-]{5,}$/i.test(value);
}

function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toUpperCase();
}

function comparisonPath(conversationId: string): string {
  const id = createHash('sha256').update(conversationId).digest('hex').slice(0, 24);
  return path.join(config.comparisonDataPath, `${id}.json`);
}

function isSpreadsheet(mimeType: string, fileName?: string): boolean {
  return /spreadsheet|excel|sheet/i.test(mimeType) || /\.(xlsx|xls)$/i.test(fileName || '');
}

function safeSpreadsheetName(value?: string): string {
  const clean = safeName(value || 'folios.xlsx');
  return /\.xlsx?$/i.test(clean) ? clean : `${clean}.xlsx`;
}

export function buildPdfPrompt(request: string, fullText: string, fileName?: string): string {
  const folios = extractRequestedFolios(request);
  if (folios.length) {
    const normalized = fullText.toLowerCase();
    const results = folios.map(folio => `${folio}: ${normalized.includes(folio.toLowerCase()) ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
    const excerpts = folios.flatMap(folio => findExcerpts(fullText, folio));
    return [
      request,
      '',
      `<resultado_busqueda_pdf nombre="${safeName(fileName)}">`,
      ...results,
      excerpts.length ? '\nExtractos donde hubo coincidencia:\n' + excerpts.join('\n---\n') : '',
      '</resultado_busqueda_pdf>',
      'Responde usando estos resultados verificados; no inventes coincidencias.'
    ].filter(Boolean).join('\n');
  }
  const clipped = fullText.slice(0, config.pdfMaxCharacters);
  return `${request}\n\n<documento_pdf nombre="${safeName(fileName)}"${clipped.length < fullText.length ? ' truncado="true"' : ''}>\n${clipped}\n</documento_pdf>`;
}

export function extractRequestedFolios(request: string): string[] {
  const candidates = request.match(/\b(?=[A-ZÁÉÍÓÚÑ0-9_-]*\d)[A-ZÁÉÍÓÚÑ0-9_-]{5,}\b/gi) || [];
  return [...new Set(candidates.filter(value => !/^\d+(?:minutos?|horas?|dias?|días?|meses?)$/i.test(value)))].slice(0, 50);
}

async function analyzeImage(base64: string, mimeType: string, request: string): Promise<string> {
  if (!config.anthropic.apiKey) {
    throw new Error('Falta configurar ANTHROPIC_API_KEY en el servicio del bridge para activar visión.');
  }
  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: config.anthropic.model,
    max_tokens: 1200,
    system: 'Eres Doomy, asistente de VonverIA. Analiza la imagen con precisión. Responde en español mexicano, breve y directo. No inventes texto, modelos, folios ni detalles que no sean legibles.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: request || 'Describe y analiza esta imagen.' }
      ]
    }]
  }, {
    timeout: 60000,
    headers: {
      'x-api-key': config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });
  const text = response.data?.content?.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n').trim();
  if (!text) throw new Error('Claude no devolvió una interpretación de la imagen.');
  return text;
}

function findExcerpts(text: string, folio: string): string[] {
  const lower = text.toLowerCase();
  const needle = folio.toLowerCase();
  const excerpts: string[] = [];
  let index = 0;
  while ((index = lower.indexOf(needle, index)) !== -1 && excerpts.length < 3) {
    excerpts.push(text.slice(Math.max(0, index - 120), Math.min(text.length, index + needle.length + 120)).trim());
    index += needle.length;
  }
  return excerpts;
}

function normalizePdfText(value: string): string {
  return value.replace(/\0/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function safeName(value?: string): string {
  return (value || 'archivo').replace(/[<>"']/g, '').slice(0, 120);
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0);
}
