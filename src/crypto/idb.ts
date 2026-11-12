const DB = 'uchat5'
const STORE = 'kv'

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return dbp
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE).objectStore(STORE).get(key)
    t.onsuccess = () => res(t.result as T | undefined)
    t.onerror = () => rej(t.error)
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await open()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
    t.onsuccess = () => res()
    t.onerror = () => rej(t.error)
  })
}
