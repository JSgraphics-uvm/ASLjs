let img = {};
let world = null;
let digit_font = null;
let initial_speed = 5;
let box_speed = initial_speed;
let box_width = 80;
let boxes = null;
let dead_boxes = null;
let btn_restart = null;
let game_over = false;
let game_pause = false;
let colors = ['#f2cb68', '#ffc1ff', '#69e6ea', '#ffba84', '#ffacc7', '#b1e27e', '#afd4fd', '#87e0b1', '#eebcd1', '#ffb396'];
let match = 0;
let match_max = 5;
let total_score = 0;
let last_digit = 0;
let slider_speed = null;

function preload() {
    world = {
        width: 10*box_width,
        left: function(){return (windowWidth-this.width)/2;},
        right: function(){return (windowWidth+this.width)/2;},
        bottom: function(){return windowHeight;},
    };
    digit_font = loadFont('assets/digit_font/Station.ttf');
}
function setup() {
    createCanvas(windowWidth, windowHeight);

    slider_speed = createSlider(1, 22, 4, 3);
    slider_speed.position(120, 10);
    slider_width = createSlider(2, 9, 9, 1);
    slider_width.position(120, 50);

    boxes = new Group();
    dead_boxes = new Group();
    boxes.creating = false;


    asl_gesture = createSprite(world.left()-200, windowHeight/2);
    asl_gesture.addAnimation('digit', 'assets/asl_digits_supter_s/0.png', 'assets/asl_digits_supter_s/9.png');
    asl_gesture.scale = 0.6 ;

    my_gesture = createSprite(world.right()+200, windowHeight/2+25);
    my_gesture.addAnimation('digit', 'assets/asl_gesture_anne/0.png', 'assets/asl_gesture_anne/9.png');
    my_gesture.scale = 1;
    my_gesture_monitor = createSprite(world.right()+200, windowHeight/2+50);
    my_gesture_monitor.addAnimation('monitor', 'assets/background/monitor.png');
    my_gesture_monitor.scale = 0.3;
    //createBox();

    btn_restart = new Clickable();     //Create button
    btn_restart.text = "Restart Game";
    btn_restart.locate(280, 20);        //Position Button
    btn_restart.onPress = function(){  //When myButton is pressed
        //this.color = "#AAAAFF";       //Change button color
        restart();
    }
    restart();
}
function restart() {
    game_over = false;
    game_pause = false;
    boxes.removeSprites()
    boxes.clear();
    dead_boxes.removeSprites();
    dead_boxes.clear();
    initial_speed = slider_speed.value();
    world.width = slider_width.value() * box_width;
    box_speed=initial_speed;
}

function createBox() {
    if (boxes.length>1 || boxes.creating || game_over) return;
    boxes.creating = true;

    let n = Math.floor(world.width/box_width);
    let box = createSprite(box_width/2+world.left()+Math.floor(random(n))*box_width,-box_width,box_width-1,box_width);
    
    let candidate = [0,1,2,3,4,5,6,7,8,9];
    candidate.splice(last_digit,1);
    //print(candidate)
    box.digit =random(candidate);
    //console.log(`last digit ${last_digit} this one ${box.digit}`);
    last_digit = box.digit;

    box.draw = function() {
        fill(colors[this.digit]);
        rect(0,0,box_width,box_width,20);
        fill(255)
        rect(-box_width/2+box_width/5,-box_width/2+box_width/5,box_width/10,box_width/10,20);
        fill(80)
        textSize(box_width/2);
        textFont(digit_font);
        textAlign(CENTER, CENTER);
        text(this.digit,0,-box_width/20);
    }
    box.velocity.y=box_speed;

    asl_gesture.animation.stop();
    asl_gesture.animation.changeFrame(box.digit);

    box_speed += 0.1;
    
    boxes.add(box);

    boxes.creating = false;
    match = 0;
}

function collide(a, b) {
    a.velocity.y = 0;
    a.position.y = b.position.y - box_width;
    boxes.remove(a);
    dead_boxes.add(a);
    if (a.position.y<50) {
        game_over = true;
    } else {
        //createBox();
    }
    console.log('collide')
}

