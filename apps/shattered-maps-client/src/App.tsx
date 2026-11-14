import { lazy, Suspense } from "react";
import { Routes, Route, HashRouter } from "react-router-dom";
import NeutralApp from "./neutral/NeutralApp";

// The classic editor and its views load, with their global styles, only when one of their addresses is opened.
const ClassicApp = lazy(() => import("./ClassicApp"));

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<NeutralApp />} />
        <Route
          path="*"
          element={
            <Suspense fallback={<p style={{ padding: 16 }}>Loading the classic editor…</p>}>
              <ClassicApp />
            </Suspense>
          }
        />
      </Routes>
    </HashRouter>
  );
}
