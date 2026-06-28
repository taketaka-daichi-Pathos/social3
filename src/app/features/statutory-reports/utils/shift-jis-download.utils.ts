import Encoding from 'encoding-japanese';

const CRLF = '\r\n';

/**
 * UTF-8 文字列を Shift_JIS バイト列に変換し、CSV ファイルとしてダウンロードする。
 */
export function downloadShiftJisTextFile(content: string, filename: string): void {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n/g, CRLF);
  const unicodeArray = Encoding.stringToCode(normalized);
  const sjisArray = Encoding.convert(unicodeArray, {
    to: 'SJIS',
    from: 'UNICODE',
    type: 'array',
  }) as number[];

  const blob = new Blob([new Uint8Array(sjisArray)], {
    type: 'text/csv;charset=shift_jis',
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
