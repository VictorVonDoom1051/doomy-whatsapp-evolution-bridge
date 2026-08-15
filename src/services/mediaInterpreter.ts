import axios from 'axios';
import pdf from 'pdf-parse';
import { config } from '../config.js';
import { downloadMediaMessage } from './evolutionApi.js';

export type MediaInterpretation =
  | { kind: 'document'; enrichedMessage: string }
  | { kind: 'image'; response: string };

export async function interpretMedia(raw: any, request: string): Promise<MediaInterpretation> {
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
    return {
      kind: 'document',
      enrichedMessage: buildPdfPrompt(request, extracted, media.fileName)
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
