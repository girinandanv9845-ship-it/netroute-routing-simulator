/** RFC 4180 CSV field escaping: quote fields containing comma, quote, CR or LF; double inner quotes. */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  // Neutralise spreadsheet formula injection for text cells.
  if (typeof value === 'string' && /^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCsvField).join(',')).join('\r\n');
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + content : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampSlug(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
