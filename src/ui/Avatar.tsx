import { avatarColor } from '../net/discovery'

export default function Avatar({ name, seed, size = 40 }: { name: string; seed: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      style={{ width: size, height: size, background: avatarColor(seed) }}
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none"
    >
      {initial}
    </div>
  )
}
