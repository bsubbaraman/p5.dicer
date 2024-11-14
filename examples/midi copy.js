
export const midiEx = `function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  // fab = createFab();

  // // turn on midi mode!
  // midiController = createMidiController(debug=true);
  // midiMode(); 
}

function fabDraw() {
  // setup!
  fab.setAbsolutePosition(); // set all axes (x/y/z/extruder) to absolute
  fab.setERelative();        // put extruder in relative mode, independent of other axes
  fab.autoHome();

  // variables!
  let sideLength = 20;                                  // mm
  let center = new p5.Vector(fab.centerX, fab.centerY);
  let speed = 10;                                       // mm/sec
  let layerHeight = 0.5;                                // mm
  let spacing = 2;                                      // mm

  // move to the start (x,y,z) position without extruding
  fab.moveRetract(center.x - sideLength/2, center.y - sideLength/2, layerHeight); 

  let layer = 0;
  for (let z = layerHeight; z <= sideLength; z += layerHeight) { 
    if (z == layerHeight) { 
      speed = 10; // slow print speeed down for the first layer
    }
    else {
      speed = 10;
    }

    if (layer % 2 == 0) {
      for (let y = center.y - sideLength/2; y < center.y + sideLength/2; y += 2 * spacing) {
        fab.moveExtrude(center.x + sideLength/2, y, z, speed); // move along the bottom side while extruding filament
        fab.moveExtrude(center.x + sideLength/2, y + spacing, z, speed);
        fab.moveExtrude(center.x - sideLength/2, y + spacing, z, speed);
        fab.moveExtrude(center.x - sideLength/2, y + 2 * spacing, z, speed);
      }
    }
    else {
      for (let y = center.y + sideLength/2; y > center.y - sideLength/2; y -= 2 * spacing) {
        fab.moveExtrude(center.x + sideLength/2, y, z, speed); // move along the bottom side while extruding filament
        fab.moveExtrude(center.x + sideLength/2, y - spacing, z, speed);
        fab.moveExtrude(center.x - sideLength/2, y - spacing, z, speed);
        fab.moveExtrude(center.x - sideLength/2, y - 2 * spacing, z, speed);
      }
    }

    layer += 1;
  }

  fab.presentPart();
  fab.render();
}

// function midiSetup(midiData) {
//   // in midiSetup, we can specify the actions we want to happen on incoming note values
//   // to figure out notes for your midi controller, use debug=true in createMidiController
//   if (midiData.note == 1 && midiData.type == midiController.MidiTypes.NOTEON) { 
//     fab.print();
//   }

//   if (midiData.note == 16) { 
//     // for any incoming value, we can name the property we want to change in midiDraw
//     midiController.speed = midiData.mapVelocity(100, 3000); // values in mm/min
//   }

//   if (midiData.note == 20) {
//     midiController.extrusionMultiplier =  midiData.mapVelocity(0.5, 5);
//   }

//   if (midiData.note == 24) {
//     midiController.zOff =  midiData.mapVelocity(0, 15);
//   }
// }

// function midiDraw(moveCommand) {
//   // in midiDraw, we can modify commands as they're sent to the printer
//   // moveCommand has x, y, z, e, and f properties (f is speed)
//   // we can modify them with any midiController property that we defined in midiSetup
//   if (midiController.speed) {
//     moveCommand.f = midiController.speed;
//   }

//   if (midiController.extrusionMultiplier) {
//     moveCommand.e *= midiController.extrusionMultiplier;
//   }

//   if (midiController.zOff) {
//     moveCommand.z += midiController.zOff;
//   }

//   return moveCommand; // be sure to return your modified moveCommand!
// }

function draw() {
  orbitControl(2, 2, 0.1);
  background(255);
  fab.render();
}
`