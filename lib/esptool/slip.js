"use strict"

let slip = {}

slip.END = 192
slip.ESC = 219
slip.ESC_END = 220
slip.ESC_ESC = 221

slip.byteArray = function (data, offset, length) {
  return data instanceof ArrayBuffer ? new Uint8Array(data, offset, length) : data
}

slip.expandByteArray = function (arr) {
  let expanded = new Uint8Array(arr.length * 2)
  expanded.set(arr)

  return expanded
}

slip.sliceByteArray = function (arr, start, end) {
  let sliced = arr.buffer.slice ? arr.buffer.slice(start, end) : arr.subarray(start, end)
  return new Uint8Array(sliced)
}

/**
 * SLIP encodes a byte array.
 *
 * @param {Array-like} data a Uint8Array, Node.js Buffer, ArrayBuffer, or [] containing raw bytes
 * @param {Object} options encoder options
 * @return {Uint8Array} the encoded copy of the data
 */
slip.encode = function (data, o) {
  o = o || {}
  o.bufferPadding = o.bufferPadding || 4 // Will be rounded to the nearest 4 bytes.
  data = slip.byteArray(data, o.offset, o.byteLength)

  let bufLen = (data.length + o.bufferPadding + 3) & ~0x03,
    encoded = new Uint8Array(bufLen),
    j = 1

  encoded[0] = slip.END

  for (let i = 0; i < data.length; i++) {
    // We always need enough space for two value bytes plus a trailing END.
    if (j > encoded.length - 3) {
      encoded = slip.expandByteArray(encoded)
    }

    let val = data[i]
    if (val === slip.END) {
      encoded[j++] = slip.ESC
      val = slip.ESC_END
    } else if (val === slip.ESC) {
      encoded[j++] = slip.ESC
      val = slip.ESC_ESC
    }

    encoded[j++] = val
  }

  encoded[j] = slip.END
  return slip.sliceByteArray(encoded, 0, j + 1)
}

/**
 * Creates a new SLIP Decoder.
 * @constructor
 *
 * @param {Function} onMessage a callback function that will be invoked when a message has been fully decoded
 * @param {Number} maxBufferSize the maximum size of a incoming message larger messages will throw an error
 */
slip.Decoder = function (o) {
  o = typeof o !== "function" ? o || {} : {
    onMessage: o
  }

  this.maxMessageSize = o.maxMessageSize || 10485760 // Defaults to 10 MB.
  this.bufferSize = o.bufferSize || 1024 // Message buffer defaults to 1 KB.
  this.msgBuffer = new Uint8Array(this.bufferSize)
  this.msgBufferIdx = 0
  this.onMessage = o.onMessage
  this.onError = o.onError
  this.escape = false
}

let p = slip.Decoder.prototype

/**
 * Decodes a SLIP data packet.
 * The onMessage callback will be invoked when a complete message has been decoded.
 *
 * @param {Array-like} data an incoming stream of bytes
 */
p.decode = function (data) {
  data = slip.byteArray(data)

  let msg
  for (let i = 0; i < data.length; i++) {
    let val = data[i]

    if (this.escape) {
      if (val === slip.ESC_ESC) {
        val = slip.ESC
      } else if (val === slip.ESC_END) {
        val = slip.END
      }
    } else {
      if (val === slip.ESC) {
        this.escape = true
        continue
      }

      if (val === slip.END) {
        msg = this.handleEnd()
        continue
      }
    }

    let more = this.addByte(val)
    if (!more) {
      this.handleMessageMaxError()
    }
  }

  return msg
}

p.handleMessageMaxError = function () {
  if (this.onError) {
    this.onError(this.msgBuffer.subarray(0),
      "The message is too large the maximum message size is " +
      this.maxMessageSize / 1024 + "KB. Use a larger maxMessageSize if necessary.")
  }

  // Reset everything and carry on.
  this.msgBufferIdx = 0
  this.escape = false
}

// Unsupported, non-API method.
p.addByte = function (val) {
  if (this.msgBufferIdx > this.msgBuffer.length - 1) {
    this.msgBuffer = slip.expandByteArray(this.msgBuffer)
  }

  this.msgBuffer[this.msgBufferIdx++] = val
  this.escape = false

  return this.msgBuffer.length < this.maxMessageSize
}

// Unsupported, non-API method.
p.handleEnd = function () {
  if (this.msgBufferIdx === 0) {
    return // Toss opening END byte and carry on.
  }

  let msg = slip.sliceByteArray(this.msgBuffer, 0, this.msgBufferIdx)
  if (this.onMessage) {
    this.onMessage(msg)
  }

  // Clear our pointer into the message buffer.
  this.msgBufferIdx = 0

  return msg
}
if (typeof window !== "object") {
  module.exports = slip
}
