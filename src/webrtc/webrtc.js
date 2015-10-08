/*

 this part was made possible thanks to this post http://blog.printf.net/articles/2014/07/01/serverless-webrtc-continued/
 most of it is just copy/paste

 */

import { RTCPeerConnection } from 'webrtc/adapter';

var cfg = {"iceServers": []},
    con = {'optional': [{'DtlsSrtpKeyAgreement': true}]};

var datachannel;

var listeners = [];

function handleOnconnection() {
    // TODO connection is done, maybe callback
}

function onsignalingstatechange(state) {
}

function oniceconnectionstatechange(state) {

}

function onicegatheringstatechange(state) {
}

var peerConnection = null,
    dataConnection = null;

var peerConnectionicedone = false;

function handleOfferFromPC1(offerDesc) {
    peerConnection.setRemoteDescription(offerDesc);
    peerConnection.createAnswer(function (answerDesc) {
        peerConnection.setLocalDescription(answerDesc);
    }, function () {
        console.warn("No create answer");
    });
}


function handleCandidateFromPC1(iceCandidate) {
    peerConnection.addIceCandidate(iceCandidate);
}


// get offer from the server, then the promise will give back the answer to send to the server
var getOfferCallback;
var disconnectedCallbacks = [];
export function onDisconnected(cb) {
    disconnectedCallbacks.push(cb);
}

var connectCallbacks = [];
export function onConnect(cb) {
    connectCallbacks.push(cb);
}
export function makeAnswer(offer) {
    // we may be overriding a previous request, make sure the previous one keeps quiet
    if (peerConnection) {
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onicecandidate = null;
        peerConnection.ondatachannel = null;
        peerConnection.onsignalingstatechange = null;

        if (peerConnection.signalingState !== 'closed') {
            peerConnection.close();
        }
    }
    if (datachannel) {
        datachannel.onclose = null;
        datachannel.onopen = null;
        datachannel.onmessage = null;
        if (datachannel.readyState !== 'closed') {
            datachannel.close();
        }
        datachannel = null;
    }
    peerConnection = new RTCPeerConnection(cfg, con);
    peerConnection.ondatachannel = function (e) {
        datachannel = e.channel || e; // Chrome sends event, FF sends raw channel
        datachannel.onclose = function () {
            for (let cb of disconnectedCallbacks) {
                cb();
            }
        };
        datachannel.onopen = function (e) {
            for (var cb of connectCallbacks) {
                cb();
            }
        };
        datachannel.onmessage = onmessage;
    }

    peerConnection.onicecandidate = function (e) {
        if (e.candidate === null) {
            var description = {
                type: peerConnection.localDescription.type,
                sdp: peerConnection.localDescription.sdp.split(/\n/).filter(function (l) {
                    return l.indexOf(" tcp ") == -1
                }).join("\n")
            };
            getOfferCallback(description);
        }
    };

    peerConnection.onconnection = handleOnconnection;
    peerConnection.onsignalingstatechange = onsignalingstatechange;
    peerConnection.oniceconnectionstatechange = function (e) {
        console.log(peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState == 'disconnected' || peerConnection.iceConnectionState == 'failed' || peerConnection.iceConnectionState == 'closed') {
            for (let cb of disconnectedCallbacks) {
                cb();
            }
        }
    };
    peerConnection.onicegatheringstatechange = onicegatheringstatechange;


    return new Promise(function (resolve) {
        getOfferCallback = resolve;
        var offerDesc = new RTCSessionDescription(offer);
        handleOfferFromPC1(offerDesc);
    });
}

export function subscribe(_listener) {
    listeners.push(_listener);
}

var messageQueue = [];
connectCallbacks.push(function () {
    for (let message of messageQueue) {
        send(message);
    }
    messageQueue = [];
});

function onmessage(event) {
    //console.info("received", event.data);
    try {
        var data = JSON.parse(event.data);
        for (var l of listeners) {
            l(data[0], data[1]);
        }
    } catch (ex) {
        console.error(ex);
    }
}

function send(message) {
    //console.info("sending", message);
    datachannel.send(message);
}

export function sendMessage(method, parameters) {
    try {
        if (method === "midi" && parameters.constructor === Array) {
            send(new Uint8Array(parameters));
        }
        else {
            send(JSON.stringify([method, parameters]));
        }
    } catch (e) {
        messageQueue.push(JSON.stringify([method, parameters]));
    }
}