import { b64u, deriveShared, generateIdentity, unb64u } from '../src/crypto/keys.ts'
import { initRatchet, ratchetDecrypt, ratchetEncrypt, type RatchetState } from '../src/crypto/ratchet.ts'

const te = new TextEncoder()
const td = new TextDecoder()

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

async function main(): Promise<void> {
  const A = await generateIdentity('alice', 'Alice')
  const B = await generateIdentity('bob', 'Bob')
  const sA = new Uint8Array(await deriveShared(A.x, B.record.xPub))
  const sB = new Uint8Array(await deriveShared(B.x, A.record.xPub))
  assert(sA.every((b, i) => b === sB[i]), 'shared secret mismatch')

  const aInitiator = A.record.edPub < B.record.edPub
  const stA = await initRatchet(sA, A.x, unb64u(A.record.xPub), unb64u(B.record.xPub), aInitiator)
  const stB = await initRatchet(sB, B.x, unb64u(B.record.xPub), unb64u(A.record.xPub), !aInitiator)
  const [init, resp]: [RatchetState, RatchetState] = aInitiator ? [stA, stB] : [stB, stA]

  const starter = await ratchetEncrypt(init, new Uint8Array(0))
  const p0 = await ratchetDecrypt(resp, starter.h, starter.ct)
  assert(p0 !== null && p0.length === 0, 'chain starter failed')

  const m1 = await ratchetEncrypt(init, te.encode('hello'))
  const d1 = await ratchetDecrypt(resp, m1.h, m1.ct)
  assert(d1 !== null && td.decode(d1) === 'hello', 'initiator message failed')

  const r1 = await ratchetEncrypt(resp, te.encode('hi back'))
  const dr1 = await ratchetDecrypt(init, r1.h, r1.ct)
  assert(dr1 !== null && td.decode(dr1) === 'hi back', 'responder message failed')

  const m2 = await ratchetEncrypt(init, te.encode('second'))
  const m3 = await ratchetEncrypt(init, te.encode('third'))
  const d3 = await ratchetDecrypt(resp, m3.h, m3.ct)
  const d2 = await ratchetDecrypt(resp, m2.h, m2.ct)
  assert(d3 !== null && td.decode(d3) === 'third', 'out-of-order first failed')
  assert(d2 !== null && td.decode(d2) === 'second', 'out-of-order second failed')

  const bad = await ratchetEncrypt(init, te.encode('tamper me'))
  const raw = unb64u(bad.ct)
  raw[raw.length - 1] ^= 1
  const dt = await ratchetDecrypt(resp, bad.h, b64u(raw))
  assert(dt === null, 'tampered ciphertext not rejected')

  console.log('ratchet tests passed')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
