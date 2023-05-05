/*
 * Copyright 2021 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createServer, Server, Socket } from 'net'
const BitStream = require('bit-buffer').BitStream

interface SocketWithId extends Socket {
  id?: number
  name?: string
}

export default function (app: any) {
  const error = app.error
  const debug = app.debug
  let props: any
  let onStop:any = []
  let sockets: SocketWithId[] = []
  const unsubscribes:any = []  
  
  const plugin: Plugin = {
    start: function (properties: any) {
      props = properties

      let server: Server | null
      const port = Number(35000)

      server = createServer((socket: SocketWithId) => {
        sockets.push(socket)
        socket.name = socket.remoteAddress + ':' + socket.remotePort
        debug('Connected:' + ' ' + socket.name)
        
        socket.on('error', (err: Error) => {
          debug('Error:' + err + ' ' +  socket.name)
        })
        socket.on('close', (hadError) => {
          debug('Close:' + hadError + ' ' + socket.name)
        })

        subscribeIfNeeded()
        
        socket
          //.on('data', socketMessageHandler(app, socket, unsubscibes))
          .on('error', (err: Error) => {
            console.error(err)
          })
        socket.on('end', () => {
          //unsubscibes.forEach((f) => f())
          debug('Ended:' + socket.name)

          sockets.splice(sockets.indexOf(socket), 1)
          if ( sockets.length === 0 ) {
            debug('unsubscribe, no more sockets')
            unsubscribes.forEach(function (func: () => void) {
              func()
            })
            unsubscribes.length = 0
          }
        })
      })

      server.listen(port)
      debug('Linstening on ' + port)
    },

    stop: function () {
      onStop.forEach((f:any) => f())
      onStop = []
      unsubscribes.forEach(function (func: () => void) {
        func()
      })
      unsubscribes.length = 0
    },

    id: 'signalk-realdash',
    name: 'Signal K RealDash',
    description: 'Signal K Plugin providing RealDash CAN Data',

    schema: () => {
      const schema: any = {
        type: 'object',
        properties: {}
      }
      return schema
    },
  }

  function subscribeIfNeeded() {
    if ( unsubscribes.length === 0 ) {
      const subs:any = []
      const command = {
        context: 'vessels.self',
        subscribe: subs
      }

      Object.keys(writers).forEach((k:string) => {
        command.subscribe.push({
          path: k,
          policy: 'instant'
        })
      })
      
      debug('subscribing')
      app.subscriptionmanager.subscribe(
        command,
        unsubscribes,
        (error: any) => {
          app.error(error)
        },
        gotDelta
      )
    }
  }

  function gotDelta(delta:any ) {
    delta.updates.forEach(function (update: any) {
      update.values.forEach(function (vp: any) {

        let writer = writers[vp.path]

        if ( writer ) {
          let bs = new BitStream(Buffer.alloc(16))
          //buf.fill(0)
        
          bs.writeUint8(0x44)
          bs.writeUint8(0x33)
          bs.writeUint8(0x22)
          bs.writeUint8(0x11)

          bs.writeUint32(writer.frameId)
          writer.write(bs, vp)
          //bs.writeUint32(0x300)
          //bs.writeUint16(vp.value*60)
          
          let buf = bs.view.buffer.slice(0, 16)

          debug('sending %s %j ', vp.path, buf.toString('hex'))
          sockets.forEach((socket: SocketWithId) => {
          socket.write(buf)
            //socket.write('hello\n')
          })
        }
      })
    })
  }

  const writers:any = {
    'propulsion.port.revolutions': {
      frameId: 0x300,
      write: (bs:any, vp:any) => {
        bs.writeUint16(vp.value*60)
      }
    },
    'environment.wind.speedOverGround': {
      frameId:0x301,
      write:(bs:any, vp:any) => {
        bs.writeUint16(vp.value*2.237)
        bs.writeUint16(vp.value*2.237)
      }
    }
  }
  
  return plugin
}

interface Plugin {
  start: (app: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
}

