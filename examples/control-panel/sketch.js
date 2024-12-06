let fab;
let bStep, absX, absY, absZ, curPos;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  setupUI();

  fab = createFab(); 
}

function fabDraw() {
  // the 'print' button will manually call fabDraw, f you want to put anything in here
}

function connectPrinter() {
    fab.connectPrinter();
  }

function bSend(dir) {
  let u = bStep.value();
  fab.setRelativePosition();
  switch(dir) {
    case 'xl':
      fab.moveX(-1*u);
      fab.print();
      break;

    case 'xr':
      fab.moveX(u);
      break;

    case 'yl':
      fab.moveY(-1*u);
      break;
    
    case 'yr':
      fab.moveY(u);
      break;

    case 'u':
      fab.moveZ(u);
      break;

    case 'd':
      fab.moveZ(-1*u);
      break;

    case 'h':
      fab.autoHome();
      break;

    case 'x':
      u = absX.value();
      fab.setAbsolutePosition();
      fab.setERelative();
      fab.moveX(u);
      break;
    
    case 'y':
      u = absY.value();
      fab.setAbsolutePosition();
      fab.setERelative();
      fab.moveY(u);
      break;

    case 'z':
      u  = absZ.value();
      fab.setAbsolutePosition();
      fab.setERelative();
      fab.moveZ(u);
      break;
    }
      
  fab.getPos();
  fab.print();

 curPos.html(fab.reportedPos); 
}

function heatNozzle() {
  fab.setNozzleTemp(200);
  fab.print();
}

function coolNozzle() {
  fab.setNozzleTemp(0);
  fab.print();
}

function sendStop() {
  fab.stopPrint();
  fab.print();
}

function setupUI() {
  // ************** CONTROLS UI ************** //
  let l = 50; // p5 doesn't grab updated width from css class

  // make buttons & inputs
  let hXY = createElement('h2', 'XY'); // header XY
  let hZ = createElement('h2', 'Z');
  let blx = createButton('👈'); // button-left-x⬆⬆⬇⬇⬅➡⬅➡
  let brx = createButton('👉');
  let bly = createButton('☝️');
  let bry = createButton('👇');
  let buz = createButton('☝️');
  let bdz = createButton('👇');
  let bXYhome = createButton('🏠');
  let bZhome = createButton('🏠');

  // style the buttons
  let buttons = [blx, brx, bly, bry, buz, bdz, bXYhome, bZhome];
  for (const b of buttons) {
    b.addClass('controls');
  }

  // position buttons
  hXY.position(windowWidth/3 + 13, windowHeight/6 - 25);
  bXYhome.position(windowWidth/3, windowHeight/4);
  blx.position(windowWidth/3 - 5*l/4, windowHeight/4);
  brx.position(windowWidth/3 + 5*l/4, windowHeight/4);
  bly.position(windowWidth/3, windowHeight/4 - 5*l/4);
  bry.position(windowWidth/3, windowHeight/4 + 5*l/4);

  hZ.position(2*windowWidth/3 + 20, windowHeight/6 - 25);
  bZhome.position(2 * windowWidth/3, windowHeight/4);
  buz.position(2*windowWidth/3, windowHeight/4 - 5*l/4);
  bdz.position(2*windowWidth/3, windowHeight/4 + 5*l/4);

  // left-side panel
  bStep  = createInput('1');
  bStep.attribute('type', 'number');
  bStep.attribute('step', '0.1');
  bStep.attribute('min', '0');
  let bStepLabel = createElement('label', 'step size (mm)');
  
  bStep.position(windowWidth/7, windowHeight/8);
  bStep.size(40);
  bStepLabel.position(25, windowHeight/8);

  absX = createInput('0');
  absY = createInput('0');
  absZ = createInput('0');
  let bAbsX = createButton('➡️');
  let bAbsY = createButton('➡️');
  let bAbsZ = createButton('➡️');
  let absButtons = [bAbsX, bAbsY, bAbsZ];
  let absPos = [absX, absY, absZ];
  let absLabels = [createElement('label', 'X (mm)'), createElement('label', 'Y (mm)'), createElement('label', 'Z (mm)')];
  // let xLabel = createElement('label', 'X (mm)');

  for (const i of absPos) {
    let idx = absPos.indexOf(i);
    i.attribute('type', 'number');
    i.attribute('step', '10');
    i.attribute('min', '0');
    i.size(40);
    i.position(windowWidth/7, windowHeight/8 + 40*(idx+1));
    absLabels[idx].position(25, windowHeight/8 +40*(idx+1));
    absButtons[idx].addClass('go-button');
    absButtons[idx].position(windowWidth/7 + i.width, windowHeight/8 + 40*(idx) + 20);
  }


  let bConnectPrinter = createButton('Connect!');
  bConnectPrinter.position(80, windowHeight/3 - 20);
  bConnectPrinter.addClass('heat-button');
  bConnectPrinter.mousePressed(connectPrinter);

  let bHeatNozzle = createButton('Heat Nozzle');
  bHeatNozzle.position(20, windowHeight/3 + 30);
  bHeatNozzle.addClass('heat-button');
  bHeatNozzle.mousePressed(heatNozzle);
  

  let bCoolNozzle = createButton('Cool Nozzle');
  bCoolNozzle.position(windowWidth/7 - 30, windowHeight/3 + 30);
  bCoolNozzle.addClass('heat-button');
  bCoolNozzle.mousePressed(coolNozzle);

  let bPrint = createButton('Print!');
  bPrint.addClass('heat-button');
  bPrint.position(80, windowHeight/3 + 80);
  bPrint.mousePressed(fabDraw);


  curPos = createElement('text', 'Current Position: N/A');
  curPos.position(25, 6*windowHeight/8);
  // end left-side panel

  // add button events
  blx.mousePressed(function() { bSend('xl');});
  brx.mousePressed(function() { bSend('xr');});
  bly.mousePressed(function() { bSend('yl');});
  bry.mousePressed(function() { bSend('yr');});
  buz.mousePressed(function() { bSend('u');});
  bdz.mousePressed(function() { bSend('d');});
  bXYhome.mousePressed(function() { bSend('h');});
  bZhome.mousePressed(function() { bSend('h');});
  bAbsX.mousePressed(function() { bSend('x');});
  bAbsY.mousePressed(function() { bSend('y');});
  bAbsZ.mousePressed(function() { bSend('z');});
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }