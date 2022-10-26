import EventEmitter from 'eventemitter3'

import type {Options} from './options'
import {MessageError, SocketError} from './errors'

const global = globalThis || window

export enum ListenerEncoding {
    binary = 'binary',
    text = 'text',
    json = 'json',
}

export interface ListenerOptions extends Options {
    /** Auto-connect when instantiated, defaults to true. */
    autoConnect?: boolean
    /** Attempt to parse incoming messages as JSON. */
    json?: boolean
    /** Receive encoding for incoming messages, defaults to text. */
    encoding?: ListenerEncoding
    /** WebSocket class to use, if unset will try to use global WebSocket. */
    WebSocket?: any
}

export class Listener extends EventEmitter {
    readonly url: string

    private active = false
    private socket?: WebSocket
    private timer?: any
    private reconnectTimer?: any
    private encoding: ListenerEncoding
    private WebSocket: typeof WebSocket

    constructor(options: ListenerOptions) {
        super()
        if (!options.service) {
            throw new Error('Options must include a service url')
        }
        if (!options.channel) {
            throw new Error('Options must include a channel name')
        }
        const baseUrl = options.service.replace(/^http/, 'ws').replace(/\/$/, '')
        this.url = `${baseUrl}/${options.channel}?v=2`
        this.encoding = options.encoding || ListenerEncoding.text
        this.WebSocket = options.WebSocket || global.WebSocket
        if (options.autoConnect !== false) {
            this.connect()
        }
    }

    connect() {
        if (this.active) return
        this.active = true
        let retries = 0
        let pingTimer: any

        const connect = () => {
            const socket = new this.WebSocket(this.url)
            socket.onmessage = (event) => {
                if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
                    const reader = new FileReader()
                    reader.onload = () => {
                        this.handleMessage(new Uint8Array(reader.result as ArrayBuffer))
                    }
                    reader.onerror = () => {
                        this.emit('error', new MessageError('Could not read message'))
                    }
                    reader.readAsArrayBuffer(event.data)
                } else if (typeof event.data === 'string') {
                    this.handleMessage(new TextEncoder().encode(event.data))
                } else if (
                    typeof global.Buffer !== 'undefined' &&
                    (event.data instanceof global.Buffer || Array.isArray(event.data))
                ) {
                    let buffer = event.data
                    if (!global.Buffer.isBuffer(buffer)) {
                        buffer = global.Buffer.concat(buffer)
                    }
                    this.handleMessage(
                        new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
                    )
                } else if (event.data instanceof Uint8Array) {
                    this.handleMessage(event.data)
                } else if (event.data instanceof ArrayBuffer) {
                    this.handleMessage(new Uint8Array(event.data))
                } else {
                    this.emit('error', new MessageError('Unhandled event data type'))
                }
            }
            socket.onerror = (event) => {
                if (this.socket === socket && this.active) {
                    this.emit('error', new SocketError(event))
                }
            }
            socket.onopen = () => {
                retries = 0
                this.emit('connect')
            }
            socket.onclose = () => {
                if (this.active) {
                    clearTimeout(this.timer)
                    this.timer = setTimeout(connect, backoff(retries++))
                }
                this.socket = undefined
                clearTimeout(pingTimer)
                if (this.reconnectTimer) {
                    clearInterval(this.reconnectTimer)
                }
                this.emit('disconnect')
            }

            // Reconnect every 10 mins to keep the connection alive
            this.setupReconnectionTimer()
            // fix problem where node.js does not react to the socket going down
            // this terminates the connection if we don't get a heartbeat in 15s (buoy-nodejs sends every 10s)
            const nodeSocket = socket as any
            if (typeof nodeSocket.on === 'function' && typeof nodeSocket.terminate === 'function') {
                nodeSocket.on('ping', () => {
                    clearTimeout(pingTimer)
                    pingTimer = setTimeout(() => {
                        nodeSocket.terminate()
                    }, 15 * 1000)
                })
            }
            this.socket = socket
        }
        connect()
    }

    disconnect() {
        this.active = false
        if (
            this.socket &&
            (this.socket.readyState === this.WebSocket.OPEN ||
                this.socket.readyState === this.WebSocket.CONNECTING)
        ) {
            this.socket.close(1000)
        }
    }

    get isConnected(): boolean {
        return this.active && this.socket?.readyState == this.WebSocket.OPEN
    }

    private handleMessage(bytes: Uint8Array) {
        if (bytes[0] === 0x42 && bytes[1] === 0x42 && bytes[2] === 0x01) {
            this.socket?.send(new Uint8Array([0x42, 0x42, 0x02, bytes[3]]))
            bytes = bytes.subarray(4)
        }
        let message: any
        switch (this.encoding) {
            case ListenerEncoding.binary:
                message = bytes
                break
            case ListenerEncoding.text:
                message = new TextDecoder().decode(bytes)
                break
            case ListenerEncoding.json: {
                try {
                    message = JSON.parse(new TextDecoder().decode(bytes))
                } catch (error) {
                    this.emit('error', new MessageError('Unable to decode JSON', error))
                    return
                }
            }
        }
        this.emit('message', message)
    }

    private setupReconnectionTimer() {
        this.reconnectTimer = setInterval(() => {
            this.socket?.close(1000)
        }, 10 * 60 * 1000)
    }
}

/**
 * Exponential backoff function that caps off at 5s after 10 tries.
 * @internal
 */
function backoff(tries: number): number {
    return Math.min(Math.pow(tries * 7, 2), 5 * 1000)
}
