export function getParamId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}
