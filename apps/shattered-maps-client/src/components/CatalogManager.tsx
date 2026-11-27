/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
// src/components/CatalogManager.tsx
import React from 'react'
import { useMap } from '@state/mapStore'

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now()
}

export default function CatalogManager() {
  const { dispatch } = useMap()

  const addWorld = () => {
    const name = prompt('World name?')?.trim()
    if (!name) return
    const id = newId()
    dispatch({
      type: 'CATALOG_UPSERT',
      payload: { kind: 'world', node: { id, name } }
    })
  }

  const addContinent = () => {
    const name = prompt('Continent name?')?.trim()
    if (!name) return
    const id = newId()
    // Unassigned continent (no worldId) so it lands in your “Unassigned Catalog”
    const node: any = { id, name }
    dispatch({
      type: 'CATALOG_UPSERT',
      payload: { kind: 'continent', node }
    })
  }

  const addArea = () => {
    const name = prompt('Area name?')?.trim()
    if (!name) return
    const id = newId()
    // Unassigned area (no worldId/continentId) so it lands in your “Unassigned Catalog”
    const node: any = { id, name }
    dispatch({
      type: 'CATALOG_UPSERT',
      payload: { kind: 'area', node }
    })
  }

  return (
    <div style={{ display:'flex', gap:8, marginBottom:8 }}>
      <button type="button" onClick={addWorld}>+ World</button>
      <button type="button" onClick={addContinent}>+ Continent</button>
      <button type="button" onClick={addArea}>+ Area</button>
    </div>
  )
}
