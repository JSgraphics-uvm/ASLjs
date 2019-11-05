class DigitBox{
    constructor(){
        this.position = createVector(210,210);
        this.size = 40;
        this.margin = 100;
        this.digit = 0;
    }
    show(){
        push();
        translate(this.position.x, this.position.y);
        //draw box
        push();
        translate(-this.size/2, -this.size/2);
        fill(100);
        rect(0,0,this.size, this.size);
        pop();
        //draw digit
        textSize(this.size*0.8);
        textAlign(CENTER, CENTER);
        fill(200);
        text(this.digit, 0, 0);
        pop();
    }
    reset() {
        this.position = createVector(random(this.margin,windowWidth-this.margin), random(this.margin,windowHeight-this.margin));
        this.digit = int(random(9))
    }
}