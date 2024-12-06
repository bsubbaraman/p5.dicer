let _fab;
let _once = false;
let _recoverCameraPosition = false;
let _syncVizStream = true;

//////////////////////
// Prototype Functions
//////////////////////

p5.prototype.createFab = function () {
  _fab = new Fab();
  return _fab;
};

p5.prototype.getSerial = function () {
  return _fab.serial;
};

p5.prototype.printOnOpen = function () {
  _fab.serial.on("open", () => _fab.print());
};

// Save shape as Geometry from immediate mode
// this may become easier in future p5 releases
// source: https://github.com/processing/p5.js/issues/5393#issuecomment-910100074
p5.RendererGL.prototype.saveShape = function () {
  if (this.immediateMode.shapeMode !== 0x0000)
    // POINTS
    this._processVertices(...arguments);
  this.isBezier = false;
  this.isQuadratic = false;
  this.isCurve = false;
  this.immediateMode._bezierVertex.length = 0;
  this.immediateMode._quadraticVertex.length = 0;
  this.immediateMode._curveVertex.length = 0;

  // patch and return geometry
  let g = this.immediateMode.geometry;

  this._savedShapesCount = this._savedShapesCount + 1 || 0;
  g.gid = "saved|" + this._savedShapesCount; // assign gid to cache buffer
  g._makeTriangleEdges = function () {
    return this;
  }; // shadow this function to avoid loosing edges when `model(...)` is called

  // assign a new geometry to immediateMode to avoid pointer aliasing
  this.immediateMode.geometry = new p5.Geometry();

  return g;
};

p5.prototype.saveShape = function () {
  if (this._renderer.isP3D) {
    return this._renderer.saveShape(...arguments);
  } else {
    console.warn("Don't use saveShape in 2D mode.");
  }
};


// Call fabDraw once, immediately after setup and before first draw()
// pre is called before every draw, so we wrap predraw in a closure to run only once
// Grab the midiDraw function, if it exists

p5.prototype.predraw = (function (b) {
  return function () {
    if (!_once) {
      _once = true;
      if (typeof fabDraw === "function") {
        _fab.model = ""; // clear last model
        _fab.commands = []; // clear the gcode commands -- commandStream is preserved
        fabDraw();
        _fab.parseGcode();
        _syncVizStream = true; // new model needs to be synced after current print job
      }

      if (_fab.midiMode) {
        if (typeof midiSetup === "function") {
          _fab.midiSetup = midiSetup;
        }
        if (typeof midiDraw === "function") {
          _fab.midiDraw = midiDraw;
        }
        else {
          _fab.midiDraw = false;
        }
      }
    }
  };
})();

p5.prototype.registerMethod("pre", p5.prototype.predraw);

/////////////////
// Classes
/////////////////

class Vector4 {
  // Simple class for keeping track of printer x/y/z/e positions
  constructor(x, y, z, e) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.e = e || 0;
  }
}

class LinearMove {
  constructor(cmdString) {
    let x, y, z, e, f, comment;
    const commentIdx = cmdString.indexOf(';'); // TODO: handle custom tags for midi control
    if (commentIdx > -1) {
      [cmdString, comment] = [cmdString.substring(0, commentIdx), cmdString.substring(commentIdx)];
    }

    cmdString = cmdString.trim();
    let splitCmd = cmdString.split(' ');
    const command = splitCmd[0];
    splitCmd.shift();
    splitCmd.forEach((parameter) => {
      const field = parameter[0]
      const value = parseFloat(parameter.substring(1));
      switch (field) {
        case 'X':
          x = value;
          break;
        case 'Y':
          y = value;
          break;
        case 'Z':
          z = value;
          break;
        case 'E':
          e = value;
          break;
        case 'F':
          f = value;
          break;
      }
    });

    this.command = command;
    this.comment = comment || null;
    this.x = x || null;
    this.y = y || null;
    this.z = z || null;
    this.e = e || null;
    this.f = f || null;
  }

  toString() {
    let xParam, yParam, zParam, eParam, fParam;
    if (this.x) { xParam = 'X' + this.x };
    if (this.y) { yParam = 'Y' + this.y };
    if (this.z) { zParam = 'Z' + this.z };
    if (this.e) { eParam = 'E' + this.e };
    if (this.f) { fParam = 'F' + this.f };
    // if (this.comment) { commentParam = '; ' + this.comment}

    const parameters = [this.command, xParam, yParam, zParam, eParam, fParam];
    const filteredParameters = parameters.filter(Boolean);
    return filteredParameters.join(' ');
  }
}

