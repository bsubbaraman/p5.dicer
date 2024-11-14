
let _midiController;

p5.prototype.midiMode = function () {
  console.log('midimode is on')
  _fab.midiMode = true;
};

p5.prototype.createMidiController = function (debug = false) {
  _midiController = null;
  _midiController = new MidiController(debug);
  return _midiController;
};

class MidiData {
  constructor(data) {
    this.command = parseFloat(data[0] >> 4)
    this.channel = parseFloat(data[0] & 0xf)
    this.type = parseFloat(data[0] & 0xf0)
    this.note = parseFloat(data[1])
    this.value = parseFloat(data[2]) // using 'value' instead of 'velocity' to avoid confusion with speed
    this.NOTEON = 144;
    this.NOTEOFF = 128;
  }

  mapValue(start, end) {
    return round(map(this.value, 0, 127, start, end), 2);
  }
}

class MidiController {
  constructor(debug) {
    if (!navigator.requestMIDIAccess) alert('WebMIDI is not supported in this browser.');

    // navigator.requestMIDIAccess()
    //   .then(this.onMIDISuccess.bind(this), this.onMIDIFailure.bind(this));

    this.debug = debug;
    this.connected = false;
  }

  onMIDISuccess(midiAccess) {
    try {
      const midi = midiAccess
      const inputs = midi.inputs.values()
      const input = inputs.next()
      input.value.onmidimessage = this.onMIDIMessage
      this.connected = true;
    }
    catch (e) {
      this.connected = false;
      alert("No MIDI device found!");
      
    }

    var messageData = { 
      connected: this.connected,
    }
    this.postMessage("MIDI_CONNECTION_CHANGE", messageData);
  }

  onMIDIFailure(e) {
    console.log('Could not access your MIDI devices: ', e)
  }


  onMIDIMessage(message) {
    const midiData = new MidiData(message.data);

    if (_midiController.debug) {
      var messageData = {
        midiData: midiData,
      }
      midiController.postMessage("MIDI_DATA", messageData);
    }

    if (_fab.midiSetup) {
      _fab.midiSetup(midiData);
    }
  }

  resetConnection() {
    this.connected = false;
  }

  postMessage(messageLabel, messageBody) {
    // Post messages from iframe to editor via console
    console.log(messageLabel, messageBody);
  }

  MidiTypes = {
    NOTEON: 144, // button down
    NOTEOFF: 127, // button up
  }
}


