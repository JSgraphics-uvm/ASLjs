function preload() {
    classifier.init();
}
function setup() {
    createCanvas(windowWidth, windowHeight);
}

function draw() {
    background(0);
    fill(0, 102, 153);
    textSize(100);

    //the global variable `gesture_digit` will be set in `classifier.predict()` method 
    text(`${gesture_digit}`, 100,100);

    if (hands !== null) { //leapmotion is initialized.
        if (hands.length >= 1) { //there is/are hand(s) sensored.
            // draw any thing you want:
            push();
            fill(100,0,0);
            translate(windowWidth/2,windowHeight/2);
            for (let a=0;a<5;a++) {
                for (let b=0;b<4;b++) {
                    let x = hand_data[0][a][b][0];
                    let y = hand_data[1][a][b][0];
                    ellipse(x*100, -y*100, 10);
                }
            }
            pop();
        }
    }
}