////////////////////////////////////
// Fab 
// Defaults to Ender3 without config
////////////////////////////////////
const defaultPrinterSettings = {
  baudRate: 115200,
  nozzleDiameter: 0.4,
  filamentDiameter: 1.75,
  maxX: 220,
  maxY: 220,
  maxZ: 250,
  autoConnect: true,
  fabscribe: false,
  name: "ender3",
};

class Fab {
  constructor(config = defaultPrinterSettings) {
    this.configure(config);

    // Serial Things
    this.serial = new p5.WebSerial();
    this.serial.setLineEnding("\n");
    this.serialResp = "";
    this.callbacks = {};

    // Convert event handlers to async/await
    this.serial.on("portavailable", async () => {
      try {
        await this.serial.open({ baudRate: this.baudRate });
        console.log("Port opened successfully");
      } catch (err) {
        console.error("Failed to open port:", err);
      }
    });

    this.serial.on("requesterror", (err) => {
      console.error("Error requesting port:", err);
    });

    // Bind onData to preserve 'this' context
    this.serial.on("data", () => this.onData());

    this.serial.on("open", () => {
      console.log("Port open");
      this.emit("connected", this);
    });

    if (config.autoConnect) {
      this.connectPrinter();
    }

    this.on("ok", this.serial_ok);

    // Printer Info
    this.gcode = "";
    this.commands = [];
    this.commandStream = []; // for streaming to the printer
    this.printer = config.name;
    this.asyncPosition = new Vector4(0, 0, 0, 0); // positions used to plan toolpaths
    this.realtimePosition = new Vector4(0, 0, 0, 0) // realtime positions used for interactive printing
    this.v = 0;
    this.nozzleT = 0;
    this.reportedPos = "N/A";

    // Rendering Info
    this.vertices = [];
    this.model = "";
    this.isPrinting = false;

    // Fabscription Info
    if (this.fabscribe) {
      console.log('fabscription enabled');
      this.sentCommands = [];
      this.sentCommandsFiltered = [];
      this.log = [];
      this.trace = [];
      this.midiRecording = {};
      this.startTime = false;
      this.autoHomeComplete = false;
      this.bufferSize = 512; // default for Marlin; find way to configure automatically?
      this.bufferFillSize = 0;
      this.bufferFilled = false;
      this.numCommandsToFillBuffer = 0;
      this.videoStream;
      this.mediaRecorder = null;
      this.blobsRecorded = [];
      this.hasDownloadedLog = false;
    }

    // Camera for viz
    this.camera = createCamera();
    this.cameraPosition = new p5.Vector(
      this.camera.eyeX,
      this.camera.eyeY,
      this.camera.eyeZ
    );
    this.cameraOrientation = new p5.Vector(
      this.camera.centerX,
      this.camera.centerY,
      this.camera.centerZ
    );

    // Midi
    this.midiMode = false;
    this.midiSetup = null;
    this.midiDraw = null;

    // Add response types
    this.RESPONSE_TYPES = {
      OK: 'ok',
      POSITION: 'Count',
      AUTOHOME: 'Autohome complete',
      PRINT_FINISHED: 'Print Finished'
    };
    
    // Add buffer management
    this.messageBuffer = '';
    this.lastMessageTime = Date.now();
  }

  // Add new async connect method
  async connectPrinter() {
    try {
      await this.serial.requestPort();
      // Port selection will trigger the "portavailable" event handler
    } catch (err) {
      console.error("Failed to request port:", err);
      this.emit("error", err);
    }
  }

  getStackTrace() {
    const { stack } = new Error();
    return stack.substr(stack.indexOf("\n", stack.indexOf("\n") + 1));
  }

  add(cmd) {
    if (this.fabscribe) {
      let trace = this.getStackTrace();
      // assume the sketch is called sketch.js. should instead get from index.html?
      // the trace will include (<file_path>:<line_num>:<char_num>. extract the line num
      let traceLineNum = trace.split('sketch.js:')[1].split(':')[0];
      this.trace.push([cmd, traceLineNum]);
    }

    this.commands.push(cmd);
  }

