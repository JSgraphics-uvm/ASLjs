import p5 from "p5";
import Leap from "leapjs";

export var hands = null;
export var P5 = null;
export let init = (callback) => {
    // init Leapmotion loop
    Leap.loop(function (frame) {
        hands = frame.hands;
    });

    // init p5js loop
    let sketch = (p_p5) => {
        p_p5.setup = () => {
            P5 = p_p5;
            p_p5.createCanvas(p_p5.windowWidth, p_p5.windowHeight);
        }
        p_p5.draw = () => {
            callback();
        }
    }
    let _ = new p5(sketch);
}

