export const exampleSketch = `function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  fab = createFab();
}

function fabDraw() {
  // setup!
  fab.setAbsolutePosition(); // set all axes (x.y/z/extruder) to absolute
  fab.setERelative(); // put extruder in relative mode, independent of other axes
  fab.autoHome();
  fab.setTemps(205, 60); // (nozzle, bed) °C - you should use a temperature best suited for your filament!
  
  fab.introLine(0.2); // draw to lines on the left side of the print bed
  
  // variables for our hollow cube!
  const sideLength = 20; //mm
  const x = fab.centerX - sideLength/2; 
  const y = fab.centerY - sideLength/2;
  let speed = 10; // mm/sec
  const layerHeight = 0.2; // mm

  // design our hollow cube!
  fab.moveRetract(x, y, layerHeight); // move to the start (x,y,z) position without extruding

  for (let z = layerHeight; z <= sideLength; z += layerHeight) { 
    if (z == layerHeight) { // if it's the first layer
    speed = 10; // slow print speeed down for the first layer
    }
    else {
      speed = 25;
    }
    fab.moveExtrude(x + sideLength, y, z, speed); // move along the bottom side while extruding filament
    fab.moveExtrude(x + sideLength, y + sideLength, z, speed); // right side
    fab.moveExtrude(x, y + sideLength, z, speed); // top side
    fab.moveExtrude(x, y, z, speed); //left side
  }

  fab.presentPart();
  console.log('about to render...')
}

function draw() {
  background(255);
  fab.render();
}`