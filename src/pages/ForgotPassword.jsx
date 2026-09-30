import React, { useState } from 'react'
import { api } from '../services/apiAdapter'
import { Link } from 'react-router-dom'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.auth.forgotPassword(email)
      // In a real system we'd email the token. Here we just show it.
      setToken(res.token)
    } catch (err) {
      setError(err.message || 'Gagal meminta reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-xl w-96">
        <h2 className="text-xl font-bold text-center mb-4 text-white">Lupa Kata Sandi</h2>
        {error && <p className="text-red-400 mb-2">{error}</p>}
        {token ? (
          <div className="text-center">
            <p className="mb-2 text-amber-300">Token reset (untuk testing):</p>
            <code className="bg-slate-800 p-2 rounded text-white break-all">{token}</code>
            <p className="mt-4 text-sm text-slate-400">
              Salin token tersebut ke URL reset password: <br />
              <code className="bg-slate-800 p-1 rounded text-white">/reset-password?token=YOUR_TOKEN</code>
            </p>
            <Link to="/login" className="mt-4 inline-block text-amber-400 underline">Kembali ke Login</Link>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold py-2 rounded disabled:opacity-50"
            >
              {loading ? 'Mengirim...' : 'Minta Reset'}
            </button>
            <div className="mt-4 text-center text-sm text-slate-400">
              <Link to="/login" className="underline hover:text-amber-300">Kembali ke Login</Link>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
