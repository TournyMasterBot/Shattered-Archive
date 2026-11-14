/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
// src/components/RoomForm.tsx
import React from "react";
import { useMap } from "@state/mapStore";
import { dirToGrid } from "../render/dir";
import ExitEditor from "./ExitEditor";
import { RoomObject, TERRAIN_OPTIONS } from "../types";
import { TerrainKind } from "../types";

// Common Merc/ROM-ish sector suggestions (free text still allowed)


function toList(val?: string[] | null): string {
  return (val ?? []).join(", ");
}
function fromList(s: string): string[] | undefined {
  const arr = s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return arr.length ? arr : undefined;
}

/**
 * Renders nothing for a room that is not in the document. The form's hooks live in `RoomFormFor`, which only exists while the room does
 * (React hooks must not come after an early return).
 */
export default function RoomForm({ vnum }: { vnum: string }) {
  const { state } = useMap();
  if (!state.doc.rooms[vnum]) return null;
  return <RoomFormFor vnum={vnum} />;
}

function RoomFormFor({ vnum }: { vnum: string }) {
  const { state, dispatch } = useMap();
  const room = state.doc.rooms[vnum];

  // Local string state so users can type "-" etc. before committing numbers
  const [label, setLabel] = React.useState(room.label ?? "");
  const [sector, setSector] = React.useState(room.sector ?? "");
  const [cx, setCx] = React.useState(String(room.coords.cx));
  const [cy, setCy] = React.useState(String(room.coords.cy));
  const [vz, setVz] = React.useState(String(room.coords.vz));

  const [reqs, setReqs] = React.useState(toList(room.movement?.requires));
  const [bans, setBans] = React.useState(toList(room.movement?.bans));

  const [flags, setFlags] = React.useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (room.flags) {
      for (const [k, v] of Object.entries(room.flags)) f[k] = String(v);
    }
    return f;
  });

  const [objects, setObjects] = React.useState<RoomObject[]>(
    room.objects ?? []
  );

  React.useEffect(() => {
    const r = state.doc.rooms[vnum];
    if (!r) return;
    setLabel(r.label ?? "");
    setSector(r.sector ?? "");
    setCx(String(r.coords.cx));
    setCy(String(r.coords.cy));
    setVz(String(r.coords.vz));
    setReqs(toList(r.movement?.requires));
    setBans(toList(r.movement?.bans));
    const f: Record<string, string> = {};
    if (r.flags) for (const [k, v] of Object.entries(r.flags)) f[k] = String(v);
    setFlags(f);
    setObjects(r.objects ?? []);
  }, [vnum, state.doc.rooms]);

  const patch = (patch: Partial<typeof room>) =>
    dispatch({ type: "PATCH_ROOM", vnum, patch });

  const commitNumber = (key: "cx" | "cy" | "vz", val: string) => {
    if (!/^-?\d+$/.test(val)) return;
    const n = parseInt(val, 10);
    const next = { ...room.coords, [key]: n };
    patch({ coords: next });
  };

  const move = (dir: string) => {
    const [dx, dy, dz] = dirToGrid(dir as any);
    const next = {
      cx: room.coords.cx + dx,
      cy: room.coords.cy + dy,
      vz: room.coords.vz + dz,
    };
    patch({ coords: next });
    setCx(String(next.cx));
    setCy(String(next.cy));
    setVz(String(next.vz));
  };

  const commitMovement = () => {
    patch({
      movement: {
        requires: fromList(reqs),
        bans: fromList(bans),
      },
    });
  };

  // ----- Flags helpers -----
  const addFlagRow = () => {
    const key = prompt("Flag key?")?.trim();
    if (!key) return;
    if (flags[key] !== undefined) return alert("Flag exists.");
    const next = { ...flags, [key]: "true" };
    setFlags(next);
    patch({ flags: next });
  };
  const setFlagKey = (oldKey: string, newKey: string) => {
    if (!newKey || newKey === oldKey) return;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(flags)) {
      next[k === oldKey ? newKey : k] = v;
    }
    setFlags(next);
    patch({ flags: next });
  };
  const setFlagVal = (k: string, v: string) => {
    const next = { ...flags, [k]: v };
    setFlags(next);
    patch({ flags: next });
  };
  const delFlag = (k: string) => {
    const next = { ...flags };
    delete next[k];
    setFlags(next);
    patch({ flags: next });
  };

  // ----- Objects helpers (light stub) -----
  const addObject = () => {
    const name = prompt("Object name?")?.trim();
    if (!name) return;
    const obj: RoomObject = { id: crypto.randomUUID(), name };
    const next = [...objects, obj];
    setObjects(next);
    patch({ objects: next });
  };
  const renameObject = (id: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const name = prompt("Rename object:", obj.name)?.trim();
    if (!name) return;
    const next = objects.map((o) => (o.id === id ? { ...o, name } : o));
    setObjects(next);
    patch({ objects: next });
  };
  const removeObject = (id: string) => {
    const next = objects.filter((o) => o.id !== id);
    setObjects(next);
    patch({ objects: next });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section
        style={{
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: 6,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Room</h3>
        <div>
          <strong>VNUM:</strong> {vnum}
        </div>

        <label style={{ display: "grid", gap: 4, maxWidth: 520, marginTop: 8 }}>
          <span>Name</span>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              patch({ label: e.target.value || undefined });
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 4, maxWidth: 520 }}>
          <span>Sector</span>
          <select
            value={sector || TerrainKind.Unknown}
            onChange={(e) => {
              const v = e.target.value as TerrainKind;
              setSector(v);
              patch({ sector: v });
            }}
          >
            {TERRAIN_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 4, marginTop: 8 }}>
          <span>Coordinates (cx, cy, vz)</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              inputMode="numeric"
              value={cx}
              onChange={(e) => setCx(e.target.value)}
              onBlur={() => commitNumber("cx", cx)}
              style={{ width: 80 }}
            />
            <input
              type="number"
              inputMode="numeric"
              value={cy}
              onChange={(e) => setCy(e.target.value)}
              onBlur={() => commitNumber("cy", cy)}
              style={{ width: 80 }}
            />
            <input
              type="number"
              inputMode="numeric"
              value={vz}
              onChange={(e) => setVz(e.target.value)}
              onBlur={() => commitNumber("vz", vz)}
              style={{ width: 80 }}
            />
          </div>
        </label>

        {/* Movement controls (star pattern) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            width: 240,
            marginTop: 8,
          }}
        >
          <button type="button" onClick={() => move("NW")}>
            NW
          </button>
          <button type="button" onClick={() => move("N")}>
            N
          </button>
          <button type="button" onClick={() => move("NE")}>
            NE
          </button>

          <button type="button" onClick={() => move("W")}>
            W
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.7,
            }}
          >
            &middot;
          </div>
          <button type="button" onClick={() => move("E")}>
            E
          </button>

          <button type="button" onClick={() => move("SW")}>
            SW
          </button>
          <button type="button" onClick={() => move("S")}>
            S
          </button>
          <button type="button" onClick={() => move("SE")}>
            SE
          </button>
        </div>

        {/* Vertical movement (U/D) */}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button type="button" onClick={() => move("U")}>
            U
          </button>
          <button type="button" onClick={() => move("D")}>
            D
          </button>
        </div>
      </section>

      {/* Exits / Doors */}
      <section
        style={{
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: 6,
        }}
      >
        <h3 style={{ margin: 0 }}>Exits & Doors</h3>
        <p style={{ opacity: 0.8, marginTop: 4, marginBottom: 8 }}>
          Set targets, status, one-way, and door (simple/locked + key id).
          Unknown targets are allowed.
        </p>
        <ExitEditor vnum={vnum} />
      </section>

      {/* Movement requirements / bans */}
      <section
        style={{
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: 6,
        }}
      >
        <h3 style={{ margin: 0 }}>Movement Rules</h3>
        <div style={{ display: "grid", gap: 8, maxWidth: 640 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>
              Requires (comma-separated; e.g. <em>swimming, flying</em>)
            </span>
            <input
              type="text"
              value={reqs}
              onChange={(e) => setReqs(e.target.value)}
              onBlur={commitMovement}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>
              Bans (comma-separated; e.g. <em>true flight</em>)
            </span>
            <input
              type="text"
              value={bans}
              onChange={(e) => setBans(e.target.value)}
              onBlur={commitMovement}
            />
          </label>
        </div>
      </section>

      {/* Flags */}
      <section
        style={{
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: 6,
        }}
      >
        <h3
          style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}
        >
          Flags
          <button type="button" onClick={addFlagRow}>
            + Flag
          </button>
        </h3>
        <div style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 720 }}>
          {Object.keys(flags).length === 0 && (
            <div style={{ opacity: 0.7 }}>No flags.</div>
          )}
          {Object.entries(flags).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr auto",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={k}
                onChange={(e) => setFlagKey(k, e.target.value.trim())}
              />
              <input
                type="text"
                value={v}
                onChange={(e) => setFlagVal(k, e.target.value)}
              />
              <button type="button" onClick={() => delFlag(k)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Objects (light stub) */}
      <section
        style={{
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: 6,
        }}
      >
        <h3
          style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}
        >
          Objects
          <button type="button" onClick={addObject}>
            + Object
          </button>
        </h3>
        <div style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 720 }}>
          {objects.length === 0 && (
            <div style={{ opacity: 0.7 }}>No objects.</div>
          )}
          {objects.map((obj) => (
            <div
              key={obj.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div>
                {obj.name} <span style={{ opacity: 0.7 }}>({obj.id})</span>
              </div>
              <button type="button" onClick={() => renameObject(obj.id)}>
                Rename
              </button>
              <button type="button" onClick={() => removeObject(obj.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Interactions (stub for future) */}
      <section
        style={{
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: 6,
        }}
      >
        <h3 style={{ margin: 0 }}>Interactions (stub)</h3>
        <p style={{ opacity: 0.8, marginTop: 4 }}>
          Support verbs like <code>dig</code>, <code>push</code>,{" "}
          <code>pull</code>, <code>shove</code>, etc. We’ll wire a full editor
          here later (when/conditions/effects).
        </p>
      </section>
    </div>
  );
}
