# ableton-live-html5-control-surface
Web-based control surface for Ableton Live

[<img src="http://i.imgur.com/4hoD6xQ.png" width="50%">](https://www.youtube.com/watch?v=EEs2_y4oM6c)

This is the first public release of this project, in a pre-alpha stage. This early version is mostly intended for developers curious about how it was done and willing to give feedback or collaborate. Deployment instructions will follow soon, and hopefully it will become a product usable for any ableton live user at some point, but there is still much work to be done.

- Project overview and followup: http://www.djcrontab.com/2015/09/building-html5-control-surface-for.html
- Check also the control surface script here: https://github.com/valsteen/ableton-live-webapi


# Setup ( Mac OS X )

In its current state, setting up the application requires to be familiar with installing development tools on Mac OS X.

I'm currently trying to isolate as much as I can so I can give accurate instructions on how to install it from scratch. If you're stuck somewhere, find instructions unclear, or even found a solution to a problem not mentioned here please help me complete this guide by opening a ticket or pinging me on twitter ( @\_v1nc3nt\_ ). And by all means don't hesitate to fork the project and send pull requests.

## Server

* Install brew ( http://brew.sh/ ) then use it to install those dependencies with : ```brew install npm pkg-config zeromq coreutils```.
* Next, checkout this project ( git clone https://github.com/valsteen/ableton-live-webapi ) anywhere.
* Inside the checkout, install local dependencies with ```npm install```. Some other global dependencies are also necessary, run  ```npm install -g forever jspm```
* npm installed the server dependencies. Now, type ```jspm install``` to fetch the frontend dependencies.
* `gulp`, the build tool, is necessary at global level, install with npm install -g gulp
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

## WebRTC Bridge chrome extension

As explained [here](http://www.djcrontab.com/2015/09/building-html5-control-surface-part2.html) the chrome extension comes as a workaround because the webrtc bindings for node are not stable for the purpose.

* install the native part with ./chrome-extension/host/register.sh
* this will create that file ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.djcrontab.webrtcbridge.json * next, open chrome and go to ```chrome://extensions/```. Check the "developer mode" then "load unpacked extension". You need to choose the ```app``` directory found in ```chrome-extension/```
* Keep an eye on "background page". It may become "background page (inactive)" in which case it doesn't run, click on it if it's the case. Hopefully I'll fix that bug at some point.

## Control surface script

checkout https://github.com/valsteen/ableton-live-webapi in ```/Applications/Ableton Live 9 Suite.app/Contents/App-Resources/MIDI Remote Scripts/``` and rename the directory WebAPI. 

After restarting Live, a WebAPI control surface should be available, and since the server is running ( step 1 ), a WebAPI midi instrument should be available. Only "Track" on the input is necessary. Track can be set on the output as well. Once the script is active a logfile should appear at /tmp/abletonwebapi.log.

## Web Client

You're almost ready to test the control surface. The app is configurable but there is one example matching a demo project: you can load in Ableton Live the included project which is found in ```demo1 Project.zip```. After the project is loaded in ableton you can finally open http://localhost:9000 ( chrome only ). It's just some silly drums with a bassline but it shows some possibilities.

You can check the source in ```src/demo.html``` and guess how parameters and widgets are interacting with ableton. What exactly can be done will be documented soon.

## Wrapup

I just did those step on a fresh ```brew``` install, if you succeeded please ping me on twitter ( @\_v1nc3nt\_ ), I'd like to know if I didn't mess up too much. If you're stuck open a ticket or contact me on twitter. Don't hesitate, I didn't do this project just for myself.
