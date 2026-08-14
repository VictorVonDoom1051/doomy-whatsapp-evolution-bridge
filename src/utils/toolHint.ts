export function detectToolHint(text: string): string | null {
  const t = text.toLowerCase();
  if (/(inventario|stock|existencia)/.test(t)) return 'inventario';
  if (/(cotiza|cotización|cotizacion|presupuesto)/.test(t)) return 'cotizaciones';
  if (/(agenda|cita|visita|calendario)/.test(t)) return 'agenda';
  if (/(cliente|crm|contacto)/.test(t)) return 'crm';
  if (/(pdf)/.test(t)) return 'pdf';
  if (/(excel|xlsx|reporte)/.test(t)) return 'excel';
  return null;
}
