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
    text(`${gesture_digit}`, 100,100);

    if (hands !== null) { //leapmotion is initialized.
        if (hands.length >= 1) { //there is/are hand(s) sensored.
            let [data, data_flatten] = classifier.get_data(hands[0]);
            //console.log(data_flatten);
            //data shape  (3,5,4,2)

            classifier.predict(data_flatten);

            // draw any thing you want:
            push();
            fill(100,0,0);
            translate(windowWidth/2,windowHeight/2);
            for (let a=0;a<5;a++) {
                for (let b=0;b<4;b++) {
                    let x = data[0][a][b][0];
                    let y = data[1][a][b][0];
                    ellipse(x*100, -y*100, 10);
                }
            }
            pop();
        }
    }
}
