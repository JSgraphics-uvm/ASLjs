// require numjs.js
var gesture_digit = -1;
var classifier = {

    init: function () {
        console.log("loading model...");
        (async () => {
            this.classifier = await tf.loadLayersModel('./tensorflow_model/model.json');
            console.log("loaded.");
        })();
    },
    predict: function (data) {
        // console.log(hands);
        // input shape [1,5,4,2,3]
        let tensor_data = tf.tensor(data, [1, 120]);
        (async () => {
            let tensor_prediction = await this.classifier.predict(tensor_data);
            let prediction = tensor_prediction.arraySync()[0];
            // console.log(prediction);
            let number = prediction.indexOf(Math.max(...prediction));
            gesture_digit = number;
        })();
    },
    get_data: function (raw_hand) {
        // default shape is (3,5,4,2)
        let hand = nj.zeros([3, 5, 4, 2], 'float32');
        for (let a = 0; a < 5; a++) {
            for (let b = 0; b < 4; b++) {
                for (let c = 0; c < 3; c++) {
                    hand.set(c, a, b, 0, raw_hand.fingers[a].bones[b].prevJoint[c]);
                    hand.set(c, a, b, 1, raw_hand.fingers[a].bones[b].nextJoint[c]);
                }
            }
        }
        {
            //Step 1. Move index finger metacarpal(palm) bone base to origin
            let points = this.get_key_points(hand);
            for (let i = 0; i < 3; i++) {
                let c = points[0].get(i);
                //select a range from data
                let hand_c = hand.hi(i + 1, -1, -1, -1).lo(i, 0, 0, 0);
                //calculate new value
                let dif = hand_c.subtract(c);
                //set new value back to data
                for (let a = 0; a < 5; a++) {
                    for (let b = 0; b < 5; b++) {
                        for (let c = 0; c < 2; c++) {
                            hand_c.set(0, a, b, c, dif.get(0, a, b, c));
                        }
                    }
                }
            }
        }
        {
            //Step 2. None.
        }
        {
            //Step 3. Rotate index finger metacarpal(palm) bone to +x-y plane
            let points = this.get_key_points(hand);
            let y = points[1].get(1);
            let z = points[1].get(2);
            let n = Math.sqrt( y*y + z*z );
            y = y/n;
            z = z/n;
            T_rotate = nj.array([
                [ 1, 0, 0],
                [ 0, y, z],
                [ 0,-z, y]
                ], 'float32');
            hand = nj.dot(T_rotate, hand.reshape(3,-1)).reshape(3,5,4,2);
        }
        {
            //Step 4. Rotate index finger metacarpal(palm) bone to +y axis
            let points = this.get_key_points(hand);
            let x = points[1].get(0);
            let y = points[1].get(1);
            let n = Math.sqrt( y*y + x*x );
            x = x/n;
            y = y/n;
            T_rotate = nj.array([
                [y, -x, 0],
                [x, y, 0],
                [0, 0, 1]
                ], 'float32');
            hand = nj.dot(T_rotate, hand.reshape(3,-1)).reshape(3,5,4,2);

        }
        {
            //Step 5. Keep index finger on +y axis, Rotate another bone (baby finger, metacarpal(palm), tip) to +x-y plane
            let points = this.get_key_points(hand);
            let x = points[2].get(0);
            let z = points[2].get(2);
            let n = Math.sqrt( z*z + x*x );
            x = x/n;
            z = z/n;
            T_rotate = nj.array([
                [x,  0, z],
                [0,  1, 0],
                [-z, 0, x]
                ], 'float32');
            hand = nj.dot(T_rotate, hand.reshape(3,-1)).reshape(3,5,4,2);

        }
        {
            //Step 6. Mirror Adjust Left-Right hand, depending on the z value of 4-th point thumb, metacarpal, tip
            let points = this.get_key_points(hand);
            if (points[3].get(2)<0){
                for (let a = 0; a < 5; a++) {
                    for (let b = 0; b < 5; b++) {
                        for (let c = 0; c < 2; c++) {
                            hand.set(2, a, b, c, -hand.get(2, a, b, c));
                        }
                    }
                }
            }

            //Step 7. Normalize scale set index finger metacarpal(palm) bone = 1
            let x = points[1].get(0) - points[0].get(0);
            let y = points[1].get(1) - points[0].get(1);
            let z = points[1].get(2) - points[0].get(2);
            let s = 1. / Math.sqrt(x*x + y*y + z*z);
            T_scale = nj.array([
                [s, 0, 0],
                [0, s, 0],
                [0, 0, s]
            ], 'float32');
            hand = nj.dot(T_scale, hand.reshape(3,-1)).reshape(3,5,4,2);
        }



        //console.log(std_hand.tolist());
        return [hand.tolist(), hand.selection.data];
    },
    get_key_points: function (hand) {
        let point1, point2, point3, point4;
        let finger, bone, is_tip;
        finger = 1; bone = 0; is_tip = 0;
        point1 = hand.slice(null, [finger, finger + 1], [bone, bone + 1], [is_tip, is_tip + 1]).reshape(3);
        finger = 1; bone = 0; is_tip = 1;
        point2 = hand.slice(null, [finger, finger + 1], [bone, bone + 1], [is_tip, is_tip + 1]).reshape(3);
        finger = 4; bone = 0; is_tip = 1;
        point3 = hand.slice(null, [finger, finger + 1], [bone, bone + 1], [is_tip, is_tip + 1]).reshape(3);
        finger = 0; bone = 0; is_tip = 1;
        point4 = hand.slice(null, [finger, finger + 1], [bone, bone + 1], [is_tip, is_tip + 1]).reshape(3);

        return [point1, point2, point3, point4]
    },
    standardization: function () {
        return;
    }
}