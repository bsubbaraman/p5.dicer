export const exampleSketch = `function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
}

function fabDraw() {
  // setup
  fab.autoHome();
  fab.setTemps(205, 60);                // (nozzle, bed) °C, use temps best suited for your filament!
  
  // variables for our hollow cube!
  const sideLength = 20;                // mm
  const x = fab.centerX - sideLength/2; 
  const y = fab.centerY - sideLength/2;
  const startHeight = 0.2               // mm
  const layerHeight = 0.2;              // mm
  let speed = 10;                       // mm/sec

  fab.introLine(startHeight);           // purge line to get filament flowing

  // design our hollow cube!
  fab.moveRetract(x, y, startHeight);   // move to the start (x,y,z) position without extruding

  for (let z = layerHeight; z <= sideLength; z += layerHeight) { 
    if (z == startHeight) {             // if it's the first layer
      speed = 10;                       // slow print speeed down for the first layer
    }
    else {
      speed = 25;
    }
    fab.moveExtrude(x + sideLength, y, z, speed);              // move along the bottom side while extruding filament
    fab.moveExtrude(x + sideLength, y + sideLength, z, speed); // right side
    fab.moveExtrude(x, y + sideLength, z, speed);              // top side
    fab.moveExtrude(x, y, z, speed);                           // left side
  }

  fab.presentPart();                                           // move the hotend away to grab print 
}

function draw() {
  background(255);
  fab.render();
}`