let fab;

function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
    fab = createFab();
  
    let connectButton = createButton('connect!');
    connectButton.position(20, 20);
    connectButton.mousePressed(function() {
      fab.serial.requestPort(); // choose the serial port to connect to
    });

    let printButton = createButton('print!');
    printButton.position(20, 60);
    printButton.mousePressed(function() {
      fab.print(); // start streaming the commands to printer
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


function fabDraw() {
  // setup!
  fab.setAbsolutePosition(); // set the coordinate system mode
  fab.setERelative(); // it's easier to work with the extruder axis in relative positioning
  
  fab.autoHome(); // establish a (0,0,0)
  fab.setTemps(200, 60); // (bedTemp, nozzleTemp). hot! 

  fab.introLine(); // clean the nozzle

  fab.moveRetract(100, 100, 0.2); // moveRetract will move the nozzle without extruding filament
                                  // it's good for getting to your start location!

  // first steps: extruding filament!
  fab.moveExtrude(150, 100, 0.2); // a default speed of 25 mm/s is used, 
                                  // along with a reasonable amount of filament
  fab.moveExtrude(150, 150, 0.2, 10); // sloow
  fab.moveExtrude(100, 150, 0.2, 25); // 'normal'
  fab.moveExtrude(100, 100, 0.2, 80); // fast!
  
  fab.moveExtrude(100, 100, 1, 0.5, 5); // we can also explicitly set the amount of filament to extrude

  fab.presentPart(); // pull the nozzle away, and retract a bit of filament to stop oozing!
}
function draw() {
  orbitControl(2, 2, 0.1);
  background(255);
  fab.render();
}

