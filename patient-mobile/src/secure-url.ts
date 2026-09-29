export function prescriptionPathFromPortalUrl(value: string, currentHost: string, configuredHosts = ''): string {
  const url = new URL(value);
  const allowedHosts = new Set([currentHost, ...configuredHosts.split(',').map((host) => host.trim()).filter(Boolean)]);
  if (!allowedHosts.has(url.host) || !/^\/prescription\/[A-Za-z0-9_-]{43}$/.test(url.pathname))
    throw new Error('Use a secure RxFlow prescription link.');
  return url.pathname;
}
