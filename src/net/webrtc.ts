import { decode, encode, type WireMessage } from './protocol'

export class PeerLink {
  pc: RTCPeerConnection
  dc: RTCDataChannel | null = null
  onMessage: (m: WireMessage) => void = () => {}
  onOpen: () => void = () => {}
  onClose: () => void = () => {}
  onIce: (c: RTCIceCandidate | null) => void = () => {}

  constructor(iceServers: RTCIceServer[]) {
    this.pc = new RTCPeerConnection({ iceServers })
    this.pc.onicecandidate = e => this.onIce(e.candidate)
    this.pc.ondatachannel = e => this.attach(e.channel)
  }

  private attach(dc: RTCDataChannel) {
    this.dc = dc
    dc.onopen = () => this.onOpen()
    dc.onmessage = e => {
      try {
        this.onMessage(decode(e.data))
      } catch {
        // ignore malformed frames
      }
    }
    dc.onclose = () => this.onClose()
  }

  async offer(): Promise<RTCSessionDescriptionInit> {
    this.attach(this.pc.createDataChannel('chat'))
    await this.pc.setLocalDescription(await this.pc.createOffer())
    return this.pc.localDescription!.toJSON()
  }

  async answer(desc: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(desc)
    await this.pc.setLocalDescription(await this.pc.createAnswer())
    return this.pc.localDescription!.toJSON()
  }

  async accept(desc: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(desc)
  }

  async addIce(c: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(c)
  }

  send(m: WireMessage): void {
    if (this.dc && this.dc.readyState === 'open') this.dc.send(encode(m))
  }

  get open(): boolean {
    return this.dc?.readyState === 'open'
  }

  close(): void {
    try {
      this.dc?.close()
      this.pc.close()
    } catch {
      // already closed
    }
  }
}

export async function waitGather(pc: RTCPeerConnection): Promise<RTCIceCandidateInit[]> {
  if (pc.iceGatheringState === 'complete') return []
  const got: RTCIceCandidateInit[] = []
  const prev = pc.onicecandidate
  return new Promise(res => {
    pc.onicecandidate = e => {
      if (e.candidate) got.push(e.candidate.toJSON())
      else {
        pc.onicecandidate = prev
        res(got)
      }
    }
  })
}
