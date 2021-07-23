import type {Options} from './options'

const global = globalThis || window

/** Options for the [[send]] method. */
interface SendOptions extends Options {
    /**
     * How many milliseconds to wait for delivery.
     * If used in conjunction with requireDelivery the promise will reject
     * if the message is not delivered within the given timeout.
     */
    timeout?: number
    /** Whether to only return on a guaranteed delivery. Can only be used if timeout is set. */
    requireDelivery?: boolean
    /** Fetch function to use, if unset will attempt to use global fetch. */
    fetch?: typeof fetch
}

/** Result of a [[send]] call. */
export enum SendResult {
    /** Message was sent but not yet delivered. */
    buffered = 'buffered',
    /** Message was delivered to at least 1 listener on the channel. */
    delivered = 'delivered',
}

/** A JSON-encodable value. */
type JSONValue = string | number | boolean | null | JSONValue[] | {[key: string]: JSONValue}

/** Data to send, either a string, uint8array or an object that can be JSON encoded. */
export type SendData = string | Uint8Array | JSONValue

/**
 * Sends a message to the channel.
 * @returns a promise that resolves to a [[SendResult]].
 * @throws if the message can't be delivered if [[SendOptions.requireDelivery]] is set.
 */
export async function send(message: SendData, options: SendOptions): Promise<SendResult> {
    const fetch = options.fetch || global.fetch
    const baseUrl = options.service.replace(/^ws/, 'http').replace(/\/$/, '')
    const url = `${baseUrl}/${options.channel}`

    const headers: Record<string, string> = {}
    if (options.requireDelivery) {
        if (!options.timeout) {
            throw new Error('requireDelivery can only be used with timeout')
        }
        headers['X-Buoy-Wait'] = `${Math.ceil(options.timeout / 1000)}`
    } else if (options.timeout) {
        headers['X-Buoy-Soft-Wait'] = `${Math.ceil(options.timeout / 1000)}`
    }

    let body: string | Uint8Array
    if (typeof message === 'string' || message instanceof Uint8Array) {
        body = message
    } else {
        body = JSON.stringify(message)
    }
    const response = await fetch(url, {method: 'POST', body, headers})

    if (Math.floor(response.status / 100) !== 2) {
        if (response.status === 408) {
            throw new Error('Unable to deliver message')
        } else if (response.status === 410) {
            throw new Error('Request cancelled')
        } else {
            throw new Error(`Unexpected status code ${response.status}`)
        }
    }

    return (response.headers.get('X-Buoy-Delivery') || SendResult.buffered) as SendResult
}
