import React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../../lib/cn'

export const Tabs = TabsPrimitive.Root

export function TabsList({ children, className = '', ...props }) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-full bg-subsurface border border-border',
        className
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  )
}

export function TabsTrigger({ children, className = '', ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 rounded-full text-xs font-semibold text-muted transition-all cursor-pointer select-none active:scale-[0.98] hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-bold data-[state=active]:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({ children, className = '', ...props }) {
  return (
    <TabsPrimitive.Content
      className={cn('mt-3 focus-visible:outline-none', className)}
      {...props}
    >
      {children}
    </TabsPrimitive.Content>
  )
}
