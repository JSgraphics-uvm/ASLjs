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
let colors = [
  "#f2cb68",
  "#ffc1ff",
  "#69e6ea",
  "#ffba84",
  "#ffacc7",
  "#b1e27e",
  "#afd4fd",
  "#87e0b1",
  "#eebcd1",
  "#ffb396"
];
let match = 0;
let match_max = 5;
let total_score = 0;
let last_digit = 0;
let slider_speed = null;

function preload() {
  this_user.stage = 0;
  world = {
    width: 9 * box_width,
    left: function() {
      return (windowWidth - this.width) / 2;
    },
    right: function() {
      return (windowWidth + this.width) / 2;
    },
    bottom: function() {
      return windowHeight;
    }
  };
  digit_font = loadFont("assets/digit_font/Station.ttf");
}
function setup() {
  createCanvas(windowWidth, windowHeight);

  slider_speed = createSlider(1, 22, 4, 3);
  slider_speed.position(120, 10);
  slider_width = createSlider(2, 9, 3, 1);
  slider_width.position(120, 50);

  boxes = new Group();
  dead_boxes = new Group();
  boxes.creating = false;

  hand_guide = loadImage("images/hand_guide0.png");

  asl_gesture = createSprite(world.left() - 200, windowHeight / 2);
  asl_gesture.addAnimation(
    "digit",
    "assets/asl_digits_supter_s/0.png",
    "assets/asl_digits_supter_s/9.png"
  );
  asl_gesture.scale = 0.6;

  my_gesture = createSprite(world.right() + 200, windowHeight / 2 + 25);
  my_gesture.addAnimation(
    "digit",
    "assets/asl_gesture_anne/0.png",
    "assets/asl_gesture_anne/9.png"
  );
  my_gesture.scale = 1;
  my_gesture_monitor = createSprite(world.right() + 200, windowHeight / 2 + 50);
  my_gesture_monitor.addAnimation("monitor", "assets/background/monitor.png");
  my_gesture_monitor.scale = 0.3;
  //createBox();

  btn_restart = new Clickable(); //Create button
  btn_restart.text = "Restart Game";
  btn_restart.locate(280, 20); //Position Button
  btn_restart.onPress = function() {
    //When myButton is pressed
    //this.color = "#AAAAFF";       //Change button color
    restart();
  };
  restart();
}
function restart() {
  game_over = false;
  game_pause = true;
  boxes.removeSprites();
  boxes.clear();
  dead_boxes.removeSprites();
  dead_boxes.clear();
  initial_speed = slider_speed.value();
  world.width = slider_width.value() * box_width;
  box_speed = initial_speed;
  total_score = 0;
  incDatabase("restart_time");
}

function createBox() {
  if (boxes.length > 1 || boxes.creating || game_over) return;
  boxes.creating = true;

  let n = Math.floor(world.width / box_width);
  let box = createSprite(
    box_width / 2 + world.left() + Math.floor(random(n)) * box_width,
    -box_width,
    box_width - 1,
    box_width
  );

  let candidate = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  candidate.splice(last_digit, 1);
  //print(candidate)
  box.digit = random(candidate);
  //console.log(`last digit ${last_digit} this one ${box.digit}`);
  last_digit = box.digit;

  box.draw = function() {
    fill(colors[this.digit]);
    rect(0, 0, box_width, box_width, 20);
    fill(255);
    rect(
      -box_width / 2 + box_width / 5,
      -box_width / 2 + box_width / 5,
      box_width / 10,
      box_width / 10,
      20
    );
    fill(80);
    textSize(box_width / 2);
    textFont(digit_font);
    textAlign(CENTER, CENTER);
    text(this.digit, 0, -box_width / 20);
  };
  if (this_user.game_level == 0 || game_pause) {
    box.velocity.y = 0;
    box.position.x = width / 2;
    box.position.y = height / 2;
  } else {
    box.velocity.y = box_speed;
  }
  asl_gesture.animation.stop();
  asl_gesture.animation.changeFrame(box.digit);

  box_speed += 0.05;

  boxes.add(box);

  boxes.creating = false;
  match = 0;
}

function collide(a, b) {
  a.velocity.y = 0;
  a.position.y = b.position.y - box_width;
  boxes.remove(a);
  dead_boxes.add(a);
  eval("this_user.number_of_fail_level_" + this_user.game_level + "++");
  this_user.need_help = 5;
  if (a.position.y < 50) {
    game_over = true;
  } else {
    //createBox();
  }
  //console.log("collide");
}

function pause() {
  game_pause = 1 - game_pause;
  if (this_user.game_level >= 1) {
    for (let i = 0; i < boxes.length; i++) {
      boxes[i].velocity.y = game_pause ? 0 : box_speed;
    }
  }
}

