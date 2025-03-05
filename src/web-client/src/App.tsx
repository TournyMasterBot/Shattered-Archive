import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useState } from 'react';
import RoomsSelectPage from './pages/directions/room-select'; // adjust the path as needed
import CreationSimulatorPage from './pages/character/creation-simulator';
import Layout from "./pages/Layout";

// Home component with your original content
function Home() {
  const [count, setCount] = useState(0);
  const gameServerEndpoint = __VITE_ENV__.VITE_GAME_SERVER;
  const webServerEndpoint = __VITE_ENV__.VITE_WEB_SERVER;
  
  return (
    <>
      <div>
        <h1>Web Client</h1>
        <a href={gameServerEndpoint} target="_blank" rel="noreferrer">{gameServerEndpoint}</a>
        <br />
        <a href={webServerEndpoint} target="_blank" rel="noreferrer">{webServerEndpoint}</a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((prevCount) => prevCount + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

// Main App component with Router
function App() {
  return (
    <Router>
      <Layout>
        <nav>
          <Link to="/">Home</Link> | <Link to="/rooms">Rooms</Link>
        </nav>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/character/creation-simulator" element={<CreationSimulatorPage />} /> 
          <Route path="/rooms" element={<RoomsSelectPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
