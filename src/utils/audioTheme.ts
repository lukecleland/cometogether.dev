export type AudioTheme = 'digital' | 'record' | 'tape';
export function validAudioTheme(value: unknown): value is AudioTheme {
  return value === 'digital' || value === 'record' || value === 'tape';
}
