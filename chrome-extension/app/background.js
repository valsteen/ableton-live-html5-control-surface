(function () {
    var application = 'com.djcrontab.webrtcbridge';
    var port = null;

    port = chrome.runtime.connectNative(application);
    port.onMessage.addListener(process);

    function onDisconnect(e) {
        console.log('unexpected disconnect');
        port = chrome.runtime.connectNative(application);
        port.onMessage.addListener(process);
        port.onDisconnect.addListener(onDisconnect);
    }

    port.onDisconnect.addListener(onDisconnect);

    var RTCs = {};

    function process(data) {
        try {
            data = JSON.parse(data);
        } catch (e) {
            console.log(e.toString());
            return;
        }

        try {
            var client;

            if (data.method === "reset") {
                for (var clientId of Object.keys(RTCs)) {
                    RTCs[clientId].cancel();
                }
                RTCs = {};
                replyQueue = [];
            } else if (data.method === "offer") {
                client = RTC();
                RTCs[client.id] = client;

                client.onclose(function () {
                    delete RTCs[client.id];
                });

                client.makeOffer().then(function (offer) {
                    port.postMessage([null, 'offer', {'offer': offer, 'id': client.id}]);
                });
            } else if (data.method === "answer") {
                client = RTCs[data.parameters.id];
                client.getAnswer(data.parameters.answer);
            } else if (data.method === "cancel") {
                client = RTCs[data.parameters.id];
                if (client) {
                    client.cancel();
                }
                delete RTCs[data.parameters.id];
            } else if (data.method === "broadcast") {
                for (var key of Object.keys(RTCs)) {
                    RTCs[key].sendMessage(data.parameters.method, data.parameters.parameters);
                }
            } else if ("result" in data || "error" in data) {
                if (RTCs[data.clientId]) {
                    RTCs[data.clientId].sendMessage("reply", data);
                }
            } else if (!data.method) {
                for (var clientId of Object.keys(RTCs)) {
                    RTCs[clientId].sendMessage("update", data);
                }
            } else {
                console.log("invalid method", data);
            }
        } catch (e) {
            console.log(e);
        }
    }

    RTC.subscribe(function (clientId, method, parameters) {
        port.postMessage([clientId, method, parameters]);
    });
})
();