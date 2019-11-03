#
# This file is used to generate the tensorflow model for javascript.
# step 1. read `gesture_data/*.p`, and standardize them, write them as `dataset.p`
# step 2. read `dataset.p`, input them into tensorflow network, train the model, write them as `tensorflow_model/*`
# step 3. copy `tensorflow_model/*` to `/public/tensorflow_model/`, so js file can read it
#
#

# Since this project is in a subdirectory, cd into the directory first.
import os
abspath = os.path.abspath(__file__)
dname = os.path.dirname(abspath)
os.chdir(dname)

# dependent on these packages
import tensorflow as tf
import tensorflowjs as tfjs
import pickle
import glob
import numpy as np

# this is our self-made standardization tool. we need js to do the same thing, so we can process the standardized data.
from lib import standardization, show

# shuffle x-y pair helper
def combined_shuffle(x, y):
    c = list(zip(x,y))
    np.random.shuffle(c)
    x, y = zip(*c)
    return np.array(x), np.array(y)

# this is for step 1, read original data
def read_from_original_pickle():
    #Read in dataset for 0 1 2 3 4 5 6 7 8 9
    train_test = ['train', 'test']
    train_sets = [0] * 10
    test_sets = [0] * 10
    for t in train_test:
        fnames = glob.glob("gesture_data/*_%s*.p"%(t))
        for fname in fnames:
            #if (type(test_sets[int(fname[-3])])==int and t=="test") or (type(train_sets[int(fname[-3])])==int and t=="train"):
            print("reading "+fname, int(fname[-3]))
            with open(fname, "rb") as f:
                if t=="test":
                    test_sets[int(fname[-3])] = pickle.load(f, encoding='latin1')
                else:
                    if (type(train_sets[int(fname[-3])])==int):
                        train_sets[int(fname[-3])] = pickle.load(f, encoding='latin1')
                    else:
                        train_sets[int(fname[-3])] = np.concatenate([train_sets[int(fname[-3])],pickle.load(f, encoding='latin1')], axis=3)
    # Fastest way
    def ReshapeData( sets, digits ):
        print("ReshapeData:")
        # input shape (5,4,6,-1)
        # print(sets[0].shape)
        X = []
        Y = []
        for i, single_set in enumerate(sets):
            size = single_set.shape[3]
            print("size=",size)
            print("single set:")
            print(single_set.shape)
            single_X = single_set.reshape(5,4,2,3,-1)
            print(single_X.shape)
            single_X = np.moveaxis(single_X, 4, 0)
            print(single_X.shape)
            single_X = np.moveaxis(single_X, 4, 1)
            print(single_X.shape)
            X.append(single_X)
            Y.append(np.ones(size) * i)
        # output shape (-1,3,5,4,2), align with js
        # print(X[0].shape)
        X = np.concatenate(X)
        print(X.shape)
        X = X.reshape(-1,120)
        print(X.shape)
        Y = np.concatenate(Y).flatten()
        print("X,Y shape:", X.shape, Y.shape)
        return X, Y

    print("from gesture_data/*, the shape is", train_sets[0].shape) #(5, 4, 6, 1000)
    for i, dataset in enumerate(train_sets):
        print("Standardizing ", i)
        train_sets[i] = standardization.do(train_sets[i])
        test_sets[i] = standardization.do(test_sets[i])
    print("after standardization, the shape is", train_sets[0].shape) #(5, 4, 6, 1000)
    show.show_hand(train_sets[5][:,:,:,0], "hand_after_standardization.png")

    trainX, trainY = ReshapeData( train_sets, range(10) )
    testX, testY = ReshapeData( test_sets, range(10) )
    [trainX, trainY] = combined_shuffle(trainX, trainY)
    print(trainX.shape)
    with open("dataset.p", "wb") as f:
        pickle.dump([trainX, trainY, testX, testY], f)

# if we want to do step 1, use these:
read_from_original_pickle()
# exit()

# step 2 is read from `dataset.p` and train the model, and write to `tensorflow_model/`
with open("dataset.p", "rb") as f:
    [trainX, trainY, testX, testY] = pickle.load(f)

trainX = trainX.reshape(-1,120)
testX = testX.reshape(-1,120)
# print(trainX[0].reshape(5,4,6).shape)
# print("hand_%d.png"%trainY[0])

