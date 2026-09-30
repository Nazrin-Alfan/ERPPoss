import { describe, it, expect } from 'vitest'
import {
  addToCart,
  updateQty,
  updateItemNotes,
  removeFromCart
} from '../cartHelpers'

describe('Cart Helpers', () => {
  const initialCart = [
    { nama_menu: 'Espresso', harga: 15000, qty: 1 },
    { nama_menu: 'Americano', harga: 20000, qty: 2 }
  ]

  describe('addToCart', () => {
    it('should add a new item to the cart with qty = 1', () => {
      const newMenu = { nama_menu: 'Latte', harga: 25000 }
      const nextCart = addToCart(initialCart, newMenu)
      
      expect(nextCart.length).toBe(3)
      expect(nextCart[2]).toEqual({ nama_menu: 'Latte', harga: 25000, qty: 1, catatan: '' })
    })

    it('should increment quantity if item already exists in cart', () => {
      const existingMenu = { nama_menu: 'Espresso', harga: 15000 }
      const nextCart = addToCart(initialCart, existingMenu)

      expect(nextCart.length).toBe(2)
      expect(nextCart[0]).toEqual({ nama_menu: 'Espresso', harga: 15000, qty: 2 })
    })
  })

  describe('updateQty', () => {
    it('should increment/decrement quantity of a specific item based on delta', () => {
      // Tambah qty Americano dari 2 menjadi 3
      let nextCart = updateQty(initialCart, 'Americano', 1)
      expect(nextCart.find(item => item.nama_menu === 'Americano').qty).toBe(3)

      // Kurang qty Americano dari 2 menjadi 1
      nextCart = updateQty(initialCart, 'Americano', -1)
      expect(nextCart.find(item => item.nama_menu === 'Americano').qty).toBe(1)
    })

    it('should remove the item from cart if qty falls to or below 0', () => {
      // Kurang qty Espresso dari 1 menjadi 0
      const nextCart = updateQty(initialCart, 'Espresso', -1)
      expect(nextCart.length).toBe(1)
      expect(nextCart.find(item => item.nama_menu === 'Espresso')).toBeUndefined()
    })

    it('should return cart unmodified if item is not found', () => {
      const nextCart = updateQty(initialCart, 'Cappuccino', 1)
      expect(nextCart).toEqual(initialCart)
    })
  })

  describe('removeFromCart', () => {
    it('should completely remove an item from the cart', () => {
      const nextCart = removeFromCart(initialCart, 'Espresso')
      expect(nextCart.length).toBe(1)
      expect(nextCart.find(item => item.nama_menu === 'Espresso')).toBeUndefined()
    })

    it('should return the cart unmodified if item is not found', () => {
      const nextCart = removeFromCart(initialCart, 'Cappuccino')
      expect(nextCart).toEqual(initialCart)
    })
  })

  describe('updateItemNotes', () => {
    it('should attach or modify notes for a specific menu item in cart', () => {
      const nextCart = updateItemNotes(initialCart, 'Espresso', 'Less Sugar, Double Shot')
      expect(nextCart[0].catatan).toBe('Less Sugar, Double Shot')
      expect(nextCart[1].catatan).toBeUndefined()
    })
  })
})
