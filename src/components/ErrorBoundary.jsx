import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="glass-panel max-w-md w-full p-6 rounded-2xl border border-rose-500/30 bg-slate-900/90 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Terjadi Kendala Memuat Tampilan</h3>
              <p className="text-xs text-slate-400 mt-1">
                {this.state.error?.message || 'Gagal merender komponen halaman.'}
              </p>
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-4 py-2 bg-brand-blue hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center gap-2 mx-auto shadow-md"
            >
              <RefreshCw size={14} />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
