import React from 'react'
import { useMap } from '@state/mapStore'
import RoomList from './RoomList'
import RoomForm from './RoomForm'
import Toolbar from './Toolbar'
import PersistenceBar from './PersistenceBar'
import '../styles/layout.scss'

export default function MapEditor() {
  const { state } = useMap()
  const selectedVnum = state.selected

  return (
    <div className="layout">
      <aside className="sidebar">
        <RoomList />
      </aside>
      <main className="main">
        <Toolbar />
        <PersistenceBar />
        <div className="content">
          {selectedVnum ? (
            <RoomForm vnum={selectedVnum} />
          ) : (
            <div style={{ opacity: 0.6, padding: 12 }}>
              Select a room on the left to edit.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
