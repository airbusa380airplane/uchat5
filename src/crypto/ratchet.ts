import { b64u, unb64u } from './keys.ts'

const te = new TextEncoder()

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string, len: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(info) }, base, len * 8)
  return new Uint8Array(bits)
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

async function dh(priv: CryptoKey, pubBytes: Uint8Array): Promise<Uint8Array> {
  const pub = await crypto.subtle.importKey('raw', pubBytes, { name: 'X25519' }, false, [])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: pub }, priv, 256))
}

async function kdfRk(rk: Uint8Array, dhOut: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  const out = await hkdf(dhOut, rk, 'uchat5-ratchet-root-v1', 64)
  return [out.slice(0, 32), out.slice(32)]
}

async function kdfCk(ck: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  const mk = await hmac(ck, new Uint8Array([1]))
  const next = await hmac(ck, new Uint8Array([2]))
  return [next, mk]
}

async function aesEncrypt(mk: Uint8Array, iv: Uint8Array, ad: Uint8Array, pt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', mk, { name: 'AES-GCM' }, false, ['encrypt'])
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad }, key, pt))
}

async function aesDecrypt(mk: Uint8Array, iv: Uint8Array, ad: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', mk, { name: 'AES-GCM' }, false, ['decrypt'])
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: ad }, key, ct))
}

export interface RatchetState {
  rk: Uint8Array
  dhsPriv: CryptoKey
  dhsPub: Uint8Array
  dhr: Uint8Array | null
  cks: Uint8Array | null
  ckr: Uint8Array | null
  ns: number
  nr: number
  pn: number
  skip: Map<string, Uint8Array>
}

export interface RatchetHeader {
  dh: string
  n: number
  pn: number
}

export async function initRatchet(
  shared: Uint8Array,
  myXPriv: CryptoKey,
  myXPub: Uint8Array,
  peerXPub: Uint8Array,
  initiator: boolean,
): Promise<RatchetState> {
  const st: RatchetState = {
    rk: shared.slice(0, 32),
    dhsPriv: myXPriv,
    dhsPub: myXPub,
    dhr: initiator ? peerXPub : null,
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skip: new Map(),
  }
  if (initiator) {
    const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair
    st.dhsPriv = pair.privateKey
    st.dhsPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    const out = await dh(st.dhsPriv, peerXPub)
    const [rk, cks] = await kdfRk(st.rk, out)
    st.rk = rk
    st.cks = cks
  }
  return st
}

function ad(h: RatchetHeader): Uint8Array {
  return te.encode(JSON.stringify(h))
}

export async function ratchetEncrypt(st: RatchetState, pt: Uint8Array): Promise<{ h: RatchetHeader; ct: string }> {
  if (!st.cks) throw new Error('no send chain yet')
  const [cks, mk] = await kdfCk(st.cks)
  st.cks = cks
  const h: RatchetHeader = { dh: b64u(st.dhsPub), n: st.ns, pn: st.pn }
  st.ns++
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await aesEncrypt(mk, iv, ad(h), pt)
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return { h, ct: b64u(out) }
}

async function skipMessageKeys(st: RatchetState, until: number): Promise<void> {
  if (!st.ckr || !st.dhr) return
  while (st.nr < until) {
    const [ckr, mk] = await kdfCk(st.ckr)
    st.ckr = ckr
    st.skip.set(`${b64u(st.dhr)}:${st.nr}`, mk)
    st.nr++
    if (st.skip.size > 2000) {
      const oldest = st.skip.keys().next().value
      if (oldest !== undefined) st.skip.delete(oldest)
    }
  }
}

async function dhRatchet(st: RatchetState, h: RatchetHeader): Promise<void> {
  st.pn = st.ns
  st.ns = 0
  st.nr = 0
  st.dhr = unb64u(h.dh)
  const out1 = await dh(st.dhsPriv, st.dhr)
  const [rk1, ckr] = await kdfRk(st.rk, out1)
  st.rk = rk1
  st.ckr = ckr
  const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair
  st.dhsPriv = pair.privateKey
  st.dhsPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const out2 = await dh(st.dhsPriv, st.dhr)
  const [rk2, cks] = await kdfRk(st.rk, out2)
  st.rk = rk2
  st.cks = cks
}

export async function ratchetDecrypt(st: RatchetState, h: RatchetHeader, ctB64: string): Promise<Uint8Array | null> {
  const skipId = `${h.dh}:${h.n}`
  const skipped = st.skip.get(skipId)
  const raw = unb64u(ctB64)
  const iv = raw.slice(0, 12)
  const ct = raw.slice(12)
  if (skipped) {
    st.skip.delete(skipId)
    try {
      return await aesDecrypt(skipped, iv, ad(h), ct)
    } catch {
      return null
    }
  }
  if (!st.dhr || h.dh !== b64u(st.dhr)) {
    await skipMessageKeys(st, h.n)
    await dhRatchet(st, h)
  }
  await skipMessageKeys(st, h.n)
  if (!st.ckr) return null
  const [ckr, mk] = await kdfCk(st.ckr)
  st.ckr = ckr
  st.nr++
  try {
    return await aesDecrypt(mk, iv, ad(h), ct)
  } catch {
    return null
  }
}
