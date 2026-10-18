export interface ServiceToken<T> {
  readonly id: string
  readonly __service?: T
}

export function defineService<T>(id: string): ServiceToken<T> {
  return Object.freeze({ id }) as ServiceToken<T>
}
