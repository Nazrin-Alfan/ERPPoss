import React from 'react'

export function Card({
  children,
  className = '',
  hover = false,
  ...props
}) {
  return (
    <div
      className={`bg-[#121215] border border-[#26272d] rounded-xl shadow-xs ${
        hover ? 'hover:border-[#3f414a] transition-colors' : ''
      } ${className}`}
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
    <div className={`p-4 sm:p-5 border-b border-[#26272d] ${className}`} {...props}>
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
    <div className={`p-4 sm:p-5 ${className}`} {...props}>
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
    <div className={`p-4 sm:p-5 border-t border-[#26272d] ${className}`} {...props}>
      {children}
    </div>
  )
}

export default Card
