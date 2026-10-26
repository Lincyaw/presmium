// #region checkout
export function total(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0)
}
// #endregion checkout
