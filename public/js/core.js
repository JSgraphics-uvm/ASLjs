//hands: leap motion object
var hands = null;
//hand_data: a list with shape  (3,5,4,2)
var hand_data = null;
//hand_pointing: beside the gesture, we also interested in the position.
var hand_pointing = [0,0,0];

Leap.loop(function (frame) {
    hands = frame.hands;
    if (hands !== null) { //leapmotion is initialized.
        if (hands.length >= 1) { //there is/are hand(s) sensored.
            let data_flatten;
            hand_pointing = hands[0].fingers[1].bones[3].nextJoint;
            [hand_data, data_flatten] = classifier.get_data(hands[0]);
            classifier.predict(data_flatten);
        }
        if (hands.length == 0) {
            hands = null;
            hand_data = null;
            hand_pointing = [0,0,0];
            gesture_digit=-1;
        }
    }
});