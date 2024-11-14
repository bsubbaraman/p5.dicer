function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  midiController = createMidiController(debug=true);
}

function fabDraw() {
  fab.setAbsolutePosition(); // set all axes (x.y/z/extruder) to absolute
  fab.setERelative(); // put extruder in relative mode, independent of other axes
  fab.autoHome();
  fab.setTemps(205, 60); // (nozzle, bed) °C - you should use a temperature best suited for your filament!

  let r = 25;
  let layerHeight = 0.2;
  let h = 10;
  let s = 25;
  let center = new p5.Vector(fab.centerX, fab.centerY);
  let maxAmp = 5;
  for (let z = layerHeight; z < h; z += layerHeight) {
    let amplitude = map(z, layerHeight, h, 0, maxAmp);
    for (let t = 0; t <= TWO_PI; t += TWO_PI / 100) {
      let tt = map(t, 0, TWO_PI, 0, 6 * PI);
      let dz = abs(sin(tt));
      if (z == layerHeight && t == 0) {
        fab.moveRetract(r * cos(t) + center.x, r * sin(t) + center.y, z);
      } else {
        fab.moveExtrude(
          r * cos(t) + center.x,
          r * sin(t) + center.y,
          z + amplitude * dz
        );
      }
    }
  }

  fab.presentPart();
}

function midiSetup() {
  // map midi values!
}

function midiDraw(moveCommand) {
  // do things with your midi values

  return moveCommand;
}

function draw() {
  background(255);
  fab.render();
}