function pause() {
    game_pause = 1-game_pause;
    for (let i=0;i<boxes.length;i++) {
        boxes[i].velocity.y = game_pause?0:box_speed;
    }
}

function draw() {
    background(255);
    textSize(16);
    text("Initial Speed:", 10,27);
    text("World Width:", 10, 67);
    noStroke();
    fill(250);
    rect(world.left(), 0, world.width, windowHeight);
    
    if (boxes.length<=0) createBox();

    if (keyWentDown(' ')) {
        pause();        
    }

    if (!game_over && !game_pause) {
        // for safety reason, limit the number of dead_boxes to 10
        if (dead_boxes.length>100) {
            let box = dead_boxes.get(0);
            box.remove();
        }

        if (gesture_digit==-1) {
            if (boxes.length>0) {
                asl_gesture.animation.changeFrame(boxes[boxes.length-1].digit);
            }
        } else {
            if (game_over) {
                asl_gesture.animation.changeFrame(gesture_digit);
            }
        }
        if (!game_over) {
            
            boxes.overlap(dead_boxes, collide);

            for (let i=0;i<boxes.length;i++) {
                if (gesture_digit==boxes.get(i).digit) {
                    match ++;
                    if (match>=match_max) {
                        let box = boxes.get(i);
                        box.velocity.x = (random()<0.5)?100:-100;
                        box.velocity.y = -50;
                        boxes.remove(box);
                        total_score ++;
                    }
                    //boxes.remove(box);
                    //createBox();
                } else if (boxes.get(i).position.y >= windowHeight-box_width/2) {
                    boxes.get(i).position.y = windowHeight-box_width/2;
                    boxes.get(i).velocity.y=0;
                    let box = boxes.get(i);
                    boxes.remove(box);
                    dead_boxes.add(box);
                    //createBox();
                }
            }
            
        }
    }
    draw_match_bar();
    draw_total_score();
    drawSprites();
    draw_virtual_hand();
    
    if (game_over) {
        push();
        fill('rgba(31.4%,31.4%,31.4%,0.5)');
        rect(world.left(),0,world.width,windowHeight);
        fill(255);
        strokeWeight(5);
        stroke(100);
        textFont(digit_font);
        textAlign(CENTER, CENTER);
        textSize(100);
        text("GAME OVER", windowWidth/2, windowHeight/2);
        pop();
    } else if (game_pause) {
        push();
        fill('rgba(31.4%,31.4%,31.4%,0.5)');
        rect(world.left(),0,world.width,windowHeight);
        fill(255);
        strokeWeight(5);
        stroke(100);
        textFont(digit_font);
        textAlign(CENTER, CENTER);
        textSize(100);
        text("PAUSE", windowWidth/2, windowHeight/2);
        pop();
    }

    btn_restart.draw();

}

function draw_total_score() {
    push();
    translate(windowWidth, 0);
    textAlign(RIGHT,TOP);
    textSize(30);
    textFont(digit_font);
    fill(colors[0])
    let t = "0000" + total_score;
    t.substr(t.length-5);
    text(`SCORE: ${t} `, 0,0);
    pop();
}
function draw_match_bar() {
    push();
    translate(my_gesture_monitor.position.x -110, my_gesture_monitor.position.y +50);
    noStroke();
    fill(240);
    rect(0,0,220,-150);
    fill(200,255,200)
    rect(0,0,220,map(match, 0,match_max, 0,-150));
    pop();
}

function draw_virtual_hand() {
    if (gesture_digit==-1) {
        my_gesture.visible = false;
    } else {
        my_gesture.animation.stop();
        my_gesture.animation.changeFrame(gesture_digit);
        my_gesture.visible = true;
        let s = map(hands[0].fingers[1].bones[0].nextJoint[1]-100, -100, 500, 1,0.2);
        my_gesture.scale = s;
        console.log(hands[0].fingers[1].bones[0].nextJoint[1])
    }
    return;
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
                    ellipse(-x*80, -y*80, 10);
                }
            }
            pop();
        }
    }
}

