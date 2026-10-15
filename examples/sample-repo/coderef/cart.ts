// Sample business code for the code reference demo (examples/demo/pages/code.md).
// Its history is part of the demo: the slides pin this file to commits and compare them.

export interface Item {
  name: string
  price: number
  quantity: number
}

export function total(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0)
}

// #region checkout
export function checkout(items: Item[], coupon?: string): string {
  // #region validate
  if (items.length === 0)
    throw new Error('cart is empty')
  // #endregion validate
  // #region price
  const subtotal = total(items.map(item => item.price * item.quantity))
  const discount = coupon === 'SAVE10' ? subtotal * 0.1 : 0
  // #endregion price
  // #region receipt
  return `total: ${(subtotal - discount).toFixed(2)}`
  // #endregion receipt
}
// #endregion checkout
