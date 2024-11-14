function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
}

function fabDraw() {
  fab.autoHome();
  fab.setTemps(205, 55); // wait for nozzle & bed to heat up
    
  /* design your artifact here!
   *  here's a vase line vase, based on LIA's 'Filament Sculptures' 
   * https://www.liaworks.com/theprojects/filament-sculptures/
   */

  let startHeight = 0.2;
  let o = 2;
  let s = 40;
  let x = 100;
  let y = 100;
  let sf = 0;
  let maxL = 40;
  let l = 40;
  fab.moveRetract(x, y, startHeight); // move to start
  for (let h = startHeight; h <= l; h += o) { 
    // lines
    fab.moveExtrude(x + l, y+sf, h, s);
    fab.moveExtrude(x + l - sf, y + l, h, s);
    fab.moveExtrude(x, y + l - sf, h, s);
    fab.moveExtrude(x + sf, y, h, s);

    // dots
    fab.moveExtrude(x, y, h + o, 0.4, 5); // move slowly and extrude lots of filament on the dots
    fab.moveRetract(x + l, y, h, 3 * s); // move quickly from point to point to reduce stringing
    fab.moveExtrude(x + l, y, h + o, 0.4, 5);
    fab.moveRetract(x + l - sf, y + l, h, 3 * s);
    fab.moveExtrude(x + l - sf, y + l, h + o, 0.4, 5);
    fab.moveRetract(x, y + l - sf, h, 3 * s);
    fab.moveExtrude(x, y + l - sf, h + o, 0.4, 5);

    fab.moveRetract(x + sf, y, h + o, s);
  }
  // end artifact

  fab.presentPart(); // pop the bed out. 
}

function midiSetup(midiData) {

}

function midiDraw(moveCommand) {
  
  return moveCommand;
}

function draw() {
  background(255);
  fab.render();
}