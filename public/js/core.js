//hands: leap motion object
var hands = null;
//hand_data: a list with shape  (3,5,4,2)
var hand_data = null;

Leap.loop(function (frame) {
    hands = frame.hands;
    if (hands !== null) { //leapmotion is initialized.
        if (hands.length >= 1) { //there is/are hand(s) sensored.
            let data_flatten;
            [hand_data, data_flatten] = classifier.get_data(hands[0]);
            classifier.predict(data_flatten);
        }
    }
});