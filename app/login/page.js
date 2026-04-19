'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleLogin = async () => {
    setMessage('Logging in...')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('SUPABASE ERROR:', error)
        setMessage(`ERROR: ${error.message}`)
        return
      }

      console.log('LOGIN DATA:', data)
      setMessage('SUCCESS: logged in')
    } catch (err) {
      console.error('CATCH ERROR:', err)
      setMessage(`CATCH ERROR: ${err?.message || 'Unknown error'}`)
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Login</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: 'block', marginBottom: 12, padding: 8 }}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: 'block', marginBottom: 12, padding: 8 }}
      />

      <button onClick={handleLogin} style={{ padding: 8 }}>
        Login
      </button>

      <p style={{ marginTop: 20 }}>{message}</p>
    </div>
  )
}
