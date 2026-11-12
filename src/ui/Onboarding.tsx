import { useState } from 'react'
import { actions } from '../state/store'
import { exportKeys, generateIdentity, signRecord } from '../crypto/keys'
import { idbSet } from '../crypto/idb'
import { engine } from '../net/engine'

export default function Onboarding() {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [err, setErr] = useState('')

  const submit = async () => {
    const u = username.trim().toLowerCase()
    if (!name.trim()) return setErr('Pick a display name')
    if (!/^[a-z0-9_]{2,24}$/.test(u)) return setErr('Username: 2-24 chars of a-z, 0-9, _')
    const id = await generateIdentity(u, name.trim())
    const sig = await signRecord(id.ed, id.record)
    const keys = await exportKeys(id)
    await idbSet('rooms', [])
    actions.setIdentity({ record: id.record, sig }, keys)
    await engine.start()
  }

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <img src="/icon.svg" alt="" className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-bold">uChat5</h1>
            <p className="text-sm text-slate-400">Private encrypted chat</p>
          </div>
        </div>
        <label className="block text-sm text-slate-400 mb-1">Display name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ada"
          className="w-full mb-4 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 outline-none focus:border-blue-500"
        />
        <label className="block text-sm text-slate-400 mb-1">Username</label>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="ada"
          className="w-full mb-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 outline-none focus:border-blue-500"
        />
        {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
        <button
          onClick={submit}
          className="w-full mt-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold"
        >
          Create profile
        </button>
      </div>
    </div>
  )
}
