/** Service tokens: the one runtime value every contract module needs, so they import it from here. */

export interface ServiceToken<T> {
  readonly id: string
  /** Phantom field that carries the service type. Never set at runtime. */
  readonly __service?: T
}

export function defineService<T>(id: string): ServiceToken<T> {
  return Object.freeze({ id }) as ServiceToken<T>
}
