import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind v4 class names safely without style collisions.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export default cn
