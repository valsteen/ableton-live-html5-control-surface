function RTC() {
    var debugrtc = console.info.bind(console);
    //debugrtc = function(){};

    var pc = null;
    var answer = null;
    var onclose;

    var cfg = {"iceServers": []},
        con = {'optional': [{'DtlsSrtpKeyAgreement': true}]};

    function doHandleError(error) {
        debugrtc(error);
    }

    function onsignalingstatechange(state) {
        debugrtc('signaling state change:', arguments);
    }

    function oniceconnectionstatechange(state) {
        debugrtc('ice connection state change:', arguments);
    }

    function onicegatheringstatechange(state) {
        debugrtc('ice gathering state change:', arguments);
    }

    function doSetLocalDesc(desc) {
        answer = desc;
        pc.setLocalDescription(desc, undefined, doHandleError);
    }

    var datachannel;

    function makeDataChannel() {
        // If you don't make a datachannel *before* making your offer (such
        // that it's included in the offer), then when you try to make one
        // afterwards it just stays in "connecting" state forever.  This is
        // my least favorite thing about the datachannel API.
        datachannel = pc.createDataChannel('midi', {
            reliable: true
        });
        datachannel.onopen = function () {
            // connection is done. since it's one-way we don't care to feedback to server
            // console.log("\nConnected!");
        };
        datachannel.onclose = function () {
            if (onclose) {
                onclose();
            }
        };
        datachannel.onmessage = function (evt) {
            var method, data;
            if (evt.data.constructor === ArrayBuffer) {
                method = "midi";
                data = Array.prototype.slice.call(new Uint8Array(evt.data));
            } else {
                var message = JSON.parse(evt.data);
                method = message[0];
                data = message[1];
            }

            for (var i = 0; i < RTC.listeners.length; ++i) {
                RTC.listeners[i](client.id, method, data);
            }
        };
        datachannel.onerror = doHandleError;
    }

    var client = {
        // client sends back the answer, which must be passed to getAnswer
        getAnswer: function (pastedAnswer) {
            answer = new RTCSessionDescription(pastedAnswer);
            pc.setRemoteDescription(answer);
        },
        // makeOffer returns a promise, which call backs with an offer to pass to the client
        makeOffer: function () {
            return new Promise(function (resolve) {
                pc = new RTCPeerConnection(cfg, con);
                makeDataChannel();
                pc.onsignalingstatechange = onsignalingstatechange;
                pc.oniceconnectionstatechange = oniceconnectionstatechange;
                pc.onicegatheringstatechange = onicegatheringstatechange;
                pc.createOffer(function (desc) {
                    pc.setLocalDescription(desc, function () {
                    });
                    // We'll pick up the offer text once trickle ICE is complete,
                    // in onicecandidate.
                });
                pc.onicecandidate = function (candidate) {
                    // Firing this callback with a null candidate indicates that
                    // trickle ICE gathering has finished, and all the candidates
                    // are now present in pc.localDescription.  Waiting until now
                    // to create the answer saves us from having to send offer +
                    // answer + iceCandidates separately.
                    if (candidate.candidate == null) {
                        // keep only udp , expecting a speedup
                        var description = {
                            type: pc.localDescription.type,
                            sdp: pc.localDescription.sdp.split(/\n/).filter(function (l) {
                                return l.indexOf(" tcp ") == -1;
                            }).join("\n")
                        };

                        resolve(description);
                    }
                };
            });
        },
        sendMessage: function (method, parameters) {
            try {
                datachannel.send(JSON.stringify([method, parameters]));
            } catch (e) {
                if (datachannel.readyState !== "connecting" || (Date.now() - client.id) > 20000) {
                    onclose();
                }
            }
        },
        cancel: function () {
            try {
                pc.close();
            } catch (e) {
                console.error(e);
            }
        },
        onclose: function (cb) {
            onclose = cb;
        }
    };

    client.id = Date.now();
    return client;
}

RTC.listeners = [];
RTC.subscribe = function (cb) {
    RTC.listeners.push(cb);
};