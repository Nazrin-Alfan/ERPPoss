import React, { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const InteractiveCalendar = ({ startDate, endDate, onChange, onClose }) => {
  const calendarRef = useRef(null)
  const initialDate = useMemo(() => {
    if (startDate) {
      const parsed = new Date(`${startDate}T00:00:00`)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return new Date()
  }, [startDate])

  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth())

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && onClose) {
        onClose()
      }
    }

    const handlePointerDownOutside = (event) => {
      if (!calendarRef.current) return
      const anchorGroup = calendarRef.current.parentElement?.parentElement
      const containerToCheck = anchorGroup || calendarRef.current
      if (!containerToCheck.contains(event.target) && onClose) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDownOutside)
    document.addEventListener('touchstart', handlePointerDownOutside, { passive: true })

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDownOutside)
      document.removeEventListener('touchstart', handlePointerDownOutside)
    }
  }, [onClose])

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

    const totalCells = Math.ceil((firstDayIndex + totalDays) / 7) * 7
    const remaining = Math.max(0, totalCells - list.length)
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
    <div
      ref={calendarRef}
      role="dialog"
      aria-label="Pilih rentang tanggal"
      className="bg-[#121215]/95 border border-[#26272d] rounded-xl p-3 sm:p-3.5 shadow-2xl w-64 sm:w-[272px] max-w-[calc(100vw-1.5rem)] text-xs text-zinc-200 font-sans select-none backdrop-blur-xl"
    >
      {/* Month Header Navigation */}
      <div className="flex justify-between items-center mb-2.5 px-0.5">
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label="Bulan sebelumnya"
          className="text-[#bbcbb2] hover:text-[#00ffff] hover:bg-[#18181c] rounded-lg transition-all p-1.5 cursor-pointer active:scale-[0.98]"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="font-bold text-xs sm:text-[13px] text-white font-sans tracking-tight">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="Bulan berikutnya"
          className="text-[#bbcbb2] hover:text-[#00ffff] hover:bg-[#18181c] rounded-lg transition-all p-1.5 cursor-pointer active:scale-[0.98]"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 gap-0.5 text-center font-semibold text-[#6b7367] mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="py-0.5 text-[10px] uppercase tracking-wider">{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map((day, idx) => {
          const isSelectedStart = parsedStart && day.dateString === startDate
          const isSelectedEnd = parsedEnd && day.dateString === endDate
          const isInRange = parsedStart && parsedEnd && day.dateString > startDate && day.dateString < endDate

          let dayStyle = 'text-zinc-600/35 cursor-default'
          if (day.isCurrentMonth) {
            if (isSelectedStart || isSelectedEnd) {
              dayStyle = 'bg-[#00ffff] text-[#0f0f0f] font-bold rounded-lg shadow-xs active:scale-[0.98] cursor-pointer'
            } else if (isInRange) {
              dayStyle = 'bg-[#00ffff]/15 text-[#00ffff] font-semibold rounded-md active:scale-[0.98] cursor-pointer'
            } else {
              dayStyle = 'text-zinc-200 hover:bg-[#18181c] hover:text-white rounded-lg active:scale-[0.98] cursor-pointer'
            }
          }

          return (
            <button
              key={`${day.dayNum}-${idx}`}
              type="button"
              disabled={!day.isCurrentMonth}
              data-calendar-day={day.dateString || 'outside'}
              onClick={() => handleDayClick(day.dayNum, day.isCurrentMonth)}
              className={`h-8 w-8 mx-auto flex items-center justify-center transition-all duration-150 font-mono tabular-nums text-[11px] ${dayStyle}`}
            >
              <span>{day.dayNum}</span>
            </button>
          )
        })}
      </div>

      {/* Selection Footer */}
      <div className="flex justify-between items-center text-[10px] mt-2.5 pt-2.5 border-t border-[#26272d] text-[#6b7367]">
        <div className="font-mono tabular-nums truncate pr-2">
          {startDate ? (
            <span className="text-[#00ffff] font-bold">{startDate}</span>
          ) : (
            <span>Pilih tanggal</span>
          )}
          {endDate && (
            <>
              <span className="mx-1 text-[#6b7367]">–</span>
              <span className="text-[#00ffff] font-bold">{endDate}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => onChange('', '')}
              className="px-2 py-1 rounded-md text-[#bbcbb2] hover:text-white hover:bg-[#18181c] font-semibold transition-all cursor-pointer active:scale-[0.98]"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded-md bg-[#00ffff]/15 hover:bg-[#00ffff]/25 text-[#00ffff] border border-[#00ffff]/30 font-bold transition-all cursor-pointer active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default InteractiveCalendar
