export interface IdentityRecord {
  v: 1
  username: string
  displayName: string
  createdAt: number
  edPub: string
  xPub: string
}

export interface SignedIdentity {
  record: IdentityRecord
  sig: string
}

export interface Identity {
  record: IdentityRecord
  ed: CryptoKey
  x: CryptoKey
}

export function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function unb64u(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function canon(o: unknown): string {
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'
  if (o && typeof o === 'object') {
    const r = o as Record<string, unknown>
    return '{' + Object.keys(r).sort().map(k => JSON.stringify(k) + ':' + canon(r[k])).join(',') + '}'
  }
  return JSON.stringify(o)
}

export async function generateIdentity(username: string, displayName: string): Promise<Identity> {
  const edPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const xPair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair
  const edPubRaw = await crypto.subtle.exportKey('raw', edPair.publicKey)
  const xPubRaw = await crypto.subtle.exportKey('raw', xPair.publicKey)
  const ed = edPair.privateKey
  const x = xPair.privateKey
  const record: IdentityRecord = {
    v: 1,
    username,
    displayName,
    createdAt: Date.now(),
    edPub: b64u(edPubRaw),
    xPub: b64u(xPubRaw),
  }
  return { record, ed, x }
}

export async function signRecord(ed: CryptoKey, rec: IdentityRecord): Promise<string> {
  const sig = await crypto.subtle.sign('Ed25519', ed, new TextEncoder().encode(canon(rec)))
  return b64u(sig)
}

export async function verifyRecord(rec: IdentityRecord, sig: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', unb64u(rec.edPub), { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify('Ed25519', key, unb64u(sig), new TextEncoder().encode(canon(rec)))
}

export async function fingerprintOf(edPubB64u: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', unb64u(edPubB64u))
  const hex = Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('')
  return (hex.match(/.{4}/g) ?? []).join(' ')
}

export async function exportKeys(id: Identity): Promise<{ edJwk: JsonWebKey; xJwk: JsonWebKey }> {
  return {
    edJwk: await crypto.subtle.exportKey('jwk', id.ed),
    xJwk: await crypto.subtle.exportKey('jwk', id.x),
  }
}

export async function importPrivateKeys(
  edJwk: JsonWebKey,
  xJwk: JsonWebKey,
): Promise<{ ed: CryptoKey; x: CryptoKey }> {
  const ed = await crypto.subtle.importKey('jwk', edJwk, { name: 'Ed25519' }, true, ['sign'])
  const x = await crypto.subtle.importKey('jwk', xJwk, { name: 'X25519' }, true, ['deriveBits'])
  return { ed, x }
}

export async function deriveShared(xPriv: CryptoKey, peerXPubB64u: string): Promise<ArrayBuffer> {
  const peer = await crypto.subtle.importKey('raw', unb64u(peerXPubB64u), { name: 'X25519' }, false, [])
  return crypto.subtle.deriveBits({ name: 'X25519', public: peer }, xPriv, 256)
}
