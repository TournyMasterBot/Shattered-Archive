/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
// src/components/ExitEditor.tsx
import React from 'react'
import { Direction, ExitDef } from '../types'
import { useMap } from '@state/mapStore'
import { dirToGrid, reverseDir } from '../render/dir'

// Include U/D so they can be edited; keep their UI minimal.
const DIRS: Direction[] = ['N','NE','E','SE','S','SW','W','NW','U','D']
const IS_VERTICAL = (d: Direction) => d === 'U' || d === 'D'

export default function ExitEditor({ vnum }: { vnum: string }) {
  const { state, dispatch } = useMap()
  const room = state.doc.rooms[vnum]
  if (!room) return null

  // --- helpers --------------------------------------------------------------

  /** Ensure the target room exists; if missing create it. Return the vnum. */
  const ensureRoom = (targetVnum: string) => {
    const t = state.doc.rooms[targetVnum]
    if (!t) dispatch({ type: 'ADD_ROOM', vnum: targetVnum })
    return targetVnum
  }

  /** If target has no coords, place it adjacent to source using dir delta. */
  const maybeAutoPlaceTarget = (srcVnum: string, dir: Direction, tgtVnum: string) => {
    const src = state.doc.rooms[srcVnum]
    const tgt = state.doc.rooms[tgtVnum]
    if (!src) return
    const sc = src.coords
    const tc = tgt?.coords
    if (!tc || typeof tc.cx !== 'number' || typeof tc.cy !== 'number' || typeof tc.vz !== 'number') {
      const [dx, dy, dz] = dirToGrid(dir)
      const coords = { cx: sc.cx + dx, cy: sc.cy + dy, vz: sc.vz + dz }
      dispatch({ type: 'PATCH_ROOM', vnum: tgtVnum, patch: { coords } })
    }
  }

  /** Inherit category from source if target has none. */
  const maybeInheritCategory = (srcVnum: string, tgtVnum: string) => {
    const s = state.doc.rooms[srcVnum]
    const t = state.doc.rooms[tgtVnum]
    if (!s || !t) return
    const hasAny = !!(t.category && (t.category.worldId || t.category.continentId || t.category.areaId))
    if (!hasAny && s.category) {
      dispatch({ type: 'PATCH_ROOM', vnum: tgtVnum, patch: { category: s.category } as any })
    }
  }

  /** Upsert reciprocal on target (unless oneWay). Works for U/D too (U↔D). */
  const ensureReciprocal = (srcVnum: string, dir: Direction, tgtVnum: string, oneWay: boolean) => {
    if (oneWay) return
    const back = reverseDir(dir)
    const tgt = state.doc.rooms[tgtVnum]
    const exBack: ExitDef = {
      to: srcVnum,
      oneWay: false,
      door: null,
      status: 'created',
      ...(tgt?.exits?.[back] || {}),
    }
    dispatch({ type: 'UPSERT_EXIT', vnum: tgtVnum, dir: back, exit: exBack })
  }

  /** Remove reciprocal from target (used when toggling oneWay=true). */
  const removeReciprocal = (srcVnum: string, dir: Direction, tgtVnum: string) => {
    const back = reverseDir(dir)
    const t = state.doc.rooms[tgtVnum]
    if (!t?.exits?.[back]) return
    if (t.exits[back]?.to === srcVnum) {
      dispatch({ type: 'DELETE_EXIT', vnum: tgtVnum, dir: back })
    }
  }

  // --- handlers -------------------------------------------------------------

  /**
   * Unified updater. When the `to` field changes we:
   *  - create target (if missing)
   *  - auto-place target (including U/D dz)
   *  - optionally add reciprocal (unless oneWay)
   *  - inherit category if target lacks it
   */
  const upsert = (dir: Direction, field: keyof ExitDef, value: any) => {
    const current: ExitDef = {
      to: null,
      oneWay: false,
      door: null,
      status: 'unknown',
      ...(room.exits[dir] || {}),
    }

    const next: ExitDef = { ...current, [field]: value }

    // write local exit first
    dispatch({ type: 'UPSERT_EXIT', vnum, dir, exit: next })

    // if "to" changed / is set, handle target side-effects
    if (field === 'to') {
      const to = (typeof value === 'string' && value.trim()) ? value.trim() : null
      if (to) {
        ensureRoom(to)
        maybeAutoPlaceTarget(vnum, dir, to)
        maybeInheritCategory(vnum, to)
        ensureReciprocal(vnum, dir, to, next.oneWay)
      }
    }

    // if oneWay changed, sync reciprocal (add or remove) using current target
    if (field === 'oneWay' && current.to) {
      if (value === true) removeReciprocal(vnum, dir, current.to)
      else ensureReciprocal(vnum, dir, current.to, false)
    }
  }

  const deleteExit = (dir: Direction) => {
    const ex = room.exits[dir]
    dispatch({ type: 'DELETE_EXIT', vnum, dir })
    if (ex?.to) removeReciprocal(vnum, dir, ex.to)
  }

  // --- view -----------------------------------------------------------------

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 6 }}>
      {DIRS.map((dir) => {
        const ex = room.exits[dir]
        const vertical = IS_VERTICAL(dir)

        return (
          <div key={dir} style={{ display: 'contents' }}>
            <div style={{ fontWeight: 700, alignSelf: 'center' }}>{dir}</div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* target vnum */}
              <input
                placeholder={vertical ? 'to vnum (U/D)' : 'to vnum (nullable)'}
                value={ex?.to ?? ''}
                onChange={(e) => upsert(dir, 'to', e.target.value || null)}
                style={{ minWidth: 140 }}
              />

              {/* status */}
              <select
                value={ex?.status ?? 'unknown'}
                onChange={(e) => upsert(dir, 'status', e.target.value as ExitDef['status'])}
              >
                <option value="unknown">unknown</option>
                <option value="created">created</option>
                <option value="confirmed">confirmed</option>
                <option value="anomalous">anomalous</option>
              </select>

              {/* one-way */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={!!ex?.oneWay}
                  onChange={(e) => upsert(dir, 'oneWay', e.target.checked)}
                />
                one-way
              </label>

              {/* doors are only for planar links; hide for U/D */}
              {!vertical && (
                <>
                  <select
                    value={ex?.door ? (ex.door as any).type : 'none'}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === 'none') upsert(dir, 'door', null)
                      else if (v === 'simple') upsert(dir, 'door', { type: 'simple' })
                      else upsert(dir, 'door', { type: 'locked', keyId: '' })
                    }}
                  >
                    <option value="none">no door</option>
                    <option value="simple">🚪 simple</option>
                    <option value="locked">🔒 locked</option>
                  </select>

                  {ex?.door && (ex.door as any).type === 'locked' && (
                    <input
                      placeholder="key id"
                      value={(ex.door as any).keyId ?? ''}
                      onChange={(e) =>
                        upsert(dir, 'door', { type: 'locked', keyId: e.target.value })
                      }
                      style={{ minWidth: 120 }}
                    />
                  )}
                </>
              )}
            </div>

            {/* add/remove exit */}
            <div>
              {ex ? (
                <button onClick={() => deleteExit(dir)}>x</button>
              ) : (
                <button onClick={() => upsert(dir, 'status', 'unknown')}>+</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
