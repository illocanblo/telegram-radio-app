export const META_VER = 2
const META_TTL = 6 * 60 * 60 * 1000

export function parseStoredMeta(raw, now = Date.now()) {
  if (!raw) return null

  try {
    const record = JSON.parse(raw)
    if (!record || record.v !== META_VER || !Number.isFinite(record.ts) || now - record.ts > META_TTL) return null

    const data = record.d
    if (!data || !Array.isArray(data.tracks) || !Array.isArray(data.subjects)) return null
    return data
  } catch {
    return null
  }
}
