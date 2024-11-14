
export const midiEx = `function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
}

function fabDraw() {
  // setup!
  fab.setAbsolutePosition();  // set all axes (x/y/z/extruder) to absolute
  fab.setERelative();         // put extruder in relative mode, independent of other axes
  fab.autoHome();
  fab.setTemps(205, 60);      // (nozzle, bed) °C - you should use a temperature best suited for your filament!
  
  // variables for our cube
  let sideLength = 20; //mm
  let x = fab.centerX - sideLength/2; 
  let y = fab.centerY - sideLength/2;
  let speed = 10; // mm/sec
  let layerHeight = 0.2; // mm

  fab.moveRetract(x, y, layerHeight); // move to the start (x,y,z) position without extruding

  for (let z = layerHeight; z <= sideLength; z += layerHeight) { 
    // slow down for the first layer
    if (z == layerHeight) {
      speed = 10;
    }
    else {
      speed = 20;
    }
    fab.moveExtrude(x + sideLength, y, z, speed);               // move along the bottom side while extruding filament
    fab.moveExtrude(x + sideLength, y + sideLength, z, speed);  // right side
    fab.moveExtrude(x, y + sideLength, z, speed);               // top side
    fab.moveExtrude(x, y, z, speed);                            // left side
  }

  fab.presentPart();
}

function midiSetup(midiData) {
  // in midiSetup, we can specify the actions we want to happen on incoming note values
  // to figure out notes for your midi controller, use debug=true in createMidiController
  // and open up your console (cmd + option + i)
  // in the incoming midi data, the 'note' is the unique id for the button/knob/etc you're using
  // and the velocity will be a value between 0 and 127

  if (midiData.note == 16) { 
    // for any incoming value, we can name the property we want to change in midiDraw
    midiController.speed = midiData.mapValue(100, 3000); // values in mm/min
  }

  if (midiData.note == 20) {
    midiController.extrusionMultiplier =  midiData.mapValue(0.5, 5);
  }

  if (midiData.note == 24) {
    midiController.zOff =  midiData.mapValue(0, 15);
  }
}

function midiDraw(moveCommand) {
  // in midiDraw, we modify movement commands as they're sent to the printer
  // moveCommand has x, y, z, e, and f properties (f is speed)
  // we can modify them with any midiController property that we defined in midiSetup

  if (midiController.speed) {
    // set the speed to the midicontroller value
    moveCommand.f = midiController.speed;
  }

  if (midiController.extrusionMultiplier) {
    // multiply extrusion values by midicontroller value
    moveCommand.e *= midiController.extrusionMultiplier;
  }

  if (midiController.zOff) {
    // add a z offset
    moveCommand.z += midiController.zOff;
  }

  return moveCommand; // return your modified moveCommand!
}

function draw() {
  orbitControl(2, 2, 0.1);
  background(255);
  fab.render();
}
`