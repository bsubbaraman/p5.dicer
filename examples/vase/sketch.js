let fab;
let printButton;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  fab = createFab();

  // add a buttons to connect to the printer & to print!
  let connectButton = createButton('connect!');
  connectButton.position(20, 20);
  connectButton.mousePressed(function() {
    fab.serial.requestPort();
  });

  let printButton = createButton('print!');
  printButton.position(20, 60);
  printButton.mousePressed(function() {
    fab.print();
  });

  let stopButton = createButton('stop!');
  stopButton.position(20, 100);
  stopButton.mousePressed(function() {
    fab.stopPrint(); // stop streaming the commands to printer.
  });

  let exportButton = createButton('export!');
  exportButton.position(20, 140);
  exportButton.mousePressed(function() {
    fab.exportGcode(); // export gcode to a file.
  });
}

function draw() {
  orbitControl(2, 2, 0.1);
  background(255);
  fab.render();
}

function fabDraw() {
  // setup printing variables
  // this is a standard setup block:
  let s = 25; // speed, mm/min
  fab.setERelative();
  fab.fanOff();
  fab.autoHome();
  fab.setNozzleTemp(200); // wait for nozzle to heat up
  fab.setBedTemp(70); // wait for bed to heat up
  fab.introLine(); // line back and forth to clean nozzle
    
  // design your artifact here!
  // here's a vase example
  let r = 10;
  let step = TWO_PI / 100;
  let startHeight = 0.2;
  let maxHeight = 150;
  let layerHeight = 1;
  let rb = 50;
  let amp = 5;
  // vase
  for (let z = startHeight; z < maxHeight; z += layerHeight) {
    let a = map(z, startHeight, maxHeight, 0, 4 * TWO_PI);
    r = map(
    cos(map(z / maxHeight, 0, 1, 2, 0.5) * a),
      -1,
      1,
      rb - 5 * cos(a) * (1 - z / maxHeight),
      rb + 5 * cos(a) * (1 - z / maxHeight)
      );
    
    for (let t = 0; t < TWO_PI; t += step) {
      let x = r * cos(t) + 100;
      let y = r * sin(t) + 100;
      fab.moveExtrude(x, y, z, s);
    }
  }
  // end artifact
    
  fab.presentPart(); // pop the bed out. 
}

  // line vase
  // let startHeight = 0.2;
  // let o = 2;
  // let s = 1500;
  // let x = 100;
  // let y = 100;
  // let sf = 0;
  // let l = 40;
  // for (let h = startHeight; h <= 40+startHeight; h += o) { //o=2, s=1500 works well here
  //   // lines
  //   fab.moveExtrude(x + l, y+sf, h, s);
  //   fab.moveExtrude(x + l - sf, y + l, h, s);
  //   fab.moveExtrude(x, y + l - sf, h, s);
  //   fab.moveExtrude(x + sf, y, h, s);

  //   // dots
  //   fab.moveExtrude(x + sf, y, h + o, 25, 5);
  //   fab.moveRetract(x + l, y + sf, h, 3 * s);
  //   fab.moveExtrude(x + l, y + sf, h + o, 25, 5);
  //   fab.moveRetract(x + l - sf, y + l, h, 3 * s);
  //   fab.moveExtrude(x + l - sf, y + l, h + o, 25, 5);
  //   fab.moveRetract(x, y + l - sf, h, 3 * s);
  //   fab.moveExtrude(x, y + l - sf, h + o, 25, 5);
  //   fab.move(x + sf, y, h + o, s);

  //   // sf += map(l, 0, 40, 0, 0.5);
  //   // l-=0.5;
  //   // h+=o;
  // }

