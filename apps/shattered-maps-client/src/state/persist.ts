// src/state/persist.ts
import { MapDocV1 } from '../types'

/** Single key we autosave to; other tabs listen for changes. */
export const STORAGE_KEY = 'dslmapper.autosave'

export function saveToLocal(doc: MapDocV1) {
  const payload = JSON.stringify(doc)
  localStorage.setItem(STORAGE_KEY, payload) // fires 'storage' in other tabs
  const savedAt = Date.now()
  return { savedAt }
}

export function loadFromLocal(): MapDocV1 | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as MapDocV1
  } catch {
    return null
  }
}

export function clearLocal() {
  localStorage.removeItem(STORAGE_KEY)
}

/** Utility for file export (JSON) */
export function exportToFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Utility for file import (JSON) */
export async function importFromFile(file: File): Promise<MapDocV1> {
  const text = await file.text()
  const parsed = JSON.parse(text)
  return parsed as MapDocV1
}
