class Vehicle {
    constructor(){
        this.position = createVector(0,0);
        this.velocity = createVector(0,0);
        this.acceleration = createVector(0,0);
    }
    show() {
        image(img['vehicle'], this.position.x, this.position.y, 10, 15);
    }
    iterate(force, stepsize=1, damp=0.9) {
        //TODO damping
        debug(`X= ${int(this.position.x)}`);
        debug(`V= ${int(this.velocity.x)}`);
        debug(`A= ${int(this.acceleration.x)}`);
        this.position.add(this.velocity.mult(stepsize));
        this.velocity.add(this.acceleration.mult(stepsize));
        this.acceleration.add(force.mult(stepsize));
    }
}