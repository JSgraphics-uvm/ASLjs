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
from lib import standardization

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
            if (type(test_sets[int(fname[-3])])==int and t=="test") or (type(train_sets[int(fname[-3])])==int and t=="train"):
                print("reading "+fname, int(fname[-3]))
                with open(fname, "rb") as f:
                    if t=="test":
                        test_sets[int(fname[-3])] = pickle.load(f, encoding='latin1')
                    else:
                        train_sets[int(fname[-3])] = pickle.load(f, encoding='latin1')
    # Fastest way
    def ReshapeData( sets, digits ):
        size = sets[0].shape[3]
        X = [ np.moveaxis(single_set, 3, 0) for single_set in sets]
        X = np.concatenate(X).reshape(len(digits)*size,-1)
        Y = [ np.array([single_digit]*size) for single_digit in digits]
        Y = np.concatenate(Y).flatten()
        return X, Y

    for i, dataset in enumerate(train_sets):
        print("Standardizing ", i)
        train_sets[i] = standardization.do(train_sets[i])
        test_sets[i] = standardization.do(test_sets[i])

    trainX, trainY = ReshapeData( train_sets, range(10) )
    testX, testY = ReshapeData( test_sets, range(10) )
    [trainX, trainY] = combined_shuffle(trainX, trainY)
    print(trainX.shape)
    with open("dataset.p", "wb") as f:
        pickle.dump([trainX, trainY, testX, testY], f)

# if we want to do step 1, use these:
# read_from_original_pickle()
# exit()

# step 2 is read from `dataset.p` and train the model, and write to `tensorflow_model/`
with open("dataset.p", "rb") as f:
    [trainX, trainY, testX, testY] = pickle.load(f)

trainX = trainX.reshape(-1,120)
testX = testX.reshape(-1,120)

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
model.evaluate(testX, testY)

# write model for js
tfjs.converters.save_keras_model(model, './tensorflow_model')