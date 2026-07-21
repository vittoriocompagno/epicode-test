export function resolveApiBaseUrl(
  configuredUrl: string | undefined,
  currentOrigin: string,
): string {
  return configuredUrl || currentOrigin;
}
