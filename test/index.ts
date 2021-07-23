import {assert} from 'chai'
import fetch from 'cross-fetch'
import WebSocket from 'isomorphic-ws'

import * as lib from '$lib'

const channel = `buoy-client-test-${Math.round(Math.random() * Number.MAX_SAFE_INTEGER)}`
const service = process.env.BUOY_URL || 'https://cb.anchor.link'

const options = {channel, service, fetch, WebSocket}

suite('listener', function () {
    this.timeout(10 * 1000)
    this.slow(5 * 1000)

    test('connect / disconnect', function (done) {
        const listener = new lib.Listener({...options, autoConnect: false})
        let didDisconnect = false
        listener.on('connect', () => {
            assert.isTrue(listener.isConnected)
            listener.disconnect()
            listener.disconnect()
            if (didDisconnect) {
                done()
            }
        })
        listener.on('disconnect', () => {
            if (!didDisconnect) {
                assert.isFalse(listener.isConnected)
                didDisconnect = true
                listener.connect()
            }
        })
        listener.connect() // should be robust to multiple calls
        listener.connect()
    })

    test('reconnect', function (done) {
        const listener = new lib.Listener(options)
        let didClose = false
        listener.on('error', (error) => {
            assert.isTrue(error instanceof lib.SocketError)
        })
        listener.on('connect', () => {
            if (didClose) {
                done()
                listener.disconnect()
            } else {
                const socket = (listener as any).socket as WebSocket
                socket.onerror({} as any)
                socket.close(1000, 'Go away!')
                didClose = true
            }
        })
    })

    test('messages', function (done) {
        const listener = new lib.Listener(options)
        listener.on('error', (error) => {
            done(error)
        })
        const messages: string[] = []
        listener.on('message', (data) => {
            messages.push(data)
            if (messages.length === 2) {
                assert.deepEqual(messages, ['foo', 'bar'])
                listener.disconnect()
                done()
            } else {
                lib.send('bar', options).catch(done)
            }
        })
        lib.send('foo', options).catch(done)
    })
})

suite('send / receive', function () {
    this.timeout(10 * 1000)
    this.slow(5 * 1000)

    test('send & receive', async function () {
        const sendPromise = lib.send('foo', options)
        const receivePromise = lib.receive(options)
        const result = await Promise.all([sendPromise, receivePromise])
        assert.deepEqual(result, [lib.SendResult.buffered, 'foo'])
    })

    test('send & receive binary', async function () {
        const sendPromise = lib.send(new Uint8Array([0x01, 0x02, 0x03]), options)
        const receivePromise = lib.receive({...options, encoding: lib.ListenerEncoding.binary})
        const result = await Promise.all([sendPromise, receivePromise])
        assert.deepEqual(result, [lib.SendResult.buffered, new Uint8Array([0x01, 0x02, 0x03])])
    })

    test('send & receive json', async function () {
        const sendPromise = lib.send({foo: {bar: {baz: [-420]}}}, options)
        const receivePromise = lib.receive({...options, encoding: lib.ListenerEncoding.json})
        const result = await Promise.all([sendPromise, receivePromise])
        assert.deepEqual(result, [lib.SendResult.buffered, {foo: {bar: {baz: [-420]}}}])
    })

    test('receive timeout', function (done) {
        lib.receive({...options, timeout: 100, channel: `${channel}-timeout`})
            .catch((error) => error)
            .then((error) => {
                assert.equal(error.message, 'Timed out')
                done()
            })
    })

    test('receive cancel', function (done) {
        const ctx: lib.ReceiveContext = {}
        setTimeout(() => {
            ctx.cancel!()
        }, 100)
        lib.receive({...options, channel: `${channel}-cancel`}, ctx)
            .catch((error) => error)
            .then((error) => {
                assert.equal(error.message, 'Cancelled')
                done()
            })
    })

    test('send timeout', function (done) {
        lib.send('foo', {...options, timeout: 1000, requireDelivery: true})
            .catch((error) => error)
            .then((error) => {
                assert.equal(error.message, 'Unable to deliver message')
                done()
            })
    })

    test('send soft timeout', function (done) {
        const start = Date.now()
        lib.send('foo', {...options, timeout: 1000})
            .then((result) => {
                assert.isAbove(Date.now() - start, 1000)
                assert.equal(result, 'buffered')
                done()
            })
            .catch(done)
    })

    test('send race', function (done) {
        let sendError: Error | undefined
        lib.send('foo1', {...options, timeout: 1000}).catch((error) => {
            sendError = error
        })
        setTimeout(() => {
            lib.send('foo2', {...options, timeout: 2000}).catch(done)
        }, 200)
        setTimeout(() => {
            lib.receive({...options})
                .catch(done)
                .then((result) => {
                    assert.equal(sendError?.message, 'Request cancelled')
                    assert.equal(result, 'foo2')
                    done()
                })
        }, 500)
    })
})
