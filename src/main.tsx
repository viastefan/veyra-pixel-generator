import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import Homepage from './Homepage'

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
const Root = normalizedPath === '/homepage' ? Homepage : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
