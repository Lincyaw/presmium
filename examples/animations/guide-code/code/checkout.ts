// #region checkout
export function total(prices: number[]): number {
  // #region accumulation
  return prices.reduce((sum, price) => sum + price, 0)
  // #endregion accumulation
}
// #endregion checkout
