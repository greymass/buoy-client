import {MessageError, SocketError} from './errors'
import {Listener, ListenerOptions} from './listener'

export interface ReceiveContext {
    /** Can be called by sender to cancel the receive. */
    cancel?: () => void
}

export interface ReceiveOptions extends ListenerOptions {
    /** How many milliseconds to wait before giving up. */
    timeout?: number
}

/**
 * Receive a single message from a buoy channel.
 * @note Instantiate a [[Listener]] if you want to receive multiple messages over the same channel.
 */
export function receive(options: ReceiveOptions, ctx?: ReceiveContext): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        const listener = new Listener({...options, autoConnect: true})
        let timer: any
        let lastError: Error | undefined
        const done = (error?: Error, message?: any) => {
            clearTimeout(timer)
            if (error) {
                reject(error)
            } else {
                resolve(message)
            }
            listener.disconnect()
        }
        if (ctx) {
            ctx.cancel = () => {
                done(new MessageError('Cancelled', lastError))
            }
        }
        if (options.timeout) {
            timer = setTimeout(() => {
                done(new MessageError('Timed out', lastError))
            }, options.timeout)
        }
        listener.on('error', (error) => {
            if (!(error instanceof SocketError)) {
                done(error)
            } else {
                lastError = error
            }
        })
        listener.once('message', (message) => {
            done(undefined, message)
        })
    })
}
