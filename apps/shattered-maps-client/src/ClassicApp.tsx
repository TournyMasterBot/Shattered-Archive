import { MapProvider } from "@state/mapStore";
import { Routes, Route, Navigate } from "react-router-dom";
import MapEditor from "./components/MapEditor";
import MapAreaPage from "./pages/MapAreaPage";
import MapRoomPage from "./pages/MapRoomPage";
import RendererPage from "./render/RendererPage";
import "./styles/layout.scss";
import "./styles/renderer.scss";

/**
 * The classic editor and its views, as they were before the neutral model (the Mapper moved from the DslMapper repository): the
 * room editor at `#/legacy`, the hexagon pages at `#/map/...`, the octagon renderer at `#/renderer/...`. They keep their own store and
 * their own global styles, and load only when one of those addresses is opened, so the neutral viewer at `#/` is not styled by them.
 */
export default function ClassicApp() {
  return (
    <MapProvider>
      <Routes>
        <Route path="/legacy" element={<MapEditor />} />
        <Route path="/map/room/:vnum" element={<MapRoomPage />} />
        <Route path="/map/:continent/:area" element={<MapAreaPage />} />
        <Route path="/renderer" element={<RendererPage />} />
        <Route path="/renderer/:worldId/:continentId/:areaId" element={<RendererPage />} />
        <Route path="/renderer/room/:vnum" element={<RendererPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MapProvider>
  );
}
