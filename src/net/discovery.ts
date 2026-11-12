import type { SignedIdentity } from '../crypto/keys'

export function reconcileUsernames(ids: SignedIdentity[]): Record<string, string> {
  const byName = new Map<string, SignedIdentity[]>()
  for (const id of ids) {
    const name = id.record.username
    const arr = byName.get(name) ?? []
    arr.push(id)
    byName.set(name, arr)
  }
  const out: Record<string, string> = {}
  for (const arr of byName.values()) {
    arr.sort((a, b) => a.record.createdAt - b.record.createdAt || a.record.edPub.localeCompare(b.record.edPub))
    arr.forEach((id, i) => {
      out[id.record.edPub] = i === 0 ? id.record.username : `${id.record.username}${i + 1}`
    })
  }
  return out
}

export function avatarColor(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 65% 45%)`
}
