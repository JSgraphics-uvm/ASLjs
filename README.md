# ASLjs

American Sign Language Recongition using Leap motion Javascript API

## Project Structure

`/public` the root of website

`/public/js` where the compiled js file goes

`/public/js/lib` packages like tensorflow, p5, leapmotion, numjs, etc.

`/public/js/sketch.js` main js for P5js

`/public/index.html` the entry point for browsers

`.gitignore` tell git to ignore certain files and folders

`Papers.md` the list of papers which related to the project

`README.md` this file

## How to set up your environment

* Clone the project from github

```dos
C:\...\code> git clone git@github.com:JSgraphics-uvm/ASLjs.git
```

* Start a webserver and Open a browser and view file `/public/index.html`. You can install a plug-in in VS code called `Live Server`, and open `/public/index.html` in VSCode and click `Go Live` on the bottom right.

* Finally, you can start to modify code in `/public/js/sketch.js`, and the browser will automatically refreshed, you can see your code is working.

## Why I need to start a local web server?

Can I just open the `.html` file? Unfortunately, no.

We need to use a model exported in Python to predict the gesture, so in order to read that file, we need a web server and `http` URL. For security reason, browsers don't allow Javascript access local files.