function draw() {
  writeDataEverySec();
  if (!game_start) return;
  background(255);

  textSize(16);
  text("Initial Speed:", 10, 27);
  text("World Width:", 10, 67);
  noStroke();
  fill(250);
  rect(world.left(), 0, world.width, windowHeight);

  if (boxes.length <= 0) createBox();

  if (keyWentDown(" ")) {
    pause();
  }

  if (!game_over && !game_pause) {
    // for safety reason, limit the number of dead_boxes to 10
    if (dead_boxes.length > 100) {
      let box = dead_boxes.get(0);
      box.remove();
    }

    if (gesture_digit == -1) {
      if (boxes.length > 0) {
        asl_gesture.animation.changeFrame(boxes[boxes.length - 1].digit);
      }
    } else {
      if (game_over) {
        asl_gesture.animation.changeFrame(gesture_digit);
      }
    }
    if (!game_over) {
      boxes.overlap(dead_boxes, collide);

      for (let i = 0; i < boxes.length; i++) {
        if (gesture_digit == boxes.get(i).digit) {
          match++;
          if (match >= match_max) {
            if (this_user.need_help > 0) this_user.need_help--;
            let box = boxes.get(i);
            box.velocity.x = random() < 0.5 ? 100 : -100;
            box.velocity.y = -50;
            boxes.remove(box);
            total_score++;
            if (this_user.game_level == 0) {
              this_user.number_of_success_level_0++;
              if (this_user.number_of_success_level_0 > 30)
                this_user.game_level++;
            } else if (this_user.game_level == 1) {
              this_user.number_of_success_level_1++;
              if (this_user.number_of_success_level_1 > 30)
                this_user.game_level++;
            } else if (this_user.game_level == 2) {
              this_user.number_of_success_level_2++;
            } else if (this_user.game_level == 3) {
              this_user.number_of_success_level_3++;
            }
          }
          //boxes.remove(box);
          //createBox();
        } else if (boxes.get(i).position.y >= windowHeight - box_width / 2) {
          boxes.get(i).position.y = windowHeight - box_width / 2;
          boxes.get(i).velocity.y = 0;
          let box = boxes.get(i);
          boxes.remove(box);
          dead_boxes.add(box);
          eval("this_user.number_of_fail_level_" + this_user.game_level + "++");
          this_user.need_help = 5;

          //createBox();
        }
      }
    }
  }
  draw_match_bar();
  draw_total_score();
  drawSprites();
  draw_virtual_hand();
  draw_asl();
  draw_statistics();

  if (game_over) {
    push();
    fill("rgba(31.4%,31.4%,31.4%,0.5)");
    rect(world.left(), 0, world.width, windowHeight);
    fill(255);
    strokeWeight(5);
    stroke(100);
    textFont(digit_font);
    textAlign(CENTER, CENTER);
    textSize(100);
    text("GAME OVER", windowWidth / 2, windowHeight / 2);
    pop();
  } else if (game_pause) {
    push();
    fill("rgba(31.4%,31.4%,31.4%,0.5)");
    rect(world.left(), 0, world.width, windowHeight);
    fill(255);
    strokeWeight(5);
    stroke(100);
    textFont(digit_font);
    textAlign(CENTER, CENTER);
    textSize(100);
    //text("PAUSE", windowWidth / 2, windowHeight / 2);
    pop();
  }
  draw_stage_0_animation();

  btn_restart.draw();
}

function draw_total_score() {
  push();
  translate(windowWidth, 0);
  textAlign(RIGHT, TOP);
  textSize(30);
  textFont(digit_font);
  fill(colors[0]);
  let t = "0000" + total_score;
  t.substr(t.length - 5);
  text(`SCORE: ${t} `, 0, 0);
  pop();
}
function draw_match_bar() {
  return;
  push();
  translate(
    my_gesture_monitor.position.x - 110,
    my_gesture_monitor.position.y + 50
  );
  noStroke();
  fill(240);
  rect(0, 0, 220, -150);
  fill(200, 255, 200);
  rect(0, 0, 220, map(match, 0, match_max, 0, -150));
  pop();
}

function draw_virtual_hand() {
  if (gesture_digit == -1) {
    if (!game_pause) pause();
    if (total_score > 0) {
      this_user.stage = 2;
    } else {
      this_user.stage = 0;
    }
    my_gesture.visible = false;
  } else {
    if (game_pause) pause();
    my_gesture.animation.stop();
    my_gesture.animation.changeFrame(gesture_digit);
    my_gesture.visible = true;
    let s = map(
      hands[0].fingers[1].bones[0].nextJoint[1] - 100,
      -100,
      500,
      1,
      0.2
    );
    if (s > 0.2 && s < 1) {
      // hand at certain range, then start play
      this_user.stage = 1;
    }
    my_gesture.scale = s;
  }
  //return;
  if (hands !== null) {
    //leapmotion is initialized.
    if (hands.length >= 1) {
      //there is/are hand(s) sensored.
      // draw any thing you want:
      push();
      let c = map(gesture_digit, 0, 9, 0, 255);
      noFill();
      stroke(c, 50, 0);
      strokeWeight(2);
      translate(windowWidth - 150, windowHeight - 100);
      for (let a = 0; a < 5; a++) {
        for (let b = 0; b < 4; b++) {
          let x = hand_data[0][a][b][0];
          let y = hand_data[1][a][b][0];
          ellipse(x * 50, -y * 50, 10);
        }
      }
      noFill();
      stroke(c, 50, 0);
      strokeWeight(2);
      for (let a = 0; a < 5; a++) {
        beginShape();
        for (let b = 0; b < 4; b++) {
          let x = hand_data[0][a][b][0];
          let y = hand_data[1][a][b][0];
          vertex(x * 50, -y * 50);
        }
        endShape();
      }
      pop();
    }
  }
}

function draw_stage_0_animation() {
  if (this_user.stage == 0 || this_user.stage == 2) {
    image(
      hand_guide,
      (width - hand_guide.width) / 2,
      (height - hand_guide.height) / 2
    );
  } else {
  }
}

function draw_asl() {
  if (
    (this_user.need_help > 0 || this_user.game_level <= 1) &&
    this_user.stage == 1
  ) {
    asl_gesture.visible = true;
  } else {
    asl_gesture.visible = false;
  }
}

function draw_statistics() {
  push();
  fill(100);
  txt =
    "Statistics> Current Stage: " +
    this_user.stage +
    "Time S0:" +
    this_user.time_in_stage_0 +
    "s, S1:" +
    this_user.time_in_stage_1 +
    "s, S2: " +
    this_user.time_in_stage_2 +
    "; Level: " +
    this_user.game_level +
    "; Need Help: " +
    this_user.need_help;
  text(txt, 10, height - 20);
  pop();
}
