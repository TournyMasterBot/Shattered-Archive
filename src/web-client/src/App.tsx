import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)
  const gameServerEndpoint = __VITE_ENV__.VITE_GAME_SERVER;
  const webServerEndpoint = __VITE_ENV__.VITE_WEB_SERVER;
  
  return (
    <>
      <div>
        <h1>Web Client</h1>
        <a href={gameServerEndpoint} target="_blank">{gameServerEndpoint}</a>
        <br />
        <a href={webServerEndpoint} target="_blank">{webServerEndpoint}</a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
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
  )
}

export default App