if False:
    # browser is a sample data from browser
    browser = np.array([
        -0.10460028052330017,
        -0.10460028052330017,
        -0.10460028052330017,
        -0.40633225440979004,
        -0.40633225440979004,
        -0.5269625782966614,
        -0.5269625782966614,
        -0.671675443649292,
        0,
        -1.7191222667634065e-8,
        -1.7191222667634065e-8,
        0.04651767387986183,
        0.04651767387986183,
        0.07453618198633194,
        0.07453618198633194,
        0.09535256773233414,
        0.16254772245883942,
        0.2918626368045807,
        0.2918626368045807,
        0.4694635570049286,
        0.4694635570049286,
        0.5725085735321045,
        0.5725085735321045,
        0.6395049691200256,
        0.32912853360176086,
        0.5706372261047363,
        0.5706372261047363,
        0.8499835133552551,
        0.8499835133552551,
        1.0195788145065308,
        1.0195788145065308,
        1.1318985223770142,
        0.49287742376327515,
        0.8176287412643433,
        0.8176287412643433,
        1.1650810241699219,
        1.1650810241699219,
        1.3509570360183716,
        1.3509570360183716,
        1.5100191831588745,
        -0.08416534215211868,
        -0.08416534215211868,
        -0.08416534215211868,
        0.4801338016986847,
        0.4801338016986847,
        0.9095110893249512,
        0.9095110893249512,
        1.1719187498092651,
        0,
        1,
        1,
        1.5815553665161133,
        1.5815553665161133,
        1.9088650941848755,
        1.9088650941848755,
        2.1397438049316406,
        0.008007127791643143,
        0.9474083185195923,
        0.9474083185195923,
        1.5778751373291016,
        1.5778751373291016,
        1.950133204460144,
        1.950133204460144,
        2.195666790008545,
        -0.0036653857678174973,
        0.8126002550125122,
        0.8126002550125122,
        1.3473145961761475,
        1.3473145961761475,
        1.677923560142517,
        1.677923560142517,
        1.9000684022903442,
        -0.04641595110297203,
        0.6696455478668213,
        0.6696455478668213,
        0.9888541102409363,
        0.9888541102409363,
        1.1669602394104004,
        1.1669602394104004,
        1.3245253562927246,
        0.2929008901119232,
        0.2929008901119232,
        0.2929008901119232,
        0.06729123741388321,
        0.06729123741388321,
        -0.05866972729563713,
        -0.05866972729563713,
        -0.16542333364486694,
        0,
        1.100459501301998e-9,
        1.100459501301998e-9,
        -0.025501606985926628,
        -0.025501606985926628,
        -0.020970705896615982,
        -0.020970705896615982,
        -0.006959550082683563,
        -0.03907644748687744,
        -0.05032692104578018,
        -0.05032692104578018,
        -0.06496140360832214,
        -0.06496140360832214,
        -0.05063226819038391,
        -0.05063226819038391,
        -0.028915919363498688,
        -0.03892800584435463,
        -0.057153861969709396,
        -0.057153861969709396,
        0.012662416324019432,
        0.012662416324019432,
        0.07363703846931458,
        0.07363703846931458,
        0.12394491583108902,
        0.05478515103459358,
        -1.0257485139053557e-10,
        -1.0257485139053557e-10,
        0.09154556691646576,
        0.09154556691646576,
        0.15793491899967194,
        0.15793491899967194,
        0.22696469724178314
        ])

    browser = browser.reshape(3,5,4,2)
    browser = np.moveaxis(browser,0,3)
    browser = browser.reshape(5,4,6)
    show.show_hand(browser, "hand_browser.png")

    tool = trainX[0]
    tool = tool.reshape(3,5,4,2)
    tool = np.moveaxis(tool,0,3)
    tool = tool.reshape(5,4,6)
    show.show_hand(tool, "hand_tool.png")

    exit()

# train
model = tf.keras.models.Sequential([
tf.keras.layers.InputLayer(input_shape=(120)),
tf.keras.layers.Dense(128, activation='relu'),
tf.keras.layers.Dropout(0.2),
tf.keras.layers.Dense(128, activation='relu'),
tf.keras.layers.Dropout(0.2),
tf.keras.layers.Dense(10, activation='softmax')
])

model.compile(optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy'])
model.fit(trainX, trainY, epochs=5)

# test: accuracy 97.61%, good enough.
# model.evaluate(testX, testY)

# write model for js
tfjs.converters.save_keras_model(model, './tensorflow_model')