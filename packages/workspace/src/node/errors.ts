import { errorMessage, jsonResponse, problemResponse } from '@lincyaw/kernel'

export class RequestError extends Error {
  readonly status: number
  readonly detail?: Record<string, unknown>
  readonly headers?: Record<string, string>
  constructor(status: number, message: string, detail?: Record<string, unknown>, headers?: Record<string, string>) {
    super(message)
    this.status = status
    this.detail = detail
    this.headers = headers
  }
}

/** Runs a route's work and answers a RequestError it throws with its status, detail and headers, anything else with 500. */
export async function catchRequestErrors(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse({ error: error.message, ...error.detail }, error.status, error.headers)
    return problemResponse(500, errorMessage(error))
  }
}
