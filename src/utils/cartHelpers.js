export const addToCart = (cart, menu) => {
  const existing = cart.find(item => item.nama_menu === menu.nama_menu)
  if (existing) {
    return cart.map(item => 
      item.nama_menu === menu.nama_menu ? { ...item, qty: item.qty + 1 } : item
    )
  }
  return [...cart, { ...menu, qty: 1, catatan: menu.catatan || '' }]
}

export const updateQty = (cart, menuName, delta) => {
  return cart.map(item => {
    if (item.nama_menu === menuName) {
      const newQty = item.qty + delta
      return newQty > 0 ? { ...item, qty: newQty } : null
    }
    return item
  }).filter(Boolean)
}

export const updateItemNotes = (cart, menuName, catatan) => {
  return cart.map(item => {
    if (item.nama_menu === menuName) {
      return { ...item, catatan: catatan || '' }
    }
    return item
  })
}

export const removeFromCart = (cart, menuName) => {
  return cart.filter(item => item.nama_menu !== menuName)
}
