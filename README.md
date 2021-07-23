buoy-client
===========

Client for buoy message forwarder.

## Installation

The `@greymass/buoy` package is distributed as a module on [npm](https://www.npmjs.com/package/buoy-client).

```
yarn add @greymass/buoy
# or
npm install --save @greymass/buoy
```

## Usage

### Send a message.

```ts
import {send} from '@greymass/buoy'

await send('hello', {service: 'https://cb.anchor.link', channel: 'my-unique-channel-id'})
```

### Receive a message.

```ts
import {receive} from '@greymass/buoy'

const message = await receive({service: 'https://cb.anchor.link', channel: 'my-unique-channel-id'})
```

### Listen for a continuous stream of messages.

```ts
import {Listener} from '@greymass/buoy'

const listener = new Listener({service: 'https://cb.anchor.link', channel: 'my-unique-channel-id'})

listener.on('message', (message) => {
    console.log('message', message)
})

// make sure to subscribe to the error event or they will be thrown
listener.on('error', (error) => {
    console.warn('listener error', error)
})
```

## Developing

You need [Make](https://www.gnu.org/software/make/), [node.js](https://nodejs.org/en/) and [yarn](https://classic.yarnpkg.com/en/docs/install) installed.

Clone the repository and run `make` to checkout all dependencies and build the project. See the [Makefile](./Makefile) for other useful targets. Before submitting a pull request make sure to run `make lint`.

---

Made with ☕️ & ❤️ by [Greymass](https://greymass.com), if you find this useful please consider [supporting us](https://greymass.com/support-us).
