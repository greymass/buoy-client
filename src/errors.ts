/** Emitted when a network error occurs, can safely be ignored. */
export class SocketError extends Error {
    code = 'E_NETWORK'
    constructor(readonly event: Event) {
        super('Socket error')
    }
}

/** Emitted when a message fails to parse or read, non-recoverable. */
export class MessageError extends Error {
    code = 'E_MESSAGE'
    constructor(readonly reason: string, readonly underlyingError?: Error) {
        super(reason)
    }
}
