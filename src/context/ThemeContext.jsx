import React, { createContext, useContext, useState, useEffect } from 'react'

export const themes = {
  1: {
    id: 1,
    name: 'RelayPOS Obsidian & Deep Blue',
    logo: '/relaypos-logo.svg',
    subText: 'Estafet Service & POS',
    colors: {
      primary: '#2563eb', // Executive Deep Slate Blue (not overly bright)
      secondary: '#1e40af', // Rich Sapphire Navy
      bg: '#06090e', // Pure Obsidian Black
      bgLight: '#0d131f', // Deep Midnight Slate
      textAccent: '#60a5fa' // Soft Crisp Blue Accent
    }
  },
  2: {
    id: 2,
    name: 'Luxury Gold & Espresso',
    logo: '/logo_2.jpg',
    subText: 'Carwash & Cafe',
    colors: {
      primary: '#ca8a04', // Rich Gold
      secondary: '#92400e', // Warm Espresso Brown
      bg: '#090706', // Velvet Obsidian
      bgLight: '#181412', // Dark Espresso Ash
      textAccent: '#f59e0b' // Champagne Gold
    }
  },
  3: {
    id: 3,
    name: 'Classic Monochrome',
    logo: '/logo_3.jpg',
    subText: 'Carwash & Cafe',
    colors: {
      primary: '#cbd5e1', // Light Platinum
      secondary: '#64748b', // Steel Slate
      bg: '#09090b', // Carbon Black
      bgLight: '#18181b', // Zinc Dark
      textAccent: '#f8fafc' // Crisp White
    }
  },
  4: {
    id: 4,
    name: 'Aqua Breeze',
    logo: '/logo_4.jpg',
    subText: 'Carwash & Cafe',
    colors: {
      primary: '#6366f1', // Royal Indigo
      secondary: '#ec4899', // Electric Rose
      bg: '#05030a', // Deep Cyber Violet
      bgLight: '#110c22', // Amethyst Chamber
      textAccent: '#c084fc' // Neon Lavender
    }
  }
}

const ThemeContext = createContext({
  activeThemeId: 1,
  currentTheme: themes[1],
  changeTheme: () => {}
})

export const ThemeProvider = ({ children }) => {
  const [activeThemeId, setActiveThemeId] = useState(() => {
    const saved = localStorage.getItem('jb_active_theme')
    return saved ? parseInt(saved, 10) : 1
  })

  const currentTheme = themes[activeThemeId] || themes[1]

  useEffect(() => {
    // Apply colors as CSS variables to root element
    const root = document.documentElement
    root.style.setProperty('--brand-primary', currentTheme.colors.primary)
    root.style.setProperty('--brand-secondary', currentTheme.colors.secondary)
    root.style.setProperty('--brand-bg', currentTheme.colors.bg)
    root.style.setProperty('--brand-bg-light', currentTheme.colors.bgLight)
    root.style.setProperty('--brand-text-accent', currentTheme.colors.textAccent)

    localStorage.setItem('jb_active_theme', activeThemeId.toString())
  }, [activeThemeId, currentTheme])

  const changeTheme = (id) => {
    if (themes[id]) {
      setActiveThemeId(id)
    }
  }

  return (
    <ThemeContext.Provider value={{ activeThemeId, currentTheme, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useAppTheme = () => useContext(ThemeContext)
