import { inject, useShadowDOM, DOMBoundary, customElement, bindable, useView } from 'aurelia-framework';
import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';
import { NOTES, MidiState } from 'midi/midi-state';
import findChord from 'midi/find-chord';
import getScales from 'midi/scale';

/*
 Major chords     =    0 3 7   ( I )    Cmin C#maj C#+ C#°
 Minor chords     =    0 4 7   ( i )
 Augmented chord  =    0 3 8   ( I+ )
 Dim chord        =    0 3 6   ( I° )
 sus2             =    0 2 6   ( Isus2 )
 sus4             =    0 4 6   ( Isus  )
 power chord      =    0 7 12  ( C5 )

 first inversion  =    2nd note inverted       C/G <- second is lowest note
 second inversion  =   3rd note inverted

 - show chord name
 - show chord name according to matching scales
 - capture notes, tell scale

*/

class BaseFinder {
    constructor(domBoundary) {
        this.domBoundary = domBoundary;
        this.activeNotes = {};
    }

    noteChanged(midiState) {
        if (midiState.active) {
            this.activeNotes[midiState.key] = midiState;
        } else {
            delete this.activeNotes[midiState.key];
        }
    }

    attached() {
        // TODO should be static initialization
        for (var i=0;i<128;++i) {
            var observe = () => {
                var midiState = MidiState({key: i, channel: this.channel});
                Object.observe(midiState, () => this.noteChanged(midiState));
            }
            observe();
        }
    }
}

@customElement('chord-finder')
@useShadowDOM()
@inject(DOMBoundary)
class ChordFinder extends BaseFinder {
    @bindable channel = 1;
    @bindable chordsetting;

    noteChanged(midiState) {
        super.noteChanged(midiState);

        this.chordsetting.value = findChord(Object.keys(this.activeNotes).map(x => parseInt(x)));
    }
}

@customElement('scale-finder')
@useShadowDOM()
@inject(DOMBoundary)
@useView("widgets/scale-finder.html")
class ScaleFinder extends BaseFinder {
    @bindable count = 1;
    @bindable channel = 1;

    noteChanged(midiState) {
        super.noteChanged(midiState);

        // throttle mecanism
        if (!this.throttle) {
            this.throttle = setTimeout(this.findScale.bind(this), 300);
        }
    }

    findScale() {
        delete this.throttle ;
        var scales = getScales(
            [for (key of Object.keys(this.activeNotes)) this.activeNotes[key]].map(x => x.note + x.sharp).join(""),
            ['Major', 'Minor']
        );
        this.scales = scales.splice(0, this.count);
    }
}

export  { ScaleFinder, ChordFinder } ;
