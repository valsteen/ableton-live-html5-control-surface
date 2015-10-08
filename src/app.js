import 'bootstrap';
import 'bootstrap/css/bootstrap.css!';
import Midi from 'midi/midi';
import MidiState from 'midi/midi-state';
import { makeAnswer, sendMessage, onDisconnected, onConnect } from 'webrtc/webrtc';
import live from 'live/index';
import Q from 'q';

window.sendMessage = sendMessage;
window.live = live;
window.midi = Midi;

export class App {
    constructor() {

        var rtcState = "disconnected";
        var rtcID;

        var connectRTC = () => {
            rtcState = "connecting";
            console.log("RTC connection attempt ...");
            setTimeout(() => {
                if (rtcState !== "connected") {
                    console.log("RTC connection still not there, retrying", rtcState);
                    $.ajax({
                        url: "/rtc/cancel",
                        type: 'POST',
                        data: JSON.stringify({id: rtcID}),
                        contentType: 'application/json; charset=utf-8',
                        dataType: 'json'
                    });
                    connectRTC();
                }
            }, 30000);
            $.get("/rtc/offer", (function (offer) {
                rtcID = offer.id;
                makeAnswer(offer.offer).then(function (answer) {
                    $.ajax({
                        url: "/rtc/answer",
                        type: 'POST',
                        data: JSON.stringify({id: rtcID, answer: answer}),
                        contentType: 'application/json; charset=utf-8',
                        dataType: 'json'
                    });
                });
            }));
        };

        onDisconnected(() => {
            console.log("RTC disconnected");
            rtcState = "disconnected";
            if (rtcState === "disconnected") {
                connectRTC();
            }
        });
        onConnect(() => {
            console.log("RTC connected");
            rtcState = "connected";
        });
        connectRTC();

        Midi.registerListener((midiMessage, name) => {
            var midiState = MidiState.fromMidiMessage(midiMessage.data);
            if (midiState) {
                midiState.lastModifier = "midi:" + midiMessage.target.name;
            }
            if (!Midi.isLocal) {
                sendMessage('midi', {name: name, notes: Array.prototype.slice.call(midiMessage.data)});
            }
        });

        live.subscribe('midi', function (data) {
            if (data.name) {
                Midi.send(data.notes, data.name);
            } else {
                var midiState = MidiState.fromMidiMessage(data);
                if (midiState) {
                    midiState.lastModifier = "live";
                }
            }
        });
    }

    configureRouter(config, router) {
        config.title = 'Ableton Live Controller';
        config.map([
                {
                    route: ['', 'demo'],
                    name: 'demo',
                    moduleId: 'demo',
                    title: 'demo'
                }]
        );

        this.router = router;
    }
}
