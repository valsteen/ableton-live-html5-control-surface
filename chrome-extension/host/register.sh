#!/bin/bash

HOST_DIR=`realpath $(dirname $0)`
cd $HOST_DIR

DESTINATION="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts/"

mkdir -p $DESTINATION
cat com.djcrontab.webrtcbridge.json | sed -e "s/HOST_DIR/${HOST_DIR//\//\\/}/g" > "${DESTINATION}/com.djcrontab.webrtcbridge.json"