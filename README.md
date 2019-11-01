# ASLjs

American Sign Language Recongition using Leap motion Javascript API

## Project Structure

Finally I set up the project environment. There are many files and folders in the project. In case I forget it, I shall write down the project structure.

`/public/` the root of website

`/public/js` where the compiled js file goes

`/public/index.html` the entry point for browsers

`/src/` the root of ES6 source file

`/src/index.js` the entry point for `watchify` the compiler

`/src/module.js` the demo of import self-made module in ES6

`.gitignore` tell git to ignore certain files and folders

`package-lock.json` npm auto-generated dependency tree

`package.json` npm auto-generated project meta information

`Papers.md` the list of papers which related to the project

`README.md` this file

## How to set up your environment

* Clone the project from github

```dos
C:\...\code> git clone git@github.com:JSgraphics-uvm/ASLjs.git
```

* Install nodejs from its [WEBSITE](https://nodejs.org/en/download/);

* In the project, install the dependencies and dev-dependencies

```dos
C:\...\code\ASLjs> npm install
```

* Run watchify to continously produce browser friendly code (use Ctrl+C if you want to stop watching.)

```dos
C:\...\code\ASLjs> npm start
```

* Open a browser and view file `/public/index.html`.

* Finally, you can start to modify code in `/src/`, and refresh the browser, you can see your code is working.

* The `module.js` can give you some feeling of writing your own module, so that we can keep index.js clean and tidy.

## How to use P5js in this project

* Using P5 code is a little different in this project. First we should construct a function called `sketch`, and pass that to the construction method of p5, and then, p5 will call this function, with the parameter of p5 itself.

* Notice, in P5js Editor, we use many "magical" function or variable, like `mouseX`. Here we cannot do this, we need to explicitly write `p5.mouseX` in the context. I don't know how to hijack the environment like p5.js did, but I think using `p5.mouseX` maybe a good habit to keep things explicit, especially for Javascript beginners. (I thought `map(value, l,u, new_l,new_u)` is a javascript function that day, it turns out to be a P5 function!)
