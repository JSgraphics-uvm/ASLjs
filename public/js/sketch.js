let img = {};
let vehicles = [];
let digit_boxes = [];

let debug_msg = [];

function preload() {
    classifier.init();
    img['vehicle'] = loadImage("images/cursor.png");
}
function setup() {
    createCanvas(windowWidth, windowHeight);
    vehicles.push(new Vehicle());
    digit_boxes.push(new DigitBox());
}

function draw() {
    debug_msg = [];
    background(0);

    //the global variable `gesture_digit` will be set in `classifier.predict()` method 
    debug(`digit = ${gesture_digit}`);

    if (hands !== null) { //leapmotion is initialized.
        if (hands.length >= 1) { //there is/are hand(s) sensored.
            // draw any thing you want:
            push();
            let c = map(gesture_digit,0,9,0,255);
            fill(c,50,0);
            translate(windowWidth-150,windowHeight-100);
            for (let a=0;a<5;a++) {
                for (let b=0;b<4;b++) {
                    let x = hand_data[0][a][b][0];
                    let y = hand_data[1][a][b][0];
                    ellipse(x*80, -y*80, 10);
                }
            }
            pop();
        }
    }

    for (let box of digit_boxes) {
        if (gesture_digit==box.digit) {
            box.reset();
        }
        box.show();
    }

    for (let vehicle of vehicles) {
        vehicle.show();
        let distance;
        for (let box of digit_boxes) {
            force = createVector(box.position.x - vehicle.position.x, box.position.y-vehicle.position.y);
            force.setMag(1/dist(box.position, vehicle.position)^2)
            break;
            
        }
        vehicle.iterate( force, stepsize=0.8 );
    }


    draw_debug();
}

function draw_debug() {
    push();
    fill(0, 102, 153);
    textSize(20);
    let n=0;
    for (let t of debug_msg) {
        text(t, n, windowHeight-10);
        n+=100;
    }
    pop();
}

function debug(msg){
    debug_msg.push(msg);
}