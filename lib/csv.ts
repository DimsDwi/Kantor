/** Quote every cell and prevent spreadsheet formula interpretation. */
export function csvText(rows: unknown[][]): string {
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
