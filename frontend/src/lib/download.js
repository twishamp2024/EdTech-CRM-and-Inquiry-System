const UTF8_BOM = String.fromCodePoint(0xfeff);

/**
 * Saves text as a file through a temporary object URL. CSV gets a UTF-8
 * byte-order mark (browsers drop it while decoding the response) so Excel
 * shows accented and non-Latin names correctly.
 */
export function saveTextFile(text, filename, type = 'text/csv;charset=utf-8') {
  const content =
    type.startsWith('text/csv') && !text.startsWith(UTF8_BOM) ? UTF8_BOM + text : text;
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
