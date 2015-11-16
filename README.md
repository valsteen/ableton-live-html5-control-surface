# ableton-live-html5-control-surface
Web-based control surface for Ableton Live

[<img src="http://i.imgur.com/4hoD6xQ.png" width="50%">](https://www.youtube.com/watch?v=EEs2_y4oM6c)

This is the first public release of this project, in a pre-alpha stage. This early version is mostly intended for developers curious about how it was done and willing to give feedback or collaborate. Deployment instructions will follow soon, and hopefully it will become a product usable for any ableton live user at some point, but there is still much work to be done.

- Project overview and followup: http://www.djcrontab.com/2015/09/building-html5-control-surface-for.html
- Check also the control surface script here: https://github.com/valsteen/ableton-live-webapi


# Setup

In its current state, setting up the application requires to be familiar with development tools and the command line.

I'm currently trying to isolate as much as I can so I can give accurate instructions on how to install it from scratch. If you're stuck somewhere, find instructions unclear, or even found a solution to a problem not mentioned here please help me complete this guide by opening a ticket or pinging me on twitter ( @\_v1nc3nt\_ ). And by all means don't hesitate to fork the project and send pull requests.

## Server

### Mac OS X
 * Install brew ( http://brew.sh/ ) then use it to install those dependencies with : ```brew install npm pkg-config coreutils python gulp```.
 * Next, checkout this project ( git clone https://github.com/valsteen/ableton-live-html5-control-surface ) anywhere.
 * Inside the checkout, install local dependencies with ```npm install```. Some other global dependencies are also necessary, run  ```npm install -g forever jspm```
 * npm installed the server dependencies. ```jspm``` now needs to download dependencies from github, but github limits anonymous downloads ; you need to register your user. Create a github account if you haven't one yet, then type ```jspm registry config github```. It will ask for your github username and a token you can generate here https://github.com/settings/tokens . Once it's done, type ```jspm install``` to fetch the frontend dependencies.
 * finally, start the development server with ```gulp watch &  forever -w --watchDirectory=node_app/ node_app/server.js &```. It should end up with:

```
[BS] Access URLs:
 -------------------------------------
       Local: http://localhost:9000
    External: http://192.168.1.19:9000
 -------------------------------------
          UI: http://localhost:3001
 UI External: http://192.168.1.19:3001
 -------------------------------------
 ```
 
 ( local address may indeed vary )

 Don't connect with your browser yet, other components are necessary
 
 Note: on my box it sometimes ends with:
 ```
 [01:13:38] Starting 'build'...
[01:13:38] Starting 'clean'...
```

In this case, run ```gulp watch &``` again. There is a bug somewhere which just cleans up the project and builds nothing.

### Windows
 As far as I know there is no package manager on windows, so a few dependencies will have to be downloaded and installed manually.
 
 * Make sure git is in the path, one way to do it to tell the installer to install the git command line and use it for running commands. http://git-scm.com
 * Visual Studio 2013 will be needed for node dependencies. You can download the express version at  https://www.microsoft.com/en-us/download/details.aspx?id=44914 . It's quite huge but [there is unfortunately no "light" alternative](http://stackoverflow.com/questions/22290501/can-i-download-the-visual-c-command-line-compiler-without-visual-studio)
 * Install nodejs https://nodejs.org/en/download/
 * Install python2.7 https://www.python.org/downloads/windows/ and make sure you check the option to add it to the path. Python is not needed for the script, it's used to build some dependencies of the node app.
 * It's not yet possible to programmatically create virtual midi ports on windows, so [loopmidi](http://www.tobias-erichsen.de/software/loopmidi.html) and some manual setup is necessary. Once installed create two midi devices, they must exactly be called "WebAPI in" and "WebAPI out" ( without the quotes ).
 
After this, some environment variables have been updated ( like the path of python ), easiest option is to just logout and login again, or reboot.

Now continue the installation using the git command line, so npm can find it.

The rest is about the same as on Mac OSX :

 * checkout this project ( git clone https://github.com/valsteen/ableton-live-html5-control-surface ) anywhere.
 * Inside the checkout, install local dependencies with ```npm install```. Some other global dependencies are also necessary, run  ```npm install -g forever jspm gulp```
 * npm installed the server dependencies. ```jspm``` now needs to download dependencies from github, but github limits anonymous downloads ; you need to register your user. Create a github account if you haven't one yet, then type ```jspm registry config github```. It will ask for your github username and a token you can generate here https://github.com/settings/tokens . Once it's done, type ```jspm install``` to fetch the frontend dependencies.
 * build the frontend with ```gulp build```
 * finally, start the development server with ```node node_app/server.js```.

The server will now be available at http://localhost:3000 ( replace localhost with your local IP to access from a mobile device ). Don't open the page yet, as the control surface script needs to be installed.

## Control surface script

checkout https://github.com/valsteen/ableton-live-webapi in ```/Applications/Ableton Live 9 Suite.app/Contents/App-Resources/MIDI Remote Scripts/``` ( Mac OSX ) or ```C:\ProgramData\Ableton\Live 9 Suite\Resources\MIDI Remote Scripts``` ( Windows ) and rename the directory WebAPI. 

After restarting Live, a WebAPI control surface should be available. Make sure the node server is started. Configure the WebAPI control surface to use the WebAPI midi device for in and out ( Mac OSX ) or "WebAPI in" and "WebAPI out" ( windows ). Activate "Track" for input and output.

Once the script is active a logfile name abletonwebapi.log should appear in your home directory.

## Web Client

You're almost ready to test the control surface. The app is configurable but there is one example matching a demo project: you can load in Ableton Live the included project which is found in ```demo1 Project.zip```. After the project is loaded in ableton you can finally open http://localhost:9000 ( chrome only ). It's just some silly drums with a bassline but it shows some possibilities.

Indeed to unleash all the potential of the touch interface you should open it with chrome on a tablet. I could only test it on android, I don't know if it'll work properly on iOS. Safari is not compatible but chrome on iOS might work, I cannot test for now.

You can check the source in ```src/demo.html``` and guess how parameters and widgets are interacting with Ableton Live. What exactly can be done will be documented soon.

## Wrapup

If you succeeded please ping me on twitter ( @\_v1nc3nt\_ ), I'd like to know if I didn't mess up too much. If you're stuck open a ticket or contact me on twitter. Don't hesitate, so I can update the install instructions if something is unclear or incorrect.
