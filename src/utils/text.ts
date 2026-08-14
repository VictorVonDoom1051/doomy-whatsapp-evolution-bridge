export function splitMessage(text: string, max = 3500): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let current = text;
  while (current.length > max) {
    const cut = current.lastIndexOf('\n', max) > 500 ? current.lastIndexOf('\n', max) : max;
    parts.push(current.slice(0, cut));
    current = current.slice(cut).trim();
  }
  if (current) parts.push(current);
  return parts;
}
