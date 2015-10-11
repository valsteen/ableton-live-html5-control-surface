import 'bootstrap';
import 'bootstrap/css/bootstrap.css!';

import Midi from 'midi/midi';
import MidiState from 'midi/midi-state';
import live from 'live/index';

import { iomidi } from 'io';

window.live = live;
window.midi = Midi;
window.iomidi = iomidi;

export class App {
    constructor() {

        Midi.registerListener((midiMessage, name) => {
            var midiState = MidiState.fromMidiMessage(midiMessage.data);
            if (midiState) {
                midiState.lastModifier = "midi:" + midiMessage.target.name;
            }
            if (!Midi.isLocal) {
                iomidi.send({name: name, notes: Array.prototype.slice.call(midiMessage.data)});

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
