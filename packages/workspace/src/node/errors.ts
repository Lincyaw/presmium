import { errorMessage, jsonResponse, problemResponse } from '@lincyaw/kernel'

export class RequestError extends Error {
  readonly status: number
  readonly detail?: Record<string, unknown>
  constructor(status: number, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

/** Runs a route's work and answers a RequestError it throws with its status and detail, anything else with 500. */
export async function catchRequestErrors(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse({ error: error.message, ...error.detail }, error.status)
    return problemResponse(500, errorMessage(error))
  }
}
