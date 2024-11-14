//===================================
// Setup
//===================================
let _fab;
let fab;
let midiController;
let _once = false;
let _recoverCameraPosition = true;
let _syncVizStream = true;

const moveCommands = ["G0", "G1", "G2", "G3"];

//===================================
// Prototype Functions
//===================================
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

p5.RendererGL.prototype.saveShape = function () {
  // Save shape as Geometry from immediate mode
  // This may become easier in future p5 releases
  // source: https://github.com/processing/p5.js/issues/5393#issuecomment-910100074
  if (this.immediateMode.shapeMode !== 0x0000)
    // POINTS
    this._processVertices(...arguments);
  this.isBezier = false;
  this.isQuadratic = false;
  this.isCurve = false;
  this.immediateMode._bezierVertex.length = 0;
  this.immediateMode._quadraticVertex.length = 0;
  this.immediateMode._curveVertex.length = 0;

  // Patch and return geometry
  let g = this.immediateMode.geometry;
  this._savedShapesCount = this._savedShapesCount + 1 || 0;

  // Assign gid to cache buffer
  g.gid = "saved|" + this._savedShapesCount;

  // Shadow this function to avoid loosing edges when `model(...)` is called
  g._makeTriangleEdges = function () {
    return this;
  };

  // Assign a new geometry to immediateMode to avoid pointer aliasing
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


p5.prototype.predraw = (function (b) {
  // Call fabDraw once, immediately after setup and before first draw()
  // predraw is called before every draw, so use _once to make sure we only run 1 time
  return function () {
    if (!_once) {
      _once = true;

      // Preserve fab object & serial connection to visualize new sketch while the machine is running
      if (typeof (fab) === "undefined") {
        fab = createFab();
        midiController = createMidiController(debug = true);
      }

      if (typeof fabDraw === "function") {
        // Reset values to run fabDraw
        _fab.lastAsyncPosition = new XYZEFC();
        _fab.asyncPosition = new XYZEFC();
        _fab.model = "";
        _fab.commands = [];
        _fab.commandsForRendering = [];
        _fab.trace = [];
        _fab.firstMoveComplete = false;
        fabDraw();
        _fab.parseGcode();
        console.log(fab.commands)

        // New model needs to be synced after current print job
        _syncVizStream = true;
      }

      // In midi mode, we add default midiSetup() and midiDraw() functions 
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

//===================================
// Classes
//===================================
class XYZEFC {
  // Keep track of the printer XYZE axis positions, speed (F) and comments (C)
  constructor(x, y, z, e, f, c) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.e = e || 0;
    this.f = f || 0;
    this.c = c || "";
  }
}

class LinearMove {
  constructor(cmdString) {
    let x, y, z, e, f, comment;

    // TODO: handle custom tags for midi control
    const commentIdx = cmdString.indexOf(';');
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

  decimal(val, decimalPoints = 3) {
    return parseFloat(val).toFixed(decimalPoints);
  }

  toString() {
    let xParam, yParam, zParam, eParam, fParam;
    if (this.x) { xParam = 'X' + this.decimal(this.x) };
    if (this.y) { yParam = 'Y' + this.decimal(this.y) };
    if (this.z) { zParam = 'Z' + this.decimal(this.z) };
    if (this.e) { eParam = 'E' + this.decimal(this.e) };
    if (this.f) { fParam = 'F' + this.decimal(this.f) };
    // if (this.comment) { commentParam = '; ' + this.comment}

    const parameters = [this.command, xParam, yParam, zParam, eParam, fParam];
    const filteredParameters = parameters.filter(Boolean);
    return filteredParameters.join(' ');
  }
}

//===================================
// Fab
// Defaults to Ender3-Pro
//===================================
const defaultPrinterSettings = {
  name: "ender3",
  baudRate: 115200,
  nozzleDiameter: 0.4,
  filamentDiameter: 1.75,
  maxX: 220,
  maxY: 220,
  maxZ: 250,
  autoConnect: true,
  fabscribe: false,
};

class Fab {
  constructor(config = defaultPrinterSettings) {
    this.configure(config);
    this.setupSerialConnection();

    // Setup machine properties and initial state
    this.printer = config.name;
    this.commands = [];                               // All commands to be sent to the machine
    this.commandStream = [];                          // For streaming to the printer
    this.commandsForRendering = [];                   // Commands to be visualized
    this.lastAsyncPosition = new XYZEFC();            // Absolute positions used to plan toolpaths
    this.asyncPosition = new XYZEFC();                // Absolute positions used to plan toolpaths
    this.realtimePosition = new XYZEFC();             // Realtime positions used for interactive printing
    this.relativePositioning = false;                 // Position mode for XYZ; E is always relative
    this.nozzleT = 0;                                 // Nozzle temp in CelSius
    this.reportedPos = "N/A";
    this.defaultSpeed = 25;                           // mm/sec
    this.isPrinting = false;
    this.continuousMode = false;                      // added in etchasketch

    // Rendering info
    this.vertices = [];
    this.model = "";
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

    // Fabscription Info
    if (this.fabscribe) {
      console.log('fabscription enabled');
      this.sentCommands = [];                         // All commands sent so far
      this.sentCommandsFiltered = [];                 // Filter commands used to gather position
      this.log = [];                                  // Position data (TODO: RENAME)
      this.trace = [];                                // Stack trace (TODO: RENAME?)
      this.midiRecording = {};                        // Recorded midi input
      this.gcodeToMidiTimestamps = [];                 // testing for syncing midi times in fabscription
      this.sketch = "";                               // The code currently being run
      this.startTime = false;                         // TODO: null?
      this.autoHomeComplete = false;                  // TODO: Can I remove this?
      this.bufferSize = 512;                          // TODO: Can I remove this? 
      // default for Marlin; configure automatically?
      this.bufferFillSize = 0;                        // TODO: Can I remove this?
      this.bufferFilled = false;                      // TODO: Can I remove this?
      this.numCommandsToFillBuffer = 0;               // TODO: Can I remove this?
      this.videoStream;                               // TODO: Can I remove this?
      this.mediaRecorder = null;                      // TODO: Can I remove this?
      this.blobsRecorded = [];                        // TODO: Can I remove this?
      this.hasDownloadedLog = false;                  // TODO: Can I remove this?
      this.lastRtPosCollected = 0;                    // Added for testing
      this.lastRtPosSent = 0;                    // Added for testing
      this.lastRoundTrip = 0;                    // Added for testing
    }

    // Midi setup
    // TODO: Put in a conditional? And can I remove any of these?
    this.midiMode = true;
    this.midiSetup = null;
    this.midiDraw = null;
    this.firstMoveComplete = false;
    this.segmentationLength = 1;

    // Adding to test fabscription on jubilee
    // TODO: Move into conditional above?
    this.positionQueryIntervalID = null;
  }

  //===================================
  // Configuring machine parameters
  //===================================
  configure(config) {
    this.coordinateSystem = config.coordinateSystem;
    this.radius = config.radius;
    this._nozzleDiameter = config.nozzleDiameter;
    this._filamentDiameter = config.filamentDiameter;
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

    var messageData = {
      coordinateSystem: this.coordinateSystem,
      maxX: this.maxX,
      maxY: this.maxY,
      maxZ: this.maxZ,
      nozzleDiameter: this._nozzleDiameter,
      filamentDiameter: this.filamentDiameter,
    }
    console.log("FAB_CONFIG", messageData);

    this.fabscribe = config.fabscribe;
  }

  set nozzleDiameter(d) {
    this._nozzleDiameter = d;
    var messageData = {
      property: "nozzleDiameter",
      value: this._nozzleDiameter
    }
    console.log("FAB_CONFIG_CHANGE", messageData);
  }

  set filamentDiameter(d) {
    this._filamentDiameter = d;
    var messageData = {
      property: "filamentDiameter",
      value: this._filamentDiameter
    }
    console.log("FAB_CONFIG_CHANGE", messageData);
  }

  setupSerialConnection() {
    this.serial = new p5.WebSerial();
    this.serial.setLineEnding("\n");
    this.serialResp = "";
    this.callbacks = {};
    this.connected = false;

    this.serial.on("portavailable", function () {
      _fab.serial.open({ baudRate: _fab.baudRate });
    });

    this.serial.on("requesterror", function () {
      console.log("error!");
    });

    this.serial.on("data", this.onData);

    this.serial.on("open", function () {
      _fab.connected = true;
      var messageData = {
        connected: _fab.connected,
      }
      console.log("FAB_CONNECTION_CHANGE", messageData);
    });

    this.serial.on("close", function () {
      _fab.connected = false;
      var messageData = {
        connected: _fab.connected,
      }
      console.log("FAB_CONNECTION_CHANGE", messageData);
    })

    if (this.autoConnect) {
      this.serial.getPorts();
    }

    this.on("ok", this.serial_ok);
  }

  getStackTrace() {
    const { stack } = new Error();
    return stack.substr(stack.indexOf("\n", stack.indexOf("\n") + 1));
  }

  add(cmd) {
    if (this.fabscribe) {
      let trace = this.getStackTrace();

      // When not running in editor, we can do the following:

      // assume the sketch is called sketch.js. should instead get from index.html?
      // the trace will include (<file_path>:<line_num>:<char_num>. extract the line num
      // let traceLineNum = trace.split('sketch.js:')[1].split(':')[0];

      // For the editor, its slightly different. Find a way to accommodate this.
      // function called from <anonymous>:char:line trace
      // the line reported is the line in the sketch +8 (why 8?)
      var traceLineNum = trace.split('<anonymous>')[1].split(':')[1];

      this.trace.push([cmd, traceLineNum]);
    }

    if (this.midiMode) {
      this.subdivideMove(cmd, traceLineNum);
    }
    else {
      this.commands.push(cmd);
    }

    this.commandsForRendering.push(cmd);
  }

  subdivideMove(cmd, traceLineNum = null) {
    let segmentationLength = this.segmentationLength; // was 0.1 for slow moves, 0.5 for default 
    const splitCmd = cmd.split(' ');
    const code = splitCmd[0];
    if (moveCommands.indexOf(code) > -1) {
      const moveCommand = new LinearMove(cmd);
      // console.log('The comment is: ', moveCommand.comment);

      // For now, don't subdivide the first move, since we don't know where we are to start
      // TODO: Get start position first thing instead
      if (!this.firstMoveComplete) {
        this.commands.push(cmd);
        this.firstMoveComplete = true;
        this.asyncPosition.x = moveCommand.x;
        this.asyncPosition.y = moveCommand.y;
        this.asyncPosition.z = moveCommand.z;
        this.lastAsyncPosition.x = moveCommand.x;
        this.lastAsyncPosition.y = moveCommand.y;
        this.lastAsyncPosition.z = moveCommand.z;
        return;
      }

      // Find the distance between current and last positions
      const dist = sqrt((this.asyncPosition.x - this.lastAsyncPosition.x) ** 2 + (this.asyncPosition.y - this.lastAsyncPosition.y) ** 2 + (this.asyncPosition.z - this.lastAsyncPosition.z) ** 2)
      if (dist > segmentationLength) {
        // Get the equation of the line and segment into pieces of length segmentationLength
        const m = new p5.Vector(this.asyncPosition.x - this.lastAsyncPosition.x, this.asyncPosition.y - this.lastAsyncPosition.y, this.asyncPosition.z - this.lastAsyncPosition.z);
        const numSections = floor(dist / segmentationLength);
        const p_i = new p5.Vector(this.lastAsyncPosition.x, this.lastAsyncPosition.y, this.lastAsyncPosition.z);
        const p_f = new p5.Vector(this.asyncPosition.x, this.asyncPosition.y, this.asyncPosition.z);

        let i = 0;
        while (i < numSections) {
          const t = i / numSections;
          const p_ = p5.Vector.mult(m, t);
          const subPt = new p5.Vector(parseFloat(p_i.x) + parseFloat(p_.x), parseFloat(p_i.y) + parseFloat(p_.y), parseFloat(p_i.z) + parseFloat(p_.z));
          let subCmd = `${code} X${subPt.x} Y${subPt.y} Z${subPt.z}`;
          if (moveCommand.e) {
            subCmd += ` E${parseFloat(moveCommand.e) / numSections}`;
          }
          if (moveCommand.f) {
            subCmd += ` F${moveCommand.f}`;
          }
          if (moveCommand.comment) {
            subCmd += ` ${moveCommand.comment}`;
          }
          // subCmd += ` ; segmentationLength = ${segmentationLength}` // maybe add this back
          this.commands.push(subCmd);

          i += 1;
        }
      }
      else {
        this.commands.push(cmd);
        // TODO: added but untested!
        this.trace.push([cmd, traceLineNum]);
      }
    }
    else {
      this.commands.push(cmd);
    }
  }

  getRealtimePosition() {
    // DUET
    // TODO: Get tool offsets of current tool and apply
    // TODO: The position query should probably be set in the constructor based on firmware
    // first one is extruder0 on blubilee
    const positionQuery = `M118 S{"RT_POS " ^ "X:" ^ move.axes[0].machinePosition ^ " Y:" ^ move.axes[1].machinePosition + 42.75 ^ " Z:" ^ move.axes[2].machinePosition - 3.64}`;
    // Youtubilee syringe 1 offsets: 0.5, 39, -102
    // const positionQuery = `M118 S{"RT_POS " ^ "X:" ^ move.axes[0].machinePosition + 0.5 ^ " Y:" ^ move.axes[1].machinePosition + 39 ^ " Z:" ^ move.axes[2].machinePosition - 39}`;

    // MARLIN
    //  const positionQuery = `M114 R`; 


    if (_fab.sentCommands[_fab.sentCommands.length - 1] != positionQuery) {
      _fab.commandStream.unshift(positionQuery);
    }
    if (_fab.lastRtPosCollected - Date.now() > 500) {
      console.log("******SLOW DATA******");
    }
  }

  print() {
    console.log("Starting print");

    if (this.isPrinting) {
      console.log("Print in progress, cant start a new print");
      return;
    }
    if (!this.isPrinting && _syncVizStream) {
      this.commandStream = this.commands;
      _syncVizStream = false;

      // TODO: If sync commands are needed, then start this interval after those are sent
      // Try taking this out and instead testing in fabscription
      // because long foam prints had ~1second intervals between data collections
      if (this.fabscribe) {
        this.positionQueryIntervalID = setInterval(() => {
          this.getRealtimePosition();
        }, 20);
      }
    }

    // Send first command
    if (this.commandStream.length > 0) {
      this.isPrinting = true;
      this.serial.write(this.commandStream[0] + "\n");
      this.commandStream.shift();
    } else {
      console.log("All commands sent!");

      // TODO: It's still printing for a bit to finish all moves in the buffer,
      //       so this isn't actually false yet.
      this.isPrinting = false;
    }

    if (this.fabscribe) {
      this.startTime = Date.now();
      this.log = []; // clear the log? maybe remove or deal with this
    }
  }

  printStream() {
    // TODO: Do I need print() and printStream()?
    if (this.commandStream.length > 0) {
      this.isPrinting = true;

      let commandToSend = this.commandStream[0];

      if (this.midiMode) {
        commandToSend = this.updateWithMidiValues(this.commandStream[0]);
      }


      this.serial.write(commandToSend + "\n");
      // console.log("I just sent ", commandToSend);

      this.commandStream.shift();
      // get position after every command?
      // const positionQuery = `M114 R`; // Marlin
      // syringe
      // const positionQuery = `M118 S{"RT_POS " ^ "X:" ^ move.axes[0].machinePosition + 0.5 ^ " Y:" ^ move.axes[1].machinePosition + 39 ^ " Z:" ^ move.axes[2].machinePosition - 39}`;
      // tpu
      const positionQuery = `M118 S{"RT_POS " ^ "X:" ^ move.axes[0].machinePosition ^ " Y:" ^ move.axes[1].machinePosition + 42.75 ^ " Z:" ^ move.axes[2].machinePosition - 3.64}`;
      // this.serial.write(positionQuery + "\n"); // this works for Marlin, but doesn't for Duet
      // console.log("I just sent: ", positionQuery);
      if (this.fabscribe) { this.fabscription(commandToSend) };
    } else {
      console.log("All commands sent!");

      // TODO: It's still printing for a bit to finish all moves in the buffer,
      //       so this isn't actually false yet.
      this.isPrinting = false;
      if (!this.continuousMode) {
        // if not printing continuously, rerun fabDraw so we're ready to go again
        _once = false;
      }
    }
  }

  fabscription(commandToSend) {
    this.sentCommands.push(commandToSend);
    // console.log('i just sent: ', commandToSend);
    // console.log('time since last check:', Date.now() - this.lastRoundTrip);
    this.lastRoundTrip = Date.now();
    // I'm excluding E for now because we're not doing retraction with syringe/tpu printing
    // TODO: set position query in constructor based on firmware
    // first one has blubilee offset
    const positionQuery = `M118 S{"RT_POS " ^ "X:" ^ move.axes[0].machinePosition ^ " Y:" ^ move.axes[1].machinePosition + 42.75 ^ " Z:" ^ move.axes[2].machinePosition - 3.64}`;
    // this is syringe offset
    // const positionQuery = `M118 S{"RT_POS " ^ "X:" ^ move.axes[0].machinePosition + 0.5 ^ " Y:" ^ move.axes[1].machinePosition + 39 ^ " Z:" ^ move.axes[2].machinePosition - 39}`;

    // Marlin:
    // const positionQuery = `M114 R`
    if (commandToSend != positionQuery) {
      this.sentCommandsFiltered.push(commandToSend);
    }
    else {
      console.log("DELTA T: ", Date.now() - this.lastRtPosSent);
      this.lastRtPosSent = Date.now();

    }
  }

  updateWithMidiValues(cmd) {
    // TODO: First remove any comments
    const splitCmd = cmd.split(' ');
    const code = splitCmd[0];

    // Record all incoming midi values
    // TODO: probably want to filter this by tag, to only show the value when the value is being applied to the print
    const currentTime = Date.now() - _fab.startTime;

    if (this.fabscribe) {
      // Grab all the user specified props for the midi controller and record them
      const propsToIgnore = ["debug", "MidiTypes", "connected"];
      for (const property in midiController) {
        if (propsToIgnore.indexOf(property) > -1) {
          continue;
        }
        this.midiRecording[property] = this.midiRecording[property] || [];
        this.midiRecording[property].push([currentTime, midiController[property]]);
      }
    }

    // Run the midiDraw function to update the command
    if (moveCommands.indexOf(code) > -1) {
      // Update the 'realtime' positions
      // This is technically a bit in front of real position depending on buffer size
      let moveCommand = new LinearMove(cmd);
      if (moveCommand.x) { this.realtimePosition.x = moveCommand.x };
      if (moveCommand.y) { this.realtimePosition.y = moveCommand.y };
      if (moveCommand.z) { this.realtimePosition.z = moveCommand.z };

      if (this.midiDraw) {
        moveCommand = this.midiDraw(moveCommand); // run the midiDraw function
        cmd = moveCommand.toString();

        // Try keeping a log of the gcode lines sent and the midi timestamp to adjust in fabscription
        if (this.fabscribe) {
          this.gcodeToMidiTimestamps.push([currentTime, cmd]);
        }
      }
    }
    return cmd
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
    g.printStream();
  }

  onData() {
    _fab.serialResp += _fab.serial.readString();

    if (_fab.serialResp.slice(-1) == "\n") {
      if (_fab.serialResp.search("ok") > -1) {
        if (_fab.isPrinting) {
          _fab.emit("ok", _fab);
        }
        let currentTime = Date.now() - _fab.startTime;
      }

      if (_fab.serialResp.search(" Count ") > -1) {
        _fab.reportedPos = _fab.serialResp.split(" Count ")[0].trim();
        if (_fab.fabscribe) {
          var logEntry = [Date.now() - _fab.startTime, _fab.reportedPos];
          _fab.log.push(logEntry);
          console.log('time since last position received: ', Date.now() - fab.lastRtPosCollected);
          fab.lastRtPosCollected = Date.now();
        }
      }

      // DUET
      if (_fab.serialResp.search("RT_POS") > -1) {
        const rtPos = _fab.serialResp.split("RT_POS")[1].split("\n")[0].trim();
        const logEntry = [Date.now() - _fab.startTime, rtPos];
        if (_fab.log.length == 0) {
          _fab.log.push(logEntry);
        }
        else if (_fab.log.length > 0 && _fab.log[_fab.log.length - 1][1] !== rtPos) {
          _fab.log.push(logEntry);
          _fab.lastRtPosCollected = Date.now();
        }
        else if (_fab.log[_fab.log.length - 1][1] !== rtPos) {
          console.log("Got data but I already have it!");
        }
      }

      // TODO: Remove/use a different strategy to auto download logs based on final position
      if (_fab.serialResp.search("Print Finished") > -1) {
        if (_fab.fabscribe) {
          if (!_fab.hasDownloadedLog) {
            _fab.downloadFabscriptionLog();
            _fab.hasDownloadedLog = true;
          }
        }
      }

      _fab.serialResp = "";
    }
  }

  parseGcode() {
    this.vertices = [];
    _fab.commandsForRendering.forEach((cmd) => {
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
        const val = c.substring(1);
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

  render() {
    if (this.coordinateSystem == "delta") {
      this.drawDeltaPrinter();
    } else {
      this.drawCartesianPrinter();
    }

    if (this.vertices.length == 0) { return };
    if (!this.model) {
      // Tracks current toolpath position
      // Assumes you're homed to start
      // TODO: Incorporate initial position?
      var toolpathPos = new p5.Vector(0, 0, 0);
      beginShape(LINES);
      for (let v in this.vertices) {
        v = parseInt(v);
        var vertexData = this.vertices[v];
        if (vertexData.command == "G0") {
          // Update toolpath position
          toolpathPos = toolpathPos.set([
            vertexData.vertex.x,
            vertexData.vertex.y,
            vertexData.vertex.z,
          ]);
          continue; // no extrusions on G0
        } else if (vertexData.command == "G1") {
          // Draw a line between current toolpath position and next toolpath position
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

    // Update camera position & orientation
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

    translate(-this.maxX / 2, .25 * this.maxZ, -this.maxY / 2);
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
    const cmd = "G28";
    this.add(cmd);
    this.add("G92 E0");

    // TODO: Might be able to remove this?
    // if (this.fabscribe) {
    //   this.add("M118 Autohome complete"); // for transcription
    //   this.add("G1 Z10 F50"); // for transcription; add a slow move to allow buffer to fill
    // }

    return cmd;
  }

  setTemps(tNozzle, tBed) {
    let cmd = `M104 S${tNozzle}`; // set nozzle temp without waiting
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
    const cmd = `M109 S${t}`;
    this.add(cmd);
    return cmd;
  }

  setBedTemp(t) {
    const cmd = `M190 S${t}`;
    this.add(cmd);
    return cmd;
  }

  setAbsolutePosition() {
    this.relativePositioning = false;
    const cmd = "G90";
    this.add(cmd);
  }

  setAbsolutePositionXYZ() {
    // For Marlin, G90 sets extruder to absolute https://marlinfw.org/docs/gcode/G090.html
    // Duet doesn't https://docs.duet3d.com/en/User_manual/Reference/Gcodes
    // Send an M83 to keep extruder in relative mode.
    this.relativePositioning = false;
    this.setAbsolutePosition();
    this.setERelative();
  }

  setRelativePosition() {
    this.relativePositioning = true;
    const cmd = "G91";
    this.add(cmd);
  }

  setERelative() {
    const cmd = "M83";
    this.add(cmd);
  }

  fanOn() {
    const cmd = "M106";
    this.add(cmd);
  }

  fanOff() {
    const cmd = "M107";
    this.add(cmd);
  }

  pausePrint(t = null) {
    const cmd = t ? `M1 S${t}` : "M1 S10 this is a pause";
    this.commandStream.unshift(cmd);
  }

  stopPrint() {
    this.commandStream = [];
    this.isPrinting = false;
    fabDraw();

    // TODO: adding for testing fabscription on jubilee, need to formalize
    clearInterval(this.positionQueryIntervalID);
    this.positionQueryIntervalID = null;

    if (this.fabscribe) { fab.downloadFabscriptionLog() };

  }

  restartPrinter() {
    const cmd = "M999";
    this.add(cmd);
    this.print();
  }

  introLine(z = 0.3) {
    this.setAbsolutePositionXYZ();
    this.moveTo(5, 20, 0.2, 25);
    this.moveExtrude(5, 200, 0.2, 25);
    this.moveTo(8, 200, 0.2, 25);
    this.moveExtrude(8, 20, 0.2, 25);
    // if (this.coordinateSystem != "delta") {
    //   this.moveTo(5, 20, z, 85);
    //   this.moveExtrude(5, 200, z, 25);
    //   this.addComment("intro");
    //   this.moveTo(8, 200.0, z, 85);
    //   this.moveExtrude(8, 20.0, z, 25);
    //   this.addComment("intro");
    // } else {
    //   for (let angle = 0; angle <= TWO_PI / 3; angle += TWO_PI / 50) {
    //     let x = 90 * cos(angle);
    //     let y = 90 * sin(angle);
    //     if (angle == 0) {
    //       fab.moveRetract(this.centerX + x, this.centerY + y, z, 30);
    //     } else {
    //       fab.moveExtrude(this.centerX + x, this.centerY + y, z, 5);
    //     }
    //   }
    // }
    // // adding header from cura intro
    // this.add("G0 Z2.0 F3000");
    // this.add("G0 X5 Y20 Z0.3 F5000.0");
  }

  presentPart() {
    // var retractCmd = "G1 E-10.0 F6000";
    // this.add(retractCmd);
    this.moveToY(180, 60)
    // var cmd = "G0 X0 Y180 F9000";
    // this.add(cmd);
  }

  waitCommand() {
    var cmd = "M400";
    this.add(cmd);
  }

  getPos() {
    var cmd = "M114_DETAIL";
    var cmd = "M114 D";
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

  //===================================
  // Path Commands
  //===================================
  updateAsyncPosition({
    x = null,
    y = null,
    z = null,
    e = null,
    v = null,
    comment = ''
  } = {}) {
    this.lastAsyncPosition = { ...this.asyncPosition };
    if (!this.relativePositioning) {
      if (x) { this.asyncPosition.x = parseFloat(x).toFixed(2) };
      if (y) { this.asyncPosition.y = parseFloat(y).toFixed(2) };
      if (z) { this.asyncPosition.z = parseFloat(z).toFixed(2) };
    }
    else {
      if (x) { this.asyncPosition.x = (parseFloat(this.asyncPosition.x) + parseFloat(x)).toFixed(2) };
      if (y) { this.asyncPosition.y = (parseFloat(this.asyncPosition.y) + parseFloat(y)).toFixed(2) };
      if (z) { this.asyncPosition.z = (parseFloat(this.asyncPosition.z) + parseFloat(z)).toFixed(2) };
    }

    // E is relative
    if (e) {
      // CHANGED THIS TO toFixed(4) instead of 2
      this.asyncPosition.e = parseFloat(e).toFixed(4);
    }
    else {
      this.asyncPosition.e = 0;
    }

    if (v) {
      const f = this.mm_sec_to_mm_min(v);
      this.asyncPosition.f = parseFloat(f).toFixed(2);
    }

    if (comment) {
      this.asyncPosition.c = `;${comment}`
    }
    else {
      this.asyncPosition.c = '';
    }
  }

  _moveXYZE({
    x = null,
    y = null,
    z = null,
    e = null,
    v = null,
    comment = null,
  } = {}) {
    // Handle all movement commands. Set absolute/relative mode externally.
    this.updateAsyncPosition({ x: x, y: y, z: z, e: e, v: v, comment: comment });

    // Use G1 for extrude commands
    var moveType = e ? "G1" : "G0";

    // Always send aboslute position?
    this.setAbsolutePositionXYZ();
    const cmd = `${moveType} X${this.asyncPosition.x} Y${this.asyncPosition.y} Z${this.asyncPosition.z} E${this.asyncPosition.e} F${this.asyncPosition.f} ${this.asyncPosition.c} `;

    this.add(cmd);
    return cmd;
  }

  moveTo(x, y, z, v) {
    // Move directly to an absolute coordinate without extrusion. 
    this.setAbsolutePositionXYZ();
    this._moveXYZE({ x: x, y: y, z: z, v: v });
  }

  move(dx, dy, dz, v) {
    // Move relative to current position without extrusion.
    this.setRelativePosition();
    this._moveXYZE({ x: dx, y: dy, z: dz, v: v });
  }

  moveExtrude(x, y, z, v, e = null, multiplier = false) {
    // Move to an absolute coordinate while extruding
    if (e == null) {
      e = this.makeE(x, y, z);
    } else if (multiplier) {
      e = e * this.makeE(x, y, z);
    }

    this.setAbsolutePositionXYZ();
    this._moveXYZE({ x: x, y: y, z: z, e: e, v: v });
  }

  moveRetract(x, y, z, v, e = 8) {
    // Move to an absolute position while retracting filament.

    // First retract a bit
    this.moveE(-1 * e);

    // Pop the nozzle up
    this.moveZ(0.2);

    // Move to the position
    this.setAbsolutePositionXYZ()
    this._moveXYZE({ x: x, y: y, z: z, v: v });

    // Prime the nozzle
    this.prime(e);
  }

  travelTo(x, y, z, v) {
    // Move to an absolute coordinate with a z hop
    this.move(0, 0, 2);
    this.setAbsolutePositionXYZ();
    this._moveXYZE({ x: x, y: y, z: z, v: v });
    this.move(0, 0, -2);
  }

  moveToX(x, v) {
    // Move directly to an absolue X coordinate without extruding
    this.setAbsolutePositionXYZ();
    this._moveXYZE({ x: x, v: v });
  }

  moveToY(y, v) {
    // Move directly to an absolue Y coordinate without extruding
    this.setAbsolutePositionXYZ();
    this._moveXYZE({ y: y, v: v });
  }

  moveToZ(z, v) {
    // Move directly to an absolue Z coordinate without extruding
    this.setAbsolutePositionXYZ();
    this._moveXYZE({ z: z, v: v });
  }

  moveToE(e, v) {
    // Move directly to an absolue E coordinate without extruding
    this.setAbsolutePositionXYZ();
    this._moveXYZE({ e: e, v: v });
  }

  moveX(dx, v) {
    // Move in X relative to current position without extruding
    this.move(dx, 0, 0, v)
  }

  moveY(dy, v) {
    // Move in Y relative to current position without extruding
    this.move(0, dy, 0, v)
  }

  moveZ(dz, v) {
    // Move in Z relative to current position without extruding
    this.move(0, 0, dz, v)
  }

  moveE(de, v) {
    // Move in E relative to current position without extruding
    this.setRelativePosition();
    this._moveXYZE({ e: de, v: v });
  }

  extrudeX(dx, v, e, multiplier = false, comment = '') {
    // Move in X relative to current position while extruding
    if (e == null) {
      e = this.makeE(parseFloat(this.asyncPosition.x) + parseFloat(dx), this.asyncPosition.y, this.asyncPosition.z);
    } else if (multiplier) {
      e = e * this.makeE(parseFloat(this.asyncPosition.x) + parseFloat(dx), parseFloat(this.asyncPosition.y), parseFloat(this.asyncPosition.z));
    }

    this.setRelativePosition();
    this._moveXYZE({ x: dx, e: e, v: v, comment: comment });
  }

  extrudeXY(dx, dy, v, e, multiplier = false, comment = '') {
    // Move in X & Y relative to current position while extruding
    if (e == null) {
      e = this.makeE(parseFloat(this.asyncPosition.x) + parseFloat(dx), parseFloat(this.asyncPosition.y) + parseFloat(dy), this.asyncPosition.z);
    } else if (multiplier) {
      e = e * this.makeE(parseFloat(this.asyncPosition.x) + parseFloat(dx), parseFloat(this.asyncPosition.y) + parseFloat(dy), parseFloat(this.asyncPosition.z));
    }

    this.setRelativePosition();
    this._moveXYZE({ x: dx, y: dy, e: e, v: v, comment: comment });
  }

  extrudeY(dy, v, e, multiplier = false) {
    // Move in Y relative to current position while extruding
    if (e == null) {
      e = this.makeE(parseFloat(this.asyncPosition.x), parseFloat(this.asyncPosition.y) + parseFloat(dy), parseFloat(this.asyncPosition.z));
    } else if (multiplier) {
      e = e * this.makeE(parseFloat(this.asyncPosition.x), parseFloat(this.asyncPosition.y) + parseFloat(dy), parseFloat(this.asyncPosition.z));
    }

    this.setRelativePosition();
    this._moveXYZE({ y: dy, e: e, v: v });
  }

  extrudeZ(dz, v, e, multiplier = false) {
    // Move in Z relative to current position while extruding
    if (e == null) {
      e = this.makeE(parseFloat(this.asyncPosition.x), parseFloat(this.asyncPosition.y), parseFloat(this.asyncPosition.z) + parseFloat(dz));
    } else if (multiplier) {
      e = e * this.makeE(parseFloat(this.asyncPosition.x), parseFloat(this.asyncPosition.y), parseFloat(this.asyncPosition.z) + parseFloat(dz));
    }

    this.setRelativePosition();
    this._moveXYZE({ z: dz, e: e, v: v });
  }

  extrudeToX(x, v, e, multiplier = false, comment = '') {
    // Move directly in X while extruding
    if (e == null) {
      e = this.makeE(parseFloat(x), this.asyncPosition.y, this.asyncPosition.z);
    } else if (multiplier) {
      e = e * this.makeE(parseFloat(x), parseFloat(this.asyncPosition.y), parseFloat(this.asyncPosition.z));
    }

    this.setAbsolutePositionXYZ();
    this._moveXYZE({ x: x, e: e, v: v, comment: comment });
  }

  extrudeToY(y, v, e, multiplier = false, comment = '') {
    // Move directly in Y while extruding
    if (e == null) {
      e = this.makeE(this.asyncPosition.x, parseFloat(y), this.asyncPosition.z);
    } else if (multiplier) {
      e = e * this.makeE(parseFloat(this.asyncPosition.x), parseFloat(y), parseFloat(this.asyncPosition.z));
    }

    this.setAbsolutePositionXYZ();
    this._moveXYZE({ y: y, e: e, v: v, comment: comment });
  }

  extrudeToXY(x, y, v, e, multiplier = false, comment = '') {
    // Move directly in X & Y while extruding
    if (e == null) {
      e = this.makeE(parseFloat(x), parseFloat(y), this.asyncPosition.z);
    } else if (multiplier) {
      e = e * this.makeE(parseFloat(x), parseFloat(y), parseFloat(this.asyncPosition.z));
    }

    this.setAbsolutePositionXYZ();
    this._moveXYZE({ x: x, y: y, e: e, v: v, comment: comment });
  }

  extrudeToZ(z, v, e, multiplier = false, comment = '') {
    // Move directly in Z while extruding
    if (e == null) {
      e = this.makeE(this.asyncPosition.x, this.asyncPosition.y, parseFloat(z));
    } else if (multiplier) {
      e = e * this.makeE(parseFloat(this.asyncPosition.x), parseFloat(this.asyncPosition.y), parseFloat(z));
    }

    this.setAbsolutePositionXYZ();
    this._moveXYZE({ z: z, e: e, v: v, comment: comment });
  }

  setSpeed(v) {
    this._moveXYZE({ v: v });
  }

  prime(de, v) {
    // To prime after a retraction, add ;prime comment to filter in rendering
    this.setRelativePosition();
    this._moveXYZE({ e: de, v: v, comment: 'prime' });
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
    function dist3D(x, y, z) {
      return sqrt((x - _fab.asyncPosition.x) ** 2 + (y - _fab.asyncPosition.y) ** 2 + (z - _fab.asyncPosition.z) ** 2);
    }
    // CHANGED THIS to toFixed(4) instead of 2
    return (
      dist3D(x, y, z) * ((this._nozzleDiameter / 2) / (this._filamentDiameter / 2)) ** 2
    ).toFixed(4);
  }

  mm_sec_to_mm_min(v) {
    return v * 60.0; // convert from mm/sec to mm/min
  }

  // TESTING FOR JUBILEE organize this later
  pickupTool(tool_idx) {
    var cmd = `T${tool_idx}`
    this.add(cmd);
  }

  addComment(c) {
    _fab.commands[_fab.commands.length - 1] += ` ;${c}`;
    _fab.commandStream[_fab.commands.length - 1] += ` ;${c}`;
  }

  downloadFabscriptionLog() {
    console.log("DOWNLOADING")
    let logWriter = createWriter('fabLog.json');
    const dataToWrite = {
      sketch: fab.sketch,
      log: fab.log,
      gcode: fab.sentCommandsFiltered,
      stack: fab.trace,
      midi: fab.midiRecording,
      gcodeToMidiTime: fab.gcodeToMidiTimestamps,
    }

    logWriter.write(JSON.stringify(dataToWrite, null, 4));
    logWriter.close();
  }
}

function mmPerMin(v) {
  return v * 60.0; // convert from mm/sec to mm/min
}

function windowResized() {
  try {
    _recoverCameraPosition = true;
    resizeCanvas(windowWidth, windowHeight);
  }
  catch (e) {
    console.log(e);
  }
}
