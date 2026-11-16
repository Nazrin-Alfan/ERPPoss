import React, { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const InteractiveCalendar = ({ startDate, endDate, onChange, onClose }) => {
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())

  const parsedStart = useMemo(() => startDate ? new Date(startDate) : null, [startDate])
  const parsedEnd = useMemo(() => endDate ? new Date(endDate) : null, [endDate])

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate()
    const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate()

    const list = []

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      list.push({
        dayNum: prevMonthTotalDays - i,
        isCurrentMonth: false,
        dateString: ''
      })
    }

    for (let i = 1; i <= totalDays; i++) {
      const dStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      list.push({
        dayNum: i,
        isCurrentMonth: true,
        dateString: dStr
      })
    }

    const remaining = 42 - list.length
    for (let i = 1; i <= remaining; i++) {
      list.push({
        dayNum: i,
        isCurrentMonth: false,
        dateString: ''
      })
    }

    return list
  }, [currentYear, currentMonth])

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const handleDayClick = (dayNum, isCurrentMonth) => {
    if (!isCurrentMonth) return
    const clickedDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    
    if (!startDate || (startDate && endDate)) {
      onChange(clickedDateStr, '')
    } else {
      const d1 = new Date(startDate)
      const d2 = new Date(clickedDateStr)
      if (d2 < d1) {
        onChange(clickedDateStr, startDate)
      } else {
        onChange(startDate, clickedDateStr)
        if (onClose) setTimeout(onClose, 200)
      }
    }
  }

  return (
    <div className="bg-[#121215]/95 border border-[#26272d] rounded-2xl p-4 sm:p-5 shadow-2xl w-full max-w-[320px] sm:w-80 text-xs text-zinc-200 font-sans select-none backdrop-blur-xl">
      {/* Month Header Navigation */}
      <div className="flex justify-between items-center mb-5 px-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="text-slate-400 hover:text-brand-emerald transition-colors p-1"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-bold text-sm text-white font-sans tracking-wide">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          className="text-slate-400 hover:text-brand-emerald transition-colors p-1"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 gap-1 text-center font-semibold text-slate-500 mb-2">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="py-1 text-xs">{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          const isSelectedStart = parsedStart && day.dateString === startDate
          const isSelectedEnd = parsedEnd && day.dateString === endDate
          const isInRange = parsedStart && parsedEnd && day.dateString > startDate && day.dateString < endDate

          let dayStyle = 'text-slate-600 opacity-20 cursor-default'
          if (day.isCurrentMonth) {
            if (isSelectedStart) {
              dayStyle = 'bg-brand-emerald text-slate-950 font-black shadow-[0_0_12px_rgba(16,185,129,0.45)] rounded-xl'
            } else if (isSelectedEnd) {
              dayStyle = 'bg-brand-blue text-slate-950 font-black shadow-[0_0_12px_rgba(6,182,212,0.45)] rounded-xl'
            } else if (isInRange) {
              dayStyle = 'bg-brand-emerald/10 text-brand-emerald font-bold rounded-lg'
            } else {
              dayStyle = 'text-slate-200 hover:bg-slate-800 hover:text-white rounded-lg cursor-pointer'
            }
          }

          return (
            <div
              key={`${day.dayNum}-${idx}`}
              onClick={() => handleDayClick(day.dayNum, day.isCurrentMonth)}
              className={`aspect-square flex items-center justify-center transition-all duration-150 ${dayStyle}`}
              style={{ height: '2.4rem', width: '2.4rem' }}
            >
              <span className="text-xs font-semibold">{day.dayNum}</span>
            </div>
          )
        })}
      </div>

      {/* Selection Footer */}
      <div className="flex justify-between items-center text-[10px] mt-4 pt-3 border-t border-slate-900 text-slate-500">
        <div>
          {startDate ? (
            <span className="text-brand-emerald font-bold">{startDate}</span>
          ) : (
            <span>Mulai</span>
          )}
          {endDate && (
            <>
              <span className="mx-1">s/d</span>
              <span className="text-brand-blue font-bold">{endDate}</span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => onChange('', '')}
              className="text-slate-500 hover:text-slate-350 font-semibold"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-brand-emerald hover:text-white font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default InteractiveCalendar
