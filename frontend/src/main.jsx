import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
      <Toaster position="top-right" toastOptions={{
        style: { background: '#0f3d2e', color: '#a8e6cf', border: '1px solid rgba(168,230,207,0.2)' }
      }} />
    </AuthProvider>
  </BrowserRouter>
)
