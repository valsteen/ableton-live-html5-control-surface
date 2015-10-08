import { NOTES } from 'midi/midi-state';

/*
 TODO build sus and power chords as well
*/

var SCALES = [
    // {root: 'C#', mode: 'major'}
];

var CHORDS = {
    // 'C D#E': { name: 'C#min', inversions: [(CHORD ref) uninverted, 1st, 2nd], scales: [ { scale: SCALE, notation: 'VI°', number: 6 } ] }
};

var SCALENOTES = {
    'major': [0, 2, 4, 5, 7, 9, 11],
    'minor': [0, 2, 3, 5, 7, 8, 10]
};

var QUALITIES = {
    '0,4,7': '',
    '0,3,7': 'm',
    '0,4,8': '+',
    '0,3,6': '°',
    '0,2,7': 'sus2',
    '0,5,7': 'sus4',
    '0,7,12': 'power'
};

var ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
var noteToStr = i => NOTES[i%12].note + (NOTES[i%12].sharp ? "#" : "");
var normalize = n => n.length == 1 ? n + " " : n;

function getQuality(notes) {
    var cycle = n => n < 0 ? n + 12 : (n%12);
    return QUALITIES[0 + "," + cycle(notes[1] - notes[0]) + "," + cycle(notes[2] - notes[0])];
}

function getChordName(notes) {
    return noteToStr(notes[0]) + getQuality(notes);
}

function createChord(scale, notes, position) {
    var quality = getQuality(notes);
    var name = getChordName(notes);
    var chord = CHORDS[name];
    if (chord === undefined) {
        chord = {
            name: name,
            root: notes[0],
            notes: notes,
            scales: []
        };

        var firstInversionIndex = noteToStr(notes[0])+"/"+noteToStr(notes[1])+quality;
        var secondInversionIndex = noteToStr(notes[0])+"/"+noteToStr(notes[2])+quality;
        var firstInversion = {
            name: firstInversionIndex,
            root: notes[0],
            notes: [notes[0], notes[1]-12, notes[2]],
            scales: []
        };
        var secondInversion = {
            name: secondInversionIndex,
            root: notes[0],
            notes: [notes[0], notes[1], notes[2]-12],
            scales: []
        };
        var inversions = [chord, firstInversion, secondInversion];
        chord["inversions"] = firstInversion["inversions"] = secondInversion["inversions"] = inversions ;

        CHORDS[firstInversionIndex] = firstInversion;
        CHORDS[secondInversionIndex] = secondInversion;
        CHORDS[name] = chord;
    }

    chord['scales'].push({
        name: name,
        scale: scale,
        notation: (quality == '°' || quality == 'm') ? ROMANS[position].toLowerCase() + (quality == '°' ? quality : "") : ROMANS[position] + quality,
        number: position
    });

    return chord;
}

for (var i = 0; i < 12; ++i) {
    for (var mode in SCALENOTES) {
        var scale = {
            root: noteToStr(i),
            mode: mode,
            chords: []
        };
        SCALES.push(scale);
        var distances = SCALENOTES[mode];
        for (var distanceIndex = 0; distanceIndex < 7; ++distanceIndex) {
            var chord = createChord(
                scale, [
                    (i + distances[distanceIndex]),
                    (i + distances[(distanceIndex + 2) % 7] + 12 * Math.floor((distanceIndex + 2)/7)),
                    (i + distances[(distanceIndex + 4) % 7] + 12 * Math.floor((distanceIndex + 4)/7))
                ], distanceIndex);
            scale.chords.push(chord);
        }
    }
}

// TODO : power

function prettyPrint(obj, indent, depth) {
    if (depth === undefined) {
        depth = 0;
    }
    if (depth == 10) {
        return "...";
    }
    var result = "";
    if (indent == null) indent = "";

    for (var property in obj) {
        var value = obj[property];
        if (typeof value == 'string')
            value = "'" + value + "'";
        else if (typeof value == 'object') {
            if (value instanceof Array) {
                // Just let JS convert the Array to a string!
                var od = prettyPrint(value, indent + "  ", depth+1);
                value = "\n" + indent + "[\n" + od + "\n" + indent + "]";
            } else {
                // Recursive dump
                // (replace "  " by "\t" or something else if you prefer)
                var od = prettyPrint(value, indent + "  ", depth+1);
                // If you like { on the same line as the key
                //value = "{\n" + od + "\n" + indent + "}";
                // If you prefer { and } to be aligned
                value = "\n" + indent + "{\n" + od + "\n" + indent + "}";
            }
        }
        result += indent + "'" + property + "' : " + value + ",\n";
    }
    return result.replace(/,\n$/, "");
}

function findChord(notes) {
    var normalized = notes.sort((x,y) => x-y);
    var quality = getQuality(normalized);
    var name ;

    if (quality === undefined) {
        // try to insert first in second position, then third position
        quality = getQuality([normalized[1], normalized[0], normalized[2]]);

        if (quality === undefined) {
            quality = getQuality([normalized[1], normalized[2], normalized[0]]);
            if (quality === undefined) {
                return ;
            }
            name = noteToStr(normalized[1])+"/"+noteToStr(normalized[0])+quality;
        } else {
            name = noteToStr(normalized[1])+"/"+noteToStr(normalized[2])+quality;
        }
    } else {
        name = noteToStr(normalized[0]) + quality;
    }
    return CHORDS[name];
}

export function getChords(rootKey, mode) {
    if (rootKey < 12) {
        return ; // need to be at least at second octave to return inversions
    }
    // get chords for a given scale

    // Root key is the midi value
    // returns [[first chord, first chord second inversion, first chord third inversion  ], [ second chord ... ]]
    // each chord is itself {name: "Dm", notation: "iii", notes: [2,6,9]. Notes are midi values.

    var note = NOTES[rootKey%12].note + (NOTES[rootKey%12].sharp ? "#": "");
    var octaveRoot = Math.floor(rootKey/12)*12;
    var scale = SCALES.find(x => x.root==note && x.mode == mode);
    var chords = scale.chords;

    return chords.map(x=> {
        var transpose = (notes) => {
            notes = notes.map(x => x+octaveRoot);
            if (notes[0] < rootKey) {
                // workaround because we are matching chords between scales and at the same time giving relative position to root key
                notes = notes.map(x => x+12);
            }
            return notes;
        };

        var notation = x.scales.find(x=>x.scale===scale).notation;
        return [
            {name: x.name, notes: transpose(x.notes), notation: notation},
            {name: x.inversions[1].name, notes: transpose(x.inversions[1].notes), notation: notation},
            {name: x.inversions[2].name, notes: transpose(x.inversions[2].notes), notation: notation}
        ];
    });
}

export function test(require) {
    var corejs = require("core-js");
    var util = require("util");
    //var chords = MODES.find(x => x.root==67 && x.mode == 'major').chords;
    console.log(util.inspect(SCALES, {depth:6}));
    console.log(util.inspect(getChords(38, "minor"), {depth:5}));
}
export default findChord ;

// finding scales for a chord
// console.log(findChord([4,7,11]).scales.sort((x,y) => x-y).map(x => x.scale.root + x.scale.mode));

// find an inversion

// chord name and notation for C
// console.log(MODES.find(x => x.root == "C" && x.mode == "major").chords.map(x => [x.name, x.scales.find(x => x.scale.root == "C").notation]));
