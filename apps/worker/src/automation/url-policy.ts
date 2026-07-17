import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

function isPrivateIp(address: string) {
  if (
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('fe80:')
  )
    return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168)
  );
}

export async function assertPublicHttpUrl(value: string) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('unsafe_target_url');
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase()))
    throw new Error('unsafe_target_url');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address)))
    throw new Error('unsafe_target_url');
  return url;
}
