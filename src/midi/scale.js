import { NOTES as MIDINOTES } from 'midi/midi-state';
import Promise from 'bluebird';

export var MODES = {
    'Chromatic': [1,1,1,1,1,1,1,1,1,1,1],
    'Major': [2, 2, 1, 2, 2, 2],
    'Minor': [2, 1, 2, 2, 1, 2],
    'Bhairav': [1, 3, 1, 2, 1, 3],
    'Minor Pentatonic': [3, 2, 2, 3],
    'Whole-half': [2, 1, 2, 1, 2, 1, 2],
    'Minor Gypsy': [1, 3, 1, 2, 1, 2],
    'Pelog': [1, 2, 1, 3, 1],
    'Mixolydian': [2, 2, 1, 2, 2, 1],
    'Harmonic Minor': [2, 1, 2, 2, 1, 3],
    'Minor Blues': [3, 2, 1, 1, 3],
    'Hirojoshi': [2, 1, 4, 1],
    'Whole Tone': [2, 2, 2, 2, 2],
    'Kumoi': [2, 1, 4, 2],
    'Iwato': [1, 4, 1, 4],
    'Super Locrian': [1, 2, 1, 2, 2, 2],
    'Phrygian': [1, 2, 2, 2, 1, 2],
    'Diminished': [1, 2, 1, 2, 1, 2, 1],
    'Locrian': [1, 2, 1, 3, 1, 2],
    'In-Sen': [1, 4, 2, 3],
    'Hungarian Minor': [2, 1, 3, 1, 1, 3],
    'Major Pentatonic': [2, 2, 3, 2],
    'Lydian': [2, 2, 2, 1, 2, 2],
    'Dorian': [2, 1, 2, 2, 2, 1],
    'Spanish': [1, 2, 1, 1, 1, 2, 2],
    'Melodic Minor': [2, 1, 2, 2, 2, 2]
};

export var NOTES = ['C ', 'C#', 'D ', 'D#', 'E ', 'F ', 'F#', 'G ', 'G#', 'A ', 'A#', 'B '];

export var ALL_SCALES = {};

function noteOrder(a, b) {
    return NOTES.indexOf(a.substring(0, 2)) - NOTES.indexOf(b.substring(0, 2));
}

// prefill ALL_SCALES such as ALL_SCALES["C Major"] = "C D E F G A B";
for (var name of Object.keys(MODES)) {
    var distances = MODES[name];
    for (var note_idx = 0; note_idx < NOTES.length; ++note_idx) {
        var note = NOTES[note_idx];
        let scale = note;

        var current_distance = 0;

        for (var distance of distances) {
            current_distance += distance;
            scale += " " + NOTES[(note_idx + current_distance) % 12];
        }

        ALL_SCALES[note + " " + name] = {
            notes: scale,
            mode: name,
            name: note + " " + name,
            root: note
        };
    }
}

var ALL_SCALES_NAMES = Object.keys(ALL_SCALES).sort(noteOrder);


function pad(s) {
    if (s.length == 1) return s + " ";
    return s;
}

var modesCache = {};

export default function getScales(notes, modes) { // just like "ABCDE"
    var result = [];
    var selectedNotes = [...new Set(((notes||"").match(/[A-G]#?/g) || []).map(pad))].sort(noteOrder);
    var scales = ALL_SCALES_NAMES;

    if (modes) {
        var modeKey = modes.join(",");
        if (modesCache[modeKey]) {
            scales = modesCache[modeKey]; // it's a few ms, but in this case it matters
        } else {
            scales = [];
            for (let scaleName of ALL_SCALES_NAMES) {
                let scale = ALL_SCALES[scaleName];
                if (modes.indexOf(scale.mode) > -1) {
                    scales.push(scale.name);
                }
            }
            modesCache[modeKey] = scales;
        }
    }

    if (selectedNotes.length) {
        var search = new RegExp(selectedNotes.join(".*"));
        for (let scaleName of scales) {
            let scale = ALL_SCALES[scaleName];
            if ((scale.notes + " " + scale.notes).match(search)) {
                result.push(scale);
            }
        }
    }

    // sort given the mode order given by the user
    if (modes !== undefined) {
        result = result.sort((x,y) => modes.indexOf(x.mode) - modes.indexOf(y.mode));
    }
    return result;
}

export function getScale(scaleName) {
    var scaleParts = scaleName.match(/^(\S+) +(.+)$/);
    var scale = {};
    scale.name = scaleName;
    scale.rootNote = MIDINOTES.findIndex(x => x.note == scaleParts[1][0] && x.sharp == (scaleParts[1][1] == "#"));
    scale.mode = scaleParts[2];
    scale.ready = Promise.cast();
    scale.intervals = MODES[scale.mode].reduce((result, cur) => {
        result.push((result[result.length - 1] || 0) + cur);
        return result;
    }, [0]);

    let keys = Array.apply(null, {length:128}).map((_,i) => i).filter((x) => scale.intervals.indexOf((x + 12 - scale.rootNote) % 12) !== -1);
    scale.indexForKey = new Map(keys.map((x,i) => [x,i]));
    scale.keyForIndex = new Map(keys.map((x,i) => [i,x]));
    return scale;
}