import * as tf from '@tensorflow/tfjs';

let classifier = null;

export let init = async () => {
    console.log("loading model...");
    classifier = await tf.loadLayersModel('tensorflow_model/model.json');
    console.log("loaded.");
}
export let predict = async (hands) => {
    // console.log(hands);
    // input shape [1,5,4,2,3]
    var data = new Array(120);
    for (let a=0;a<5;a++) {
        for (let b=0;b<4;b++) {
            for (let c=0;c<3;c++) {
                data[a*24+b*6+0*3+c] = hands[0].fingers[a].bones[b].prevJoint[c];
                data[a*24+b*6+1*3+c] = hands[0].fingers[a].bones[b].nextJoint[c];
            }
        }
    }
    //console.log(data);
    let tensor_data = tf.tensor(data, [1,120])
    let tensor_prediction = await classifier.predict(tensor_data);
    let prediction = tensor_prediction.arraySync()[0];
    //console.log(prediction);
    let number = prediction.indexOf(Math.max(...prediction));
    console.log(number);

}