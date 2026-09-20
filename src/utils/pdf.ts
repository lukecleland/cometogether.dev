export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export function isPdfFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
export function validPdfPage(page: unknown): page is number {
  return typeof page === 'number' && Number.isSafeInteger(page) && page >= 1;
}
export async function preparePdf(file: File): Promise<File> {
  if (!isPdfFile(file)) throw new Error('Choose a PDF file.');
  if (file.size > MAX_PDF_BYTES) throw new Error('PDFs must be 50 MB or smaller.');
  const header = await file.slice(0, 1024).text();
  if (!header.includes('%PDF-')) throw new Error('This file does not appear to be a PDF.');
  return file.type === 'application/pdf' ? file : new File([file], file.name, { type: 'application/pdf' });
}
