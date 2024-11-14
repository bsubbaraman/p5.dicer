let extrudeToggle = false;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
}

function fabDraw() {
  fab.autoHome();
  fab.setTemps(205, 60)
  
  fab.continuousMode = true;
}

function midiSetup(midiData) {
  // Edit the note values to accommodate your MIDI controller

  // Use a first knob to move in X
  if (midiData.note == 16) {
    midiController.x = midiData.mapValue(0, fab.maxX);
    if (extrudeToggle) {
      fab.extrudeToX(midiController.x);
    }
    else {
      fab.moveToX(midiController.x);
    }
    fab.print();
  }

  // Another for Y
  if (midiData.note == 17) {
    midiController.y = midiData.mapValue(0, fab.maxY);
    if (extrudeToggle) {
      fab.extrudeToY(midiController.y);
    }
    else {
      fab.moveToY(midiController.y);
    }
    fab.print();
  }

  // Another for Z
  if (midiData.note == 18) {
    midiController.z = midiData.mapValue(0.2, 1);
    if (extrudeToggle) {
      fab.extrudeToZ(midiController.z);
    }
    else {
      fab.moveToZ(midiController.z);
    }
    fab.print();
  }

  // Another to change the speed
  if (midiData.note == 0) {
    midiController.speed = midiData.mapValue(10, 50);
    fab.setSpeed(midiController.speed);
    fab.print();
  }

  // Use a button to toggle between moving with or without extruding
  // Different midi controllers might have different behaviours when pressing buttons
  // So try pressing one and see how the data changes in the midi info pane
  if (midiData.note == 41 && midiData.value == 127) {
    extrudeToggle = !extrudeToggle;
    console.log(extrudeToggle);
  }
}

function midiDraw(moveCommand) {

  return moveCommand;
}

function draw() {
  background(255);
  fab.render();
}