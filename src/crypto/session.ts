import { b64u, unb64u } from './keys'

export interface SessionCrypto {
  encrypt(pt: Uint8Array): Promise<string>
  decrypt(ct: string): Promise<Uint8Array>
}

export async function makeSession(shared: ArrayBuffer): Promise<SessionCrypto> {
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('uchat5'),
      info: new TextEncoder().encode('uchat5-session-v1'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return {
    async encrypt(pt) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt))
      const out = new Uint8Array(12 + ct.byteLength)
      out.set(iv)
      out.set(ct, 12)
      return b64u(out)
    },
    async decrypt(s) {
      const raw = unb64u(s)
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12))
      return new Uint8Array(pt)
    },
  }
}
