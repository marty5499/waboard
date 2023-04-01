const generateESP32UploadCode = (file, pythonCode) => {
  code = `
pycode = """
${pythonCode}
"""
import machine
# write python code
with open('${file}', 'w') as f:
    f.write(pycode)
with open ('${file}', 'r') as f:
    content = f.read()
`;
  return code;
};


class DataTransformer {
  constructor() {
    this.container = '';
    this.decoder = new TextDecoder();
    this.readLine = true;
  }

  setReadLine() {
    this.readLine = true;
    this.readByteArray = false;
  }

  setReadByteArray(bytes) {
    this.readLine = false;
    this.readByteArray = true;
    this.readBytes = bytes;
    this.byteArray = new Uint8Array();
  }

  transform(chunk, controller) {
    if (this.readLine) {
      chunk = this.decoder.decode(chunk);
      this.container += chunk;
      const lines = this.container.split('\r\n');
      this.container = lines.pop();
      lines.forEach(line => controller.enqueue(line));
    }
    if (this.readByteArray) {
      this.byteArray = new Uint8Array([...this.byteArray, ...chunk]);
      var byteArrayLength = this.byteArray.length;
      if (byteArrayLength >= this.readBytes) {
        var rtnByteArray = new Uint8Array([...this.byteArray.slice(0, this.readBytes)]);
        this.byteArray = new Uint8Array(
          [this.byteArray.slice(this.readBytes, byteArrayLength - this.readBytes)]);
        controller.enqueue(rtnByteArray);
      }
    }
  }

  flush(controller) {
    controller.enqueue(this.container);
  }
}

class REPL {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
    this.callback = function () { }
  }

  addListener(callback) {
    this.callback = callback;
  }

  async usbConnect() {
    var self = this;
    this.running = false;
    const filter = { usbVendorId: 6790 };
    if (self.port == undefined) {
      self.port = await navigator.serial.requestPort({});
      await this.port.open({ baudRate: 115200, dateBits: 8, stopBits: 1, });
      this.writer = this.port.writable.getWriter();
      this.stream = new DataTransformer();
      this.reader = this.port.readable.
        pipeThrough(new TransformStream(this.stream)).getReader();
      self.port.ondisconnect = function () {
        console.log("<<< disconnect port >>>");
        self.port = null;
      }
    }
    await repl.enter();
  }

  async reset() {
    this.write('machine.reset()\n');
  }

  async enter() {
    //await this.restart(); // failure
    for (var i = 0; i < 3; i++) {
      await this.writer.write(Int8Array.from([0x03 /*interrupt*/]));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log("REPL ready!");
  }

  async write(code, cb) {
    if (this.running) {
      if (cb != null)
        cb('running...');
      return "";
    }
    this.running = true;
    var boundry = "===" + Math.random() + "==";
    await this.writer.write(Int8Array.from([0x01 /*RAW paste mode*/]));

    await new Promise((resolve) => setTimeout(resolve, 5));
    await this.writer.write(this.encoder.encode("print('" + boundry + "')\r\n"));
    var codes = code.split('\n');
    for (var i = 0; i < codes.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await this.writer.write(this.encoder.encode(codes[i] + "\n"));
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
    await this.writer.write(this.encoder.encode("print('" + boundry + "')\r\n"));
    await new Promise((resolve) => setTimeout(resolve, 5));

    await this.writer.write(Int8Array.from([0x04 /*exit*/]));
    var startBoundry = false;
    var rtnObj = "" + code.length;
    try {
      while (true) {
        var { value, done } = await this.reader.read();
        if (this.stream.readLine) {
          if (done) {
            //console.log("end:",value);
            this.running = false;
            return rtnObj;
          } else if (value.indexOf(">raw REPL; CTRL-B to exit") > 0) {
            continue;
          } else if (value == ">OK" + boundry) {
            startBoundry = true;
            //console.log("startBoundry...",value);
            continue;
          } else if (value == boundry) {
            //console.log("endBoundry...",value);
            this.running = false;
            return rtnObj;
          } else if (startBoundry && cb != null) {
            //console.log("output...",value);
            var { value, done } = await cb(value);
            if (done) return value;
          }
        } else if (this.stream.readByteArray) {
          var { value, done } = await cb(value);
          if (done) {
            this.running = false;
            return value;
          }
        }
      }
    } catch (e) { }
  }

  async uploadFile(pythonCode) {
    pythonCode = generateESP32UploadCode('main.py', pythonCode);
    pythonCode = pythonCode.replace("\\", "\\\\");
    var rtn = await this.write(pythonCode, function (value) {
      if (value.substring(0, 4) == 'save') {
        return { 'value': value, 'done': true };
      }
    });
    this.reset();
    return rtn;
  }

  async setWiFi(pythonCode, ssid, pwd) {
    pythonCode += "cfg.init()\n";
    pythonCode += "cfg.put('wifi',{'ssid':'" + ssid + "','pwd':'" + pwd + "'})\n";
    return await this.write(pythonCode, function (value) {
      if (value.substring(0, 4) == 'save') {
        return { 'value': value, 'done': true };
      }
    });
  }

}