import React from 'react'
import { cn } from '../../lib/cn'

export function Card({
  children,
  className = '',
  hover = false,
  selected = false,
  ...props
}) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-2xl text-foreground shadow-xs transition-colors',
        hover && 'hover:border-border-hover',
        selected && 'bg-selected-surface border-ring ring-1 ring-ring/30',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  children,
  className = '',
  ...props
}) {
  return (
    <div className={cn('p-4 sm:p-5 border-b border-border', className)} {...props}>
      {children}
    </div>
  )
}

export function CardContent({
  children,
  className = '',
  ...props
}) {
  return (
    <div className={cn('p-4 sm:p-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({
  children,
  className = '',
  ...props
}) {
  return (
    <div className={cn('p-4 sm:p-5 border-t border-border', className)} {...props}>
      {children}
    </div>
  )
}

export default Card
