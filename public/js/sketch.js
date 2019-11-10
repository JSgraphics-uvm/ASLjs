let img = {};
let vehicles = [];
let digit_boxes = [];

let debug_msg = [];

function preload() {
    classifier.init();
    img['vehicle'] = loadImage("images/cursor.png");
    function loadSanta(action='Walk') {
        fname = [];
        for (let i=1;i<=13;i++) {
            fname.push(`assets/santasprites/png/${action} (${i}).png`);
        }
        img[`santa_${action}`] = loadAnimation(...fname);
        img[`santa_${action}`].frameDelay = 5;
    }
    loadSanta('Walk');
    loadSanta('Idle');
}
let sprites = [];
function setup() {
    createCanvas(windowWidth, windowHeight);
    vehicles.push(new Vehicle());
    let box_size = 80;
    let box = createSprite(0,0,box_size,box_size);
    box.size = box_size;
    box.position = createVector(random(windowWidth-2*box_size)+box_size, random(windowHeight-2*box_size)+box_size);
    box.digit = 0;
    box.draw = function() { push(); fill(100); rect(0,0,box_size,box_size);         
        textSize(this.size*0.8);
        textAlign(CENTER, CENTER);
        fill(200);
        text(this.digit, 0, 0);
        pop(); }
    digit_boxes.push(box);
    
    for (let i=0;i<10;i++) {
        let sprite = createSprite(0,0,50,50);
        sprite.friction = random(0.02)+0.01;
        sprite.position = createVector(random(windowWidth), random(windowHeight));
        let color = [random(255), random(255), random(255)];
        sprite.draw = function() { push(); fill(...color); ellipse(0,0,10,10); pop(); }
        sprites.push(sprite);
    }
}

function draw() {
    debug_msg = [];
    background(255);
    animation(img['santa_Idle'], 400, 300);

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
    for (let sprite of sprites) {
        for (let box of digit_boxes) {
            sprite.attractionPoint(1, box.position.x, box.position.y);
        }
    }

    drawSprites();
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