  print() {
    if (this.isPrinting) {
      console.log("print in progress, cant start a new print");
      return;
    }

    // Create fresh copy of commands for printing
    this.commandStream = [...this.commands];
    this.commands = []; // Clear commands after copying

    // Send first command if we have any
    if (this.commandStream.length > 0) {
      this.isPrinting = true;
      this.serial.write(this.commandStream[0] + "\n");
      console.log("sending:", this.commandStream[0]);
      this.commandStream.shift();
    }
  }

  processMessage(message) {
    // Log all messages for debugging
    console.log('Received:', message);

    if (message.includes('ok')) {
      // Continue printing if there are more commands
      if (this.commandStream.length > 0) {
        this.serial.write(this.commandStream[0] + "\n");
        console.log("sending:", this.commandStream[0]);
        this.commandStream.shift();
      } else {
        console.log("print finished!");
        this.isPrinting = false;
      }
    }

    // Handle position reporting
    if (message.includes('Count')) {
      this.reportedPos = message.split('Count')[0].trim();
    }
  }

  getPos() {
    this.add("M114");
  }

  on(event, cb) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
  }

  emit(event, data) {
    let cbs = this.callbacks[event];
    if (cbs) {
      cbs.forEach((cb) => cb(data));
    }
  }

  serial_ok(g) {
    g.printStream(); // stream next command, now that we've got an ok
  }

  onData() {
    try {
      // Read new data
      const newData = this.serial.readString();
      if (!newData) return;

      // Update buffer and timestamp
      this.messageBuffer += newData;
      this.lastMessageTime = Date.now();

      // Process messages
      this.processMessageBuffer();

    } catch (error) {
      console.error('Error in onData:', error);
      this.emit('error', error);
    }
  }

  processMessageBuffer() {
    // Split buffer into complete messages
    const messages = this.messageBuffer.split('\n');
    
    // Keep last incomplete message in buffer
    this.messageBuffer = messages.pop() || '';

    // Process each complete message
    messages.forEach(message => {
      if (message.trim()) {
        this.processMessage(message.trim());
      }
    });
  }

  getMessageType(message) {
    if (message.includes(this.RESPONSE_TYPES.OK)) return 'ok';
    if (message.includes(this.RESPONSE_TYPES.POSITION)) return 'position';
    if (message.includes(this.RESPONSE_TYPES.AUTOHOME)) return 'autohome';
    if (message.includes(this.RESPONSE_TYPES.PRINT_FINISHED)) return 'print_finished';
    return 'unknown';
  }

  handleOkResponse() {
    this.emit('ok', this);
    
    if (this.isPrinting) {
      // Handle position query for fabscribe
      if (this.fabscribe && this.autoHomeComplete && this.bufferFilled) {
        if (this.sentCommands[this.sentCommands.length - 1] !== "M114 R") {
          this.commandStream.unshift("M114 R");
        }
      }
    }
  }

  handlePositionResponse(message) {
    const position = message.split(" Count ")[0].trim();
    this.reportedPos = position;

    if (this.autoHomeComplete && this.bufferFilled) {
      const logEntry = [Date.now() - this.startTime, position];
      this.log.push(logEntry);
    }
  }

  handleAutohomeResponse() {
    this.autoHomeComplete = true;
    if (this.fabscribe) {
      const logEntry = [Date.now() - this.startTime, "AUTOHOMED"];
      this.log.push(logEntry);
    }
  }

  handlePrintFinished() {
    if (this.fabscribe && !this.hasDownloadedLog) {
      this.mediaRecorder.stop();
      this.downloadFabscriptionLog();
      this.hasDownloadedLog = true;
    }
    this.resetPrinterState();
  }

  handleUnknownResponse(message) {
    console.log('Unknown printer response:', message);
  }

  // Add message timeout checking
  checkMessageTimeout() {
    const TIMEOUT_MS = 5000; // 5 seconds
    if (this.messageBuffer && (Date.now() - this.lastMessageTime > TIMEOUT_MS)) {
      console.warn('Message timeout - clearing buffer');
      this.messageBuffer = '';
      this.emit('warning', 'Message timeout occurred');
    }
  }

  parseGcode() {
    this.vertices = [];
    _fab.commands.forEach((cmd) => {
      let fullcommand = cmd;
      cmd = cmd.trim().split(" ");
      var code = cmd[0].substring(0, 2);
      if (code !== "G0" && code !== "G1") {
        // G0&1 are move commands. add G2&3 later.
        return;
      }
      var newV = new p5.Vector();
      let vertexData = {
        command: code,
        vertex: newV,
        full: fullcommand,
      };

      /****
             *  parse gcode
             *  Ender coordinate system                                               
                    7 +Z
                   /
                  /
                  +-----------> +X
                  |
                  |
                  |
                  V +Y     
      
                p5 WEBGL coordinate system                            
                    7 +Y                                                                                               
                   /                                                                                                     
                  /                                                                                                        
                  +-----------> +X                                                                                     
                  |                                                                                                           
                  |                                                                                             
                  |                                                                                                            
                  V -Z                                                                                                         
                 
             */
      cmd.forEach((c) => {
        let val = c.substring(1);
        switch (c.charAt(0)) {
          case "X":
            newV.x = val;
            break;
          case "Y":
            newV.z = val; // switch z-y
            break;
          case "Z":
            newV.y = -1 * val; // switch z-y
            break;
          case "E":
            if (val < 0) {
              newV = null;
              return;
            }
          case ";":
            if (val == "prime" || val == "present") {
              // || val == 'intro' to remove intro line
              newV = null;
              return;
            }
        }
      });

      if (newV) {
        this.vertices.push(vertexData);
      }
    });
  }

    exportGcode(fileName = new Date().toISOString().slice(0, 19).replace(/:/g, "")) {
        let gcodeText = "";
        fab.commands.forEach(command => {
          gcodeText += command + "\n";
        });
      
        let element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(gcodeText));
        element.setAttribute('download', `${fileName}.gcode`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      
      }

  render() {
    if (this.coordinateSystem == "delta") {
      this.drawDeltaPrinter();
    } else {
      this.drawCartesianPrinter();
    }

    if (this.vertices.length == 0) { return };
    if (!this.model) {
      //tracks current toolpath position
      var toolpathPos = new p5.Vector(0, 0, 0); // assume you're homed to start
      beginShape(LINES);
      for (let v in this.vertices) {
        v = parseInt(v);
        var vertexData = this.vertices[v];
        if (vertexData.command == "G0") {
          //move toolpath position
          toolpathPos = toolpathPos.set([
            vertexData.vertex.x,
            vertexData.vertex.y,
            vertexData.vertex.z,
          ]);
          continue; // no extrusions on G0
        } else if (vertexData.command == "G1") {
          // draw a line between current toolpath position and next toolpath position,
          // sent toolpath position
          vertex(toolpathPos.x, toolpathPos.y, toolpathPos.z);
          vertex(vertexData.vertex.x, vertexData.vertex.y, vertexData.vertex.z);
          toolpathPos = toolpathPos.set([
            vertexData.vertex.x,
            vertexData.vertex.y,
            vertexData.vertex.z,
          ]);
        }
      }
      endShape();
      this.model = saveShape();
    } else {
      model(this.model);
    }
    pop();

    // update camera position & orientation
    if (_recoverCameraPosition) {
      this.camera.setPosition(
        this.cameraPosition.x,
        this.cameraPosition.y,
        this.cameraPosition.z
      );
      _recoverCameraPosition = false;
      this.camera.lookAt(
        this.cameraOrientation.x,
        this.cameraOrientation.y,
        this.cameraOrientation.z
      );
    }

    this.cameraPosition.x = this.camera.eyeX;
    this.cameraPosition.y = this.camera.eyeY;
    this.cameraPosition.z = this.camera.eyeZ;
    this.cameraOrientation.x = this.camera.centerX;
    this.cameraOrientation.y = this.camera.centerY;
    this.cameraOrientation.z = this.camera.centerZ;
  }

  drawCartesianPrinter() {
    orbitControl(2, 2, 0.1);

    // draw print bed
    translate(-this.maxX / 2, 0, -this.maxY / 2);
    rotateY(PI);
    scale(-1, 1);
    push();
    translate(this.maxX / 2, 0, this.maxY / 2);
    rotateY(PI / 12);
    rotateX(PI / 12);
    fill(254, 249, 152);
    push();
    translate(0, 2.5, 0);
    box(this.maxX + 1, 5, this.maxY + 1); // build plate
    pop();

    push();
    noFill();
    translate(0, -this.maxZ / 2 + 1, 0);
    stroke(220, 50, 32);
    box(this.maxX, this.maxZ, this.maxY); // work envolope
    pop();

    noFill();
    stroke(0);
    translate(-this.maxX / 2, 0, -this.maxY / 2);
  }

  drawDeltaPrinter() {
    orbitControl(2, 2, 0.1);

    // draw print bed
    translate(-this.radius, 0, -this.radius);
    rotateY(PI);
    scale(-1, 1);
    push();
    translate(this.radius, 0, this.radius);
    rotateY(PI / 12);
    rotateX(PI / 12);
    fill(254, 249, 152);
    push();
    translate(0, 2.5, 0);
    cylinder(this.radius + 1, 5); // build plate
    pop();

    push();
    noFill();
    translate(0, -this.maxZ / 2 + 1, 0);
    stroke(220, 50, 32);
    box((2 * this.radius) / sqrt(2), this.maxZ, (2 * this.radius) / sqrt(2)); // work envolope
    pop();

    // not sure if needed
    noFill();
    stroke(0);
  }

  /*****
   * G-Code Commands
   */
  autoHome() {
    var cmd = "G28";
    this.add(cmd);
    this.add("G92 E0");
    if (this.fabscribe) {
      this.add("M118 Autohome complete"); // for transcription
      this.add("G1 Z10 F50"); // for transcription; add a slow move to allow buffer to fill
    }


    return cmd;
  }

  setTemps(tNozzle, tBed) {
    var cmd = `M104 S${tNozzle}`; // set nozzle temp without waiting
    this.add(cmd);

    cmd = `M140 S${tBed}`; // set bed temp without waiting
    this.add(cmd);

    // now wait for both
    cmd = `M109 S${tNozzle}`;
    this.add(cmd);
    cmd = `M190 S${tBed}`;
    this.add(cmd);

    return cmd;
  }

  setNozzleTemp(t) {
    var cmd = `M109 S${t}`; // wait for temp
    this.add(cmd);
    return cmd;
  }

  setBedTemp(t) {
    var cmd = `M190 S${t}`;
    this.add(cmd);
    return cmd;
  }

  setAbsolutePosition() {
    var cmd = "G90";
    this.add(cmd);
  }

  setRelativePosition() {
    var cmd = "G91";
    this.add(cmd);
  }

  setERelative() {
    var cmd = "M83";
    this.add(cmd);
  }

  fanOn() {
    var cmd = "M106";
    this.add(cmd);
  }

  fanOff() {
    var cmd = "M107";
    this.add(cmd);
  }

  pausePrint(t = null) {
    var cmd = t ? `M1 S${t}` : "M1 S10 this is a pause";
    this.commandStream.unshift(cmd);
  }

 

  configure(config) {
    this.coordinateSystem = config.coordinateSystem;
    this.radius = config.radius;
    this.nozzleR = config.nozzleDiameter / 2;
    this.filamentR = config.filamentDiameter / 2;
    this.baudRate = config.baudRate;
    this.autoConnect = config.autoConnect;
    this.maxZ = config.maxZ;
    if (config.coordinateSystem == "delta") {
      this.maxX = (2 * config.radius) / sqrt(2);
      this.maxY = this.maxX;
      this.centerX = 0;
      this.centerY = 0;
    } else {
      this.maxX = config.maxX;
      this.maxY = config.maxY;
      this.centerX = config.maxX / 2;
      this.centerY = config.maxY / 2;
    }

    this.fabscribe = config.fabscribe;
  }

  stopPrint() {
    this.resetPrinterState();
    if (this.fabscribe) {
      this.mediaRecorder.stop();
      this.downloadFabscriptionLog();
    }
  }

  restartPrinter() {
    var cmd = "M999";
    this.add(cmd);
    this.print();
  }

  introLine(z = 0.3) {
    if (this.coordinateSystem != "delta") {
      this.move(0.1, 20, z, 85);
      this.moveExtrude(0.1, 200, z, 25);
      this.addComment("intro");
      this.move(0.4, 200.0, z, 85);
      this.moveExtrude(0.4, 20.0, z, 25);
      this.addComment("intro");
    } else {
      for (let angle = 0; angle <= TWO_PI / 3; angle += TWO_PI / 50) {
        let x = 90 * cos(angle);
        let y = 90 * sin(angle);
        if (angle == 0) {
          fab.moveRetract(this.centerX + x, this.centerY + y, z, 30);
        } else {
          fab.moveExtrude(this.centerX + x, this.centerY + y, z, 5);
        }
      }
    }
    // adding header from cura intro
    this.add("G0 Z2.0 F3000");
    this.add("G0 X5 Y20 Z0.3 F5000.0");
  }

  presentPart() {
    var retractCmd = "G1 E-10.0 F6000";
    this.add(retractCmd);
    var cmd = "G0 X0 Y180 F9000";
    this.add(cmd);
  }

    finishPrint() {
        var finishCommands = [
        "G1 Z79 F600 ; Move print head further up",
        "G1 Z150 F600 ; Move print head further up",
        "M140 S0 ; turn off heatbed",
        "M104 S0 ; turn off temperature",
        "M107 ; turn off fan",
        "M84 X Y E ; disable motors"];

        finishCommands.forEach(cmd => {
            this.add(cmd);
        });
    }

  waitCommand() {
    var cmd = "M400";
    this.add(cmd);
  }

  setPos() {
    var cmd = `G92 X${this.asyncPosition.x} Y${this.asyncPosition.y} Z${this.asyncPosition.z} E${this.asyncPosition.e}`;
  }

  autoReportPos(t = 10) {
    // currently not working
    this.add("AUTO_REPORT_POSITION");
    t = parseInt(t);
    var cmd = `M154 S${t}`;
    this.add(cmd);
  }

  /*****
   * G-Code Path Commands
   */
  move(x, y, z, v) {
    this.asyncPosition.x = parseFloat(x).toFixed(2);
    this.asyncPosition.y = parseFloat(y).toFixed(2);
    this.asyncPosition.z = parseFloat(z).toFixed(2);
    v = this.mm_sec_to_mm_min(v);
    this.v = parseFloat(v).toFixed(2);

    var cmd = `G0 X${this.asyncPosition.x} Y${this.asyncPosition.y} Z${this.asyncPosition.z} F${this.v}`;
    this.add(cmd);

    return cmd;
  }

  moveX(x, v = 25) {
    this.asyncPosition.x = parseFloat(x).toFixed(2);
    v = this.mm_sec_to_mm_min(v);
    this.v = parseFloat(v).toFixed(2);

    var cmd = `G0 X${this.asyncPosition.x} F${this.v}`;
    this.add(cmd);

    return cmd;
  }

  moveY(y, v = 25) {
    this.asyncPosition.y = parseFloat(y).toFixed(2);
    v = this.mm_sec_to_mm_min(v);
    this.v = parseFloat(v).toFixed(2);

    var cmd = `G0 Y${this.asyncPosition.y} F${this.v}`;
    this.add(cmd);

    return cmd;
  }

  moveZ(z, v = 25) {
    this.asyncPosition.z = parseFloat(z).toFixed(2);
    v = this.mm_sec_to_mm_min(v);
    this.v = parseFloat(v).toFixed(2);

    var cmd = `G0 Z${this.asyncPosition.z} F${this.v}`;
    this.add(cmd);

    return cmd;
  }

  up(z, v = 50) {
    this.asyncPosition.z = parseFloat(z).toFixed(2);
    v = this.mm_sec_to_mm_min(v);
    this.v = parseFloat(v).toFixed(2);

    var cmd = `G0 Z${this.asyncPosition.z} F${this.v}`;
    this.add(cmd);

    return cmd;
  }

  // moveExtrude(x, y, z, v = 25, e = this.makeE(x, y, z)) {
  moveExtrude(x, y, z, v = 25, e = null, multiplier = false) {
    // this if statement was added
    if (e == null) {
      this.asyncPosition.e = this.makeE(x, y, z);
    } else if (multiplier) {
      this.asyncPosition.e = e * this.makeE(x, y, z);
    } else {
      this.asyncPosition.e = e;
    }

    this.asyncPosition.x = parseFloat(x).toFixed(2);
    this.asyncPosition.y = parseFloat(y).toFixed(2);
    this.asyncPosition.z = parseFloat(z).toFixed(2);
    v = this.mm_sec_to_mm_min(v);
    this.v = parseFloat(v).toFixed(2);

    var cmd = `G1 X${this.asyncPosition.x} Y${this.asyncPosition.y} Z${this.asyncPosition.z} F${this.v} E${this.asyncPosition.e}`;
    this.add(cmd);

    return cmd;
  }

  moveRetract(x, y, z, v = 25, e = 8) {
    // first retract a bit
    let minusE = -1 * e;
    var retractCmd = `G1 E${minusE} F4500`;
    this.add(retractCmd);

    //pop the nozzle up
    var popUpCmd = "G0 Z0.2";
    this.setRelativePosition();
    this.add(popUpCmd);
    this.setAbsolutePosition();
    this.setERelative();

    // now move to the positiom
    this.asyncPosition.x = parseFloat(x).toFixed(2);
    this.asyncPosition.y = parseFloat(y).toFixed(2);
    this.asyncPosition.z = parseFloat(z).toFixed(2);
    v = this.mm_sec_to_mm_min(v);
    this.v = parseFloat(v).toFixed(2);
    this.asyncPosition.e = e;
    var cmd = `G0 X${this.asyncPosition.x} Y${this.asyncPosition.y} Z${this.asyncPosition.z} F${this.v}`;
    this.add(cmd);

    // prime the nozzle
    var primeCmd = `G1 E${e} F4500 ;prime`;
    this.add(primeCmd);

    return cmd;
  }

  setMaxAcceleration(x, y, z) {
    var cmd = `M201 X${x} Y${y} Z${z};`;
    this.add(cmd);
  }
  setStartAcceleration(a) {
    var cmd = `M204 P${a};`;
    this.add(cmd);
  }

  makeE(x, y, z) {
    return (
      dist(this.asyncPosition.x, this.asyncPosition.y, x, y) *
      (this.nozzleR / this.filamentR) ** 2
    ).toFixed(2);
  }

  mm_sec_to_mm_min(v) {
    return v * 60.0; // convert from mm/sec to mm/min
  }

  addComment(c) {
    _fab.commands[_fab.commands.length - 1] += ` ;${c}`;
    _fab.commandStream[_fab.commands.length - 1] += ` ;${c}`;
  }

  downloadFabscriptionLog() {
    // save log file (gcode timestamps)
    let logWriter = createWriter('fabLog.json');
    const dataToWrite = {
      log: fab.log,
      gcode: fab.sentCommandsFiltered,
      stack: fab.trace,
      midi: fab.midiRecording,
    }

    logWriter.write(JSON.stringify(dataToWrite, null, 4));
    logWriter.close();
    // fab.log.forEach((logEntry) => logWriter.print(logEntry));
    // // close the PrintWriter and save the file
    // logWriter.close();

    // let gcodeWriter = createWriter('print.gcode')
    // fab.sentCommandsFiltered.forEach((code) => gcodeWriter.print(code));
    // gcodeWriter.close();

    // let stackWriter = createWriter('stack.txt');
    // fab.trace.forEach((traceEntry) => stackWriter.print(traceEntry));
    // stackWriter.close();

    // // need to do this all dynamically...
    // let midiWriter = createWriter('midiSpeed.txt');
    // fab.midiRecording.speed.forEach((speedEntry) => midiWriter.print(speedEntry));
    // midiWriter.close();

    // midiWriter = createWriter('midiLoopRadius.txt');
    // fab.midiRecording.loopRadius.forEach((radiusEntry) => midiWriter.print(radiusEntry));
    // midiWriter.close();

    // midiWriter = createWriter('midiExtrusion.txt');
    // fab.midiRecording.extrusionMultiplier.forEach((extrusionEntry) => midiWriter.print(extrusionEntry));
    // midiWriter.close();
  }

  // Add method to properly reset printer state
  resetPrinterState() {
    this.isPrinting = false;
    this.commandStream = [];
    this.serialResp = "";
    console.log("Printer state reset");
  }
}

function windowResized() {
  _camPos = _fab.cameraPosition;
  _camOrientation = _fab.cameraOrientation;
  _recoverCameraPosition = true;
  resizeCanvas(windowWidth, windowHeight);
}
