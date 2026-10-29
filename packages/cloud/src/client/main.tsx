import { createRoot } from 'react-dom/client'
import '@lincyaw/design/design.css'
import './styles.css'
import App from './App.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('cloud-root-unavailable')
createRoot(root).render(<App />)
