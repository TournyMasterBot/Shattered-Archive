import React from "react";
import { useMap } from "@state/mapStore";

const LVL_KEY = "dslmapper:viewLevel";

export default function Toolbar() {
  const { state, dispatch } = useMap();
  const current = typeof state.level === "number" ? state.level : 0;
  const selectedVnum = state.selected || null;

  // keyboard shortcuts: Undo / Redo
  const canUndo = state._past.length > 0;
  const canRedo = state._future.length > 0;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = e.key.toLowerCase() === "z";
      if (!(e.ctrlKey || e.metaKey) || !z) return;
      e.preventDefault();
      if (e.shiftKey) {
        if (canRedo) dispatch({ type: "REDO" });
      } else {
        if (canUndo) dispatch({ type: "UNDO" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, canRedo, dispatch]);

  // Seed editor level from localStorage (if renderer was opened first).
  React.useEffect(() => {
    const raw = localStorage.getItem(LVL_KEY);
    if (raw != null && raw !== "" && !Number.isNaN(Number(raw))) {
      const n = Number(raw);
      if (n !== current) {
        dispatch({ type: "SET_LEVEL", level: n });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLevel = (level: number) => {
    dispatch({ type: "SET_LEVEL", level });
    try {
      localStorage.setItem(LVL_KEY, String(level));
    } catch {
      /* ignore quota */
    }
  };

  const openRenderer = () => {
    const { doc } = state;
    const sel = selectedVnum ? doc.rooms[selectedVnum] : null;

    const base = window.location.href.split("#")[0]; // absolute origin w/o hash
    const params = new URLSearchParams();

    // prefer selected room’s level/coords if present
    const level = sel ? sel.coords.vz : current;
    params.set("level", String(level));

    // Also persist to the cross-tab channel so the new tab opens at this level
    try {
      localStorage.setItem(LVL_KEY, String(level));
    } catch {
      // storage can be unavailable (private mode): the level is then simply not remembered
    }

    // Start with whatever the room already has
    let worldId = sel?.category?.worldId as string | undefined;
    let continentId = sel?.category?.continentId as string | undefined;
    let areaId = sel?.category?.areaId as string | undefined;

    // If we only have areaId, derive world/continent from the catalog
    if (areaId && (!worldId || !continentId)) {
      const areaMeta = doc?.meta?.catalog?.areas[areaId];
      if (areaMeta) {
        if (!worldId) worldId = areaMeta.worldId;
        if (!continentId) continentId = areaMeta.continentId;
      }
    }

    // Final fallback
    worldId ??= "all";
    continentId ??= "all";
    areaId ??= "all";

    if (sel) {
      params.set("vnum", sel.vnum);
      params.set("cx", String(sel.coords.cx));
      params.set("cy", String(sel.coords.cy));
    }

    const absolute =
      `${base}#/renderer/${encodeURIComponent(worldId)}` +
      `/${encodeURIComponent(continentId)}` +
      `/${encodeURIComponent(areaId)}?${params.toString()}`;

    window.open(absolute, "_blank", "noopener");
  };

  return (
    <div
      className="toolbar"
      style={{ display: "flex", gap: 8, alignItems: "center" }}
    >
      {/* Undo / Redo */}
      <button
        type="button"
        onClick={() => dispatch({ type: "UNDO" })}
        disabled={!canUndo}
        title="Undo (Ctrl/Cmd+Z)"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "REDO" })}
        disabled={!canRedo}
        title="Redo (Ctrl/Cmd+Shift+Z)"
      >
        Redo
      </button>

      {/* Room add/delete */}
      <button
        type="button"
        onClick={() => {
          const v = prompt("New room vnum?")?.trim();
          if (v) {
            dispatch({ type: "ADD_ROOM", vnum: v });
            requestAnimationFrame(() =>
              dispatch({ type: "SELECT_ROOM", vnum: v })
            );
          }
        }}
      >
        Add Room
      </button>

      <button
        type="button"
        onClick={() => {
          if (!selectedVnum) return;
          if (confirm(`Delete room ${selectedVnum}?`)) {
            dispatch({ type: "DELETE_ROOM", vnum: selectedVnum });
          }
        }}
        disabled={!selectedVnum}
      >
        Delete Selected
      </button>

      {/* Renderer */}
      <button type="button" onClick={openRenderer}>
        Open Renderer ↗
      </button>

      {/* Level control */}
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <label>View Level:</label>
        <input
          type="number"
          value={current}
          onChange={(e) => setLevel(Number(e.target.value))}
          style={{ width: 72 }}
        />
        <button type="button" onClick={() => setLevel(current + 1)}>
          ▲
        </button>
        <button type="button" onClick={() => setLevel(current - 1)}>
          ▼
        </button>
      </div>
    </div>
  );
}
