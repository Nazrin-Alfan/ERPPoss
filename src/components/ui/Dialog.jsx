import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  children,
  className = '',
  showClose = true,
  ...props
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-fade-in data-[state=closed]:opacity-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-1.5rem)] max-w-lg max-h-[90dvh] flex flex-col overflow-hidden bg-surface border border-border rounded-2xl text-foreground shadow-2xl focus:outline-none animate-pop-in',
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label="Tutup dialog"
            className="absolute right-4 top-4 w-9 h-9 rounded-full bg-subsurface hover:bg-surface-hover border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} strokeWidth={2} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ children, className = '', ...props }) {
  return (
    <div className={cn('px-5 py-4 border-b border-border shrink-0 pr-14', className)} {...props}>
      {children}
    </div>
  )
}

export function DialogTitle({ children, className = '', ...props }) {
  return (
    <DialogPrimitive.Title className={cn('text-base font-bold text-foreground', className)} {...props}>
      {children}
    </DialogPrimitive.Title>
  )
}

export function DialogDescription({ children, className = '', ...props }) {
  return (
    <DialogPrimitive.Description className={cn('text-xs text-muted mt-0.5', className)} {...props}>
      {children}
    </DialogPrimitive.Description>
  )
}

export function DialogBody({ children, className = '', ...props }) {
  return (
    <div className={cn('p-5 overflow-y-auto flex-1 min-h-0 space-y-4 overscroll-contain', className)} {...props}>
      {children}
    </div>
  )
}

export function DialogFooter({ children, className = '', ...props }) {
  return (
    <div className={cn('px-5 py-3.5 border-t border-border bg-subsurface/60 shrink-0 flex items-center justify-end gap-2.5', className)} {...props}>
      {children}
    </div>
  )
}
