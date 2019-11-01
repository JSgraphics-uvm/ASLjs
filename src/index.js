import * as v from "@thi.ng/vectors";
import * as m from "./module";
import p5 from "p5";

let x = v.add([], [1,2,3], [2,3,4]);
console.log(x);

console.log("cool");

console.log(m.hello());

let sketch = (p5) => {
    p5.setup = () => {
        p5.createCanvas(p5.windowWidth, p5.windowHeight);
    }
    p5.draw = () => {
        p5.ellipse(p5.mouseX,p5.mouseY,100);
    }
}

new p5(sketch);