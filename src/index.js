import * as core from "./core";
import * as classifier from "./classifier";

let another_draw_function = () => {
    let p5 = core.P5;
    p5.ellipse(p5.mouseX, p5.mouseY,100);
}

let p5_draw = () => {
    if (core.hands !== null) { //leapmotion is initialized.
        if (core.hands.length >= 1) { //there is/are hand(s) sensored.
            classifier.predict(core.hands);
            // draw any thing you want:
            let p5 = core.P5;
            let p = core.hands[0].fingers[1].bones[3].nextJoint;
            p5.push();
            p5.fill(100,0,0);
            p5.translate(p5.windowWidth/2,p5.windowHeight/2);
            p5.ellipse(p[0], p[2], 100);
            p5.pop();

        }
    }

    // or call any function you want:
    another_draw_function();
}
classifier.init();
core.init(p5_draw);


