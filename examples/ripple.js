function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
}

function fabDraw() {
  fab.autoHome();
  fab.setTemps(205, 60); 

  let r = 25;
  let startHeight = 0.4;
  let layerHeight = 0.5;
  let h = 20;
  let s = 25;
  let center = new p5.Vector(fab.centerX, fab.centerY);
  let sideLength = 20;
  let x = center.x - sideLength / 2;
  let y = center.y - sideLength / 2;
  fab.moveRetract(x, y, layerHeight, 40);

  let amplitude = 0.5;
  let numOscillations = 25;
  let idx = 0;
  let phaseOffset = 0;
  for (let z = startHeight; z <= h; z += layerHeight) {
    idx += 1;
    // front
    for (let i = x; i <= x + sideLength; i += 1) {
      let t = map(i, x, x + sideLength, 0, numOscillations * PI);
      fab.moveExtrude(i, y + amplitude * sin(t + phaseOffset), z, 5, 5, true);
    }

    // right
    for (let i = y; i <= y + sideLength; i += 1) {
      let t = map(i, y, y + sideLength, 0, numOscillations * PI);
      fab.moveExtrude(
        x + sideLength + amplitude * sin(t + phaseOffset),
        i,
        z,
        5,
        5,
        true
      );
    }

    // back
    for (let i = x + sideLength; i >= x; i -= 1) {
      let t = map(i, x, x + sideLength, 0, numOscillations * PI);
      fab.moveExtrude(
        i,
        y + sideLength + amplitude * sin(t + phaseOffset),
        z,
        5,
        5,
        true
      );
    }

    // left
    for (let i = y + sideLength; i >= y; i -= 1) {
      let t = map(i, y, y + sideLength, 0, numOscillations * PI);
      fab.moveExtrude(x + amplitude * sin(t + phaseOffset), i, z, 5, 5, true);
    }
    phaseOffset += PI / 4;
  }

  fab.presentPart();
}

function midiSetup(midiData) {
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
