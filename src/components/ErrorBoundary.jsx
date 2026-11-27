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
        <div className="min-h-[400px] bg-canvas text-foreground flex items-center justify-center p-6">
          <div className="max-w-md w-full p-6 rounded-2xl border border-destructive/30 bg-surface text-center space-y-4 shadow-sm">
            <div className="w-12 h-12 mx-auto rounded-xl bg-destructive-bg text-destructive border border-destructive/25 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Terjadi Kendala Memuat Tampilan</h3>
              <p className="text-xs text-muted mt-1">
                {this.state.error?.message || 'Gagal merender komponen halaman.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-5 py-2.5 min-h-[44px] bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-full text-xs transition-all active:scale-[0.98] flex items-center gap-2 mx-auto shadow-xs cursor-pointer"
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
