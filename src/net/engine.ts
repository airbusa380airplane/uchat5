import { joinRoom } from 'trystero/nostr'
import { actions, getState } from '../state/store'
import { idbGet, idbSet } from '../crypto/idb'
import {
  b64u,
  unb64u,
  deriveShared,
  importPrivateKeys,
  signRecord,
  verifyRecord,
  type SignedIdentity,
} from '../crypto/keys'
import { decodeInvite, encodeInvite, newRoomSecret, type InvitePayload } from '../crypto/invite'
import { initRatchet, ratchetDecrypt, ratchetEncrypt, type RatchetState } from '../crypto/ratchet'
import { PeerLink, waitGather } from './webrtc'
import type { WireMessage } from './protocol'

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }]

interface Conn {
  link: PeerLink
  ratchet: RatchetState | null
  their: SignedIdentity | null
  room: string
}

class Engine {
  private rooms = new Map<string, { send: (d: unknown, to?: string) => void }>()
  private conns = new Map<string, Conn>()
  private byEd = new Map<string, string>()
  private selfId = ''
  private started = false
  private manual: PeerLink | null = null

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.selfId = (await idbGet<string>('selfId')) ?? b64u(crypto.getRandomValues(new Uint8Array(9)))
    await idbSet('selfId', this.selfId)
    const st = getState()
    if (!st.identity || !st.identityKeys) return
    const rooms = (await idbGet<string[]>('rooms')) ?? []
    for (const r of rooms) this.joinRoom(r)
  }

  private async myKeys(): Promise<{ ed: CryptoKey; x: CryptoKey }> {
    const st = getState()
    if (!st.identityKeys) throw new Error('no identity')
    return importPrivateKeys(st.identityKeys.edJwk, st.identityKeys.xJwk)
  }

  async createInvite(): Promise<string> {
    const st = getState()
    if (!st.identity) throw new Error('no identity')
    const room = newRoomSecret()
    const rooms = (await idbGet<string[]>('rooms')) ?? []
    rooms.push(room)
    await idbSet('rooms', rooms)
    this.joinRoom(room)
    const p: InvitePayload = {
      v: 1,
      room,
      edPub: st.identity.record.edPub,
      xPub: st.identity.record.xPub,
      displayName: st.identity.record.displayName,
      username: st.identity.record.username,
    }
    return encodeInvite(p)
  }

  async joinInvite(code: string): Promise<void> {
    const p = decodeInvite(code)
    const rooms = (await idbGet<string[]>('rooms')) ?? []
    if (!rooms.includes(p.room)) {
      rooms.push(p.room)
      await idbSet('rooms', rooms)
    }
    this.joinRoom(p.room)
  }

  private joinRoom(roomId: string): void {
    if (this.rooms.has(roomId)) return
    const st = getState()
    const room = joinRoom({ appId: 'uchat5', relayUrls: st.settings.relays }, roomId) as any
    const [sendSig, getSig] = room.makeAction('sig')
    this.rooms.set(roomId, { send: (d: unknown, to?: string) => sendSig(d, to) })
    room.onPeerJoin((peerId: string) => {
      if (peerId > this.selfId) void this.offerTo(roomId, peerId)
    })
    room.onPeerLeave((peerId: string) => this.drop(peerId))
    getSig((data: any, from: string) => this.onSignal(roomId, from, data))
  }

  private async offerTo(roomId: string, peerId: string): Promise<void> {
    const entry = this.rooms.get(roomId)
    if (!entry || this.conns.has(peerId)) return
    const link = new PeerLink(ICE)
    const conn: Conn = { link, ratchet: null, their: null, room: roomId }
    this.conns.set(peerId, conn)
    this.wire(peerId, conn)
    const desc = await link.offer()
    entry.send({ kind: 'offer', desc }, peerId)
  }

  private onSignal(roomId: string, from: string, data: any): void {
    const entry = this.rooms.get(roomId)
    if (!entry) return
    if (data?.kind === 'offer') {
      if (from > this.selfId || this.conns.has(from)) return
      const link = new PeerLink(ICE)
      const conn: Conn = { link, ratchet: null, their: null, room: roomId }
      this.conns.set(from, conn)
      this.wire(from, conn)
      link.answer(data.desc).then(desc => entry.send({ kind: 'answer', desc }, from))
    } else if (data?.kind === 'answer') {
      const c = this.conns.get(from)
      if (c) void c.link.accept(data.desc)
    } else if (data?.kind === 'ice') {
      const c = this.conns.get(from)
      if (c && data.candidate) void c.link.addIce(data.candidate)
    }
  }

  private wire(peerId: string, conn: Conn): void {
    const entry = this.rooms.get(conn.room)
    conn.link.onIce = c => entry?.send({ kind: 'ice', candidate: c ? c.toJSON() : null }, peerId)
    conn.link.onOpen = () => void this.hello(peerId, conn)
    conn.link.onClose = () => this.drop(peerId)
    conn.link.onMessage = m => void this.onWire(peerId, conn, m)
  }

  private async hello(peerId: string, conn: Conn): Promise<void> {
    const st = getState()
    if (!st.identity) return
    const { ed } = await this.myKeys()
    const sig = await signRecord(ed, st.identity.record)
    const id: SignedIdentity = { record: st.identity.record, sig }
    conn.link.send({ v: 1, t: 'hello', id, xPub: st.identity.record.xPub })
  }

  private async onWire(peerId: string, conn: Conn, m: WireMessage): Promise<void> {
    if (m.t === 'hello') {
      const ok = await verifyRecord(m.id.record, m.id.sig)
      if (!ok) return
      conn.their = m.id
      this.byEd.set(m.id.record.edPub, peerId)
      const me = getState().identity!
      const { x } = await this.myKeys()
      const shared = new Uint8Array(await deriveShared(x, m.xPub))
      const initiator = me.record.edPub < m.id.record.edPub
      conn.ratchet = await initRatchet(shared, x, unb64u(me.record.xPub), unb64u(m.xPub), initiator)
      actions.upsertPeer(m.id.record.edPub, { id: m.id, status: 'online', lastSeen: Date.now() })
      conn.link.send({ v: 1, t: 'peers', ids: this.knownIds() })
      if (initiator) {
        const { h, ct } = await ratchetEncrypt(conn.ratchet, new Uint8Array(0))
        conn.link.send({ v: 2, t: 'msg', h, ct, ts: Date.now() })
      }
      void this.flush(peerId, conn)
    } else if (m.t === 'msg' && conn.ratchet && conn.their) {
      const pt = await ratchetDecrypt(conn.ratchet, m.h, m.ct)
      if (!pt) return
      if (pt.length > 0) {
        actions.addMessage(conn.their.record.edPub, {
          id: b64u(crypto.getRandomValues(new Uint8Array(8))),
          from: 'them',
          text: new TextDecoder().decode(pt),
          ts: m.ts,
          status: 'sent',
        })
      }
      void this.flush(peerId, conn)
    } else if (m.t === 'peers') {
      for (const id of m.ids) {
        if (id.record.edPub === getState().identity?.record.edPub) continue
        if (await verifyRecord(id.record, id.sig)) actions.upsertPeer(id.record.edPub, { id })
      }
    }
  }

  private knownIds(): SignedIdentity[] {
    const st = getState()
    const out: SignedIdentity[] = []
    if (st.identity) out.push(st.identity)
    for (const p of Object.values(st.peers)) out.push(p.id)
    return out
  }

  private async flush(peerId: string, conn: Conn): Promise<void> {
    if (!conn.ratchet?.cks || !conn.their) return
    const edPub = conn.their.record.edPub
    const queued = (getState().messages[edPub] ?? []).filter(m => m.from === 'me' && m.status === 'queued')
    for (const m of queued) {
      const { h, ct } = await ratchetEncrypt(conn.ratchet, new TextEncoder().encode(m.text))
      conn.link.send({ v: 2, t: 'msg', h, ct, ts: m.ts })
      actions.updateMessage(edPub, m.id, { status: 'sent' })
    }
  }

  async sendText(edPub: string, text: string): Promise<void> {
    const ts = Date.now()
    const id = b64u(crypto.getRandomValues(new Uint8Array(8)))
    const peerId = this.byEd.get(edPub)
    const conn = peerId ? this.conns.get(peerId) : undefined
    if (conn?.ratchet?.cks && conn.link.open) {
      const { h, ct } = await ratchetEncrypt(conn.ratchet, new TextEncoder().encode(text))
      conn.link.send({ v: 2, t: 'msg', h, ct, ts })
      actions.addMessage(edPub, { id, from: 'me', text, ts, status: 'sent' })
    } else {
      actions.addMessage(edPub, { id, from: 'me', text, ts, status: 'queued' })
    }
  }

  private drop(peerId: string): void {
    const c = this.conns.get(peerId)
    if (!c) return
    c.link.close()
    this.conns.delete(peerId)
    if (c.their) {
      this.byEd.delete(c.their.record.edPub)
      actions.setPeerStatus(c.their.record.edPub, 'offline')
    }
  }

  async manualOffer(): Promise<string> {
    this.manual = new PeerLink(ICE)
    const conn: Conn = { link: this.manual, ratchet: null, their: null, room: 'manual' }
    this.wire('manual', conn)
    const desc = await this.manual.offer()
    const ice = await waitGather(this.manual.pc)
    return b64u(new TextEncoder().encode(JSON.stringify({ desc, ice })))
  }

  async manualAccept(blob: string): Promise<string> {
    if (!this.manual) throw new Error('no manual link in progress')
    const data = JSON.parse(new TextDecoder().decode(unb64u(blob)))
    const desc = await this.manual.answer(data.desc)
    for (const c of data.ice ?? []) await this.manual.addIce(c)
    const ice = await waitGather(this.manual.pc)
    return b64u(new TextEncoder().encode(JSON.stringify({ desc, ice })))
  }

  async manualApply(blob: string): Promise<void> {
    const data = JSON.parse(new TextDecoder().decode(unb64u(blob)))
    if (!this.manual) {
      this.manual = new PeerLink(ICE)
      const conn: Conn = { link: this.manual, ratchet: null, their: null, room: 'manual' }
      this.wire('manual', conn)
    }
    await this.manual.accept(data.desc)
    for (const c of data.ice ?? []) await this.manual.addIce(c)
  }
}

export const engine = new Engine()
