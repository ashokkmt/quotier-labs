import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadDocumentFonts } from './builder/v5/documentFonts.ts'

async function start() {
  try {
    await loadDocumentFonts()
  } catch (error) {
    // A font bootstrap failure must never leave the desktop window blank. The controlled CSS
    // fallbacks remain readable, while the failure is visible in diagnostics during development.
    console.error('Could not load canonical document fonts', error)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
