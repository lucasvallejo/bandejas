export async function exportToExcel(filename, rows) {
  const header = Object.keys(rows[0] ?? {});
  const csv = [header.join(';')]
    .concat(rows.map(row => header.map(key => sanitizeCell(row[key])).join(';')))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob);
}

function sanitizeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/;/g, ',');
}

function triggerDownload(filename, blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}
