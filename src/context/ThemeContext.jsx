import React, { createContext, useContext, useState, useEffect } from 'react'

export const THEME_STORAGE_KEY = 'relaypos_theme_mode_v5'

/**
 * Operational routes that always default to Pure Carbon Obsidian Dark Mode (Opsi D1).
 */
export const DARK_DEFAULT_ROUTES = ['/pos', '/founder', '/super-admin']

/**
 * Strangler-Fig allowlist of routes migrated to Fintech Cobalt Blue Light Mode.
 * During Phase 3 this starts with ['/ui-kit']; each migrated Phase 4 route is added here.
 * Unmigrated routes stay in Pure Carbon D1 ('dark') so existing light text never turns white-on-white.
 */
export const MIGRATED_LIGHT_ROUTES = ['/ui-kit']

export const themes = {
  1: {
    id: 1,
    mode: 'light',
    name: 'RelayPOS Fintech Cobalt (Light)',
    brandName: 'RelayPOS',
    logo: '/relaypos-logo-b3-light.svg',
    subText: 'Estafet Operations & Multi-Outlet ERP',
    colors: {
      primary: '#2563EB',
      secondary: '#1D4ED8',
      bg: '#F4F6FA',
      bgLight: '#FFFFFF',
      textAccent: '#2563EB'
    }
  },
  2: {
    id: 2,
    mode: 'dark',
    name: 'RelayPOS Pure Carbon Obsidian (D1)',
    brandName: 'RelayPOS',
    logo: '/relaypos-logo-b3-dark.svg',
    subText: 'Pure Carbon POS & Console',
    colors: {
      primary: '#2563EB',
      secondary: '#3B82F6',
      bg: '#09090B',
      bgLight: '#121215',
      textAccent: '#60A5FA'
    }
  }
}

export function resolveSurfaceMode(pathname = '/', preference = 'auto') {
  if (preference === 'light' || preference === 'dark') {
    return preference
  }

  const normalized = String(pathname || '/').split('?')[0]
  if (DARK_DEFAULT_ROUTES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return 'dark'
  }
  if (MIGRATED_LIGHT_ROUTES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return 'light'
  }

  // Strangler-Fig safety default for pages awaiting Phase 4 Light-mode migration
  return 'dark'
}

const ThemeContext = createContext({
  themePreference: 'auto',
  resolvedMode: 'dark',
  isDark: true,
  activeThemeId: 2,
  currentTheme: themes[2],
  setThemePreference: () => {},
  setSurfaceMode: () => {},
  toggleSurfaceMode: () => {},
  setRoutePath: () => {},
  changeTheme: () => {}
})

export const ThemeProvider = ({ children }) => {
  const [themePreference, setThemePreferenceState] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (saved === 'light' || saved === 'dark' || saved === 'auto') {
        return saved
      }
    }
    return 'auto'
  })

  const [routePath, setRoutePath] = useState(() => {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.pathname || '/'
    }
    return '/'
  })

  const resolvedMode = resolveSurfaceMode(routePath, themePreference)
  const isDark = resolvedMode === 'dark'
  const activeThemeId = isDark ? 2 : 1
  const currentTheme = themes[activeThemeId] || themes[2]

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedMode)
    root.classList.toggle('dark', isDark)
    root.classList.toggle('light', !isDark)
    root.style.colorScheme = resolvedMode

    // Transitional CSS variable bridge for any legacy style consumer
    root.style.setProperty('--brand-primary', currentTheme.colors.primary)
    root.style.setProperty('--brand-secondary', currentTheme.colors.secondary)
    root.style.setProperty('--brand-bg', currentTheme.colors.bg)
    root.style.setProperty('--brand-bg-light', currentTheme.colors.bgLight)
    root.style.setProperty('--brand-text-accent', currentTheme.colors.textAccent)
  }, [resolvedMode, isDark, currentTheme])

  const setThemePreference = (nextPref) => {
    const valid = nextPref === 'light' || nextPref === 'dark' || nextPref === 'auto' ? nextPref : 'auto'
    setThemePreferenceState(valid)
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, valid)
    }
  }

  const setSurfaceMode = (mode) => {
    if (mode === 'light' || mode === 'dark' || mode === 'auto') {
      setThemePreference(mode)
    }
  }

  const toggleSurfaceMode = () => {
    const next = resolvedMode === 'dark' ? 'light' : 'dark'
    setThemePreference(next)
  }

  const changeTheme = (id) => {
    if (id === 1 || id === 'light') {
      setThemePreference('light')
    } else if (id === 2 || id === 'dark') {
      setThemePreference('dark')
    }
  }

  return (
    <ThemeContext.Provider
      value={{
        themePreference,
        setThemePreference,
        resolvedMode,
        isDark,
        setSurfaceMode,
        toggleSurfaceMode,
        setRoutePath,
        activeThemeId,
        currentTheme,
        changeTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export const useAppTheme = () => useContext(ThemeContext)
export const useTheme = useAppTheme
