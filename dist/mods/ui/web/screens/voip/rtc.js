var peerCons = [];
var peerIds = [];
var localStream = null;
var serverCon;
var peerConnectionConfig = {'iceServers': [{'url': 'stun:stun.services.mozilla.com'}, {'url': 'stun:stun.l.google.com:19302'}]};
var speaking = [];
var Microphone, EchoCancellation, AGC, NoiseSupress;

function OnMessage(msg)
{
	if(msg.data == "bad password")
	{
		console.log("bad password");
		return;
	}
	
	var data = JSON.parse(msg.data);
	
	if(data.broadcast)
	{
		console.log("broadcast from:" + data.uid);
		//use the uid sent with every message as a key lookup
		if(!peerCons[data.uid]) //They aren't here, lets create a new RTC connection and send them an offer
		{
			createPeer(data);
			
			//create an offer
			peerCons[data.uid].createOffer().then(function(description)
			{
				peerCons[data.uid].setLocalDescription(description).then(function()
				{
					console.log("sent offer to:" + data.uid);
					serverCon.send(JSON.stringify({
						'sdp': peerCons[data.uid].localDescription,
						'sendTo': data.uid
					}));
				});
			});
		}
	}
	else if(data.sendTo) //message direct to us
	{
		if(!peerCons[data.uid]) //we don't know them yet
		{
			createPeer(data);
		}
		
		if(data.sdp)
		{
			//whether we are getting an answer or offer, set remote peer description
			peerCons[data.uid].setRemoteDescription(new RTCSessionDescription(data.sdp)).then(function()
			{
				if(data.sdp.type == 'offer')
				{
					console.log('got an offer from: ' + data.uid);
					peerCons[data.uid].createAnswer().then(function(description)
					{
						peerCons[data.uid].setLocalDescription(description).then(function()
						{
							serverCon.send(JSON.stringify({
								'sdp': peerCons[data.uid].localDescription,
								'sendTo': data.uid
							}));
						});
					});
				}
			});
		}
		else if(data.ice)
		{
			console.log(data.ice);
			peerCons[data.uid].addIceCandidate(new RTCIceCandidate(data.ice));
		}
	}
	else if(data.leave) //leave has the uid of leaving peer
	{
		console.log("Asked to remove peer:" + data.leave);
		try{
			peerCons[data.leave].close();
		}
		catch(e){
			console.log(e);
		}
		removePeer(data.leave);
	}
}

function createPeer(data)
{
	peerCons[data.uid] = new RTCPeerConnection(peerConnectionConfig);
	peerCons[data.uid].addStream(localStream);
	peerCons[data.uid].onaddstream = remotestream;
	peerCons[data.uid].onicecandidate = sendicecandidate;
	peerCons[data.uid].oniceconnectionstatechange = icechange;
	peerCons[data.uid].connectedState = false;
	peerCons[data.uid].uid = data.uid;
	peerCons[data.uid].user = data.uid.split("|")[0];
	peerCons[data.uid].onclose = removePeer;
	peerCons[data.uid].speakingVolume = -Infinity;
	peerIds.push(data.uid);
}

function removePeer(uid)
{
	if(!uid)
		uid = this.uid; //if the close handler called us
	
	removeElement(document.getElementById(uid));
	
	var index = peerIds.indexOf(uid);
	peerIds.splice(index, 1);
	
	delete peerCons[uid];
	stopSpeak(uid.split("|")[0]);
	
	console.log("rtc peers listing");
	console.log(peerCons);
}

function removeElement(element) {
    element && element.parentNode && element.parentNode.removeChild(element);
}

function icechange()
{
	if(this.iceConnectionState == 'disconnected')
	{
		console.log("peer disconnected");
		removePeer(this.uid);
	}
}

function sendicecandidate(event)
{
	if(event.candidate != null)
	{
		console.log('ice from: ' + this.uid);
		serverCon.send(JSON.stringify({
			'ice': event.candidate,
			'sendTo': this.uid
		}));
	}
	else //spec: null candidate means end of candidates
	{
		if(this.connectedState == false){ //something went wrong
			//restart ice
			var uid = this.uid;
			this.createOffer().then(function(description)
			{
				peerCons[uid].setLocalDescription(description).then(function()
				{
					serverCon.send(JSON.stringify({
						'sdp': peerCons[uid].localDescription,
						'sendTo': uid
					}));
				});
			});
		}
	}
}

function remotestream(event)
{
	this.connectedState = true;
	console.log('got stream from: ' + this.uid);
	$("#remoteVideos").append("<video id=\"" + this.uid + "\" autoplay=\"true\"></video>");
	document.getElementById(this.uid).src = window.URL.createObjectURL(event.stream);
	this.speech = window.hark(event.stream, {"threshold":"-60"});
	var username = this.user;
	this.speech.on("speaking", function(){
		speak(username, this);
	});
	this.speech.on("stopped_speaking", function(){
		stopSpeak(username, this);
	});
	this.speech.on("volume_change", function(volume){
		var speaker = JSON.stringify({
			"user": username,
			"volume": this.speakingVolume,
			"isSpeaking": true
		});
		dew.show("scoreboard", speaker);
	});
}

function speak(user, hark)
{
	if($.inArray(user, speaking) == -1)	{
		speaking.push(user);
		$("<p id=\"" + user + "\">" + user + "</p>").hide().prependTo("#speaking").slideDown();
	}
}

function stopSpeak(user, hark)
{
	var index = $.inArray(user, speaking);
	if(index != -1)
		speaking.splice(index, 1);
	var speed = 500;
	$("#" + user).animate({ 
		width: "hide", 
		paddingLeft: "hide", 
		paddingRight: "hide", 
		marginLeft: "hide", 
		marginRight: "hide",
		direction: "left"
	}, speed, function(){
		$("#" + user).remove();
	});
}

function clearConnection()
{
	try{
		serverCon.close();
		serverCon = undefined;
	}
	catch(e){
		console.log(e);
	}
	try
	{
		peerIds.forEach(function(id){
			peerCons[id].close();
		});
		peerIds = [];
		peerCons = [];
	}
	catch(e){
		console.log(e);
	}
}

function startConnection(info)
{
	clearConnection();
	
	if(info.password == "") //not-connected
		return;
	
	dew.command("voip.microphoneid", {}).then(function(val){
		navigator.mediaDevices.enumerateDevices().then(function(dev){
			Microphone = val;
			console.log("Microphone: " + val);
			
			var constraints;
			if(Microphone == "" || Microphone == "default"){
				constraints = {
					video:false,
					audio:{
						echoCancellation: EchoCancellation,
						autoGainControl: AGC,
						noiseSuppression: NoiseSupress
				}};
			}
			else
			{
				var id;
				dev.forEach(function(d){
					if(d.deviceId == Microphone)
						id = d.deviceId;
				});
				console.log("used id: " + id);
				if(id == undefined){ //fallback to default
					constraints = {
						video:false,
						audio:{
							echoCancellation: EchoCancellation,
							autoGainControl: AGC,
							noiseSuppression: NoiseSupress
					}};
				}
				else{
					constraints = {
						video:false,
						audio:{
							deviceId: id,
							echoCancellation: EchoCancellation,
							autoGainControl: AGC,
							noiseSuppression: NoiseSupress
					}};
				}
			}
			
			navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
				localStream = stream;
				
				serverCon = new WebSocket("ws://" + info.server, "dew-voip");
				serverCon.onmessage = OnMessage;
				serverCon.onclose = function()
				{
					console.log("disconnected from signal server");
					clearConnection();
				}
				serverCon.onopen = function()
				{
					//must send the password before the server will accept anything from us
					serverCon.send(info.password);
					console.log("sent password");
					serverCon.send(JSON.stringify(
					{
						"broadcast": "garbage"
					}));
				}
				
				dew.command("voip.ptt_enabled", {}).then(function(ptt_enabled){
					if(ptt_enabled == 1){
						localStream.getAudioTracks()[0].enabled = false;
					}
					else{
						localStream.getAudioTracks()[0].enabled = true;
					}
				});
			});
		});
	});
}

function setVolume(uid, volume)
{
	document.getElementById(uid).volume = volume;
}

function retry()
{
	dew.command("server.websocketinfo").then(function(resp){
		var info = JSON.parse(resp);
		startConnection(info);
	});
}

function PTT(toggle)
{
	localStream.getAudioTracks()[0].enabled = toggle.talk;
}

function updateSettings(settings)
{
	if(settings.PTT_Enabled == 1){
		localStream.getAudioTracks()[0].enabled = false;
	}
	else{
		localStream.getAudioTracks()[0].enabled = true;
	}
	
	Microphone = settings.MicrophoneID;
	EchoCancellation = settings.EchoCancellation;
	AGC = settings.AGC;
	NoiseSupress = settings.NoiseSupress;
	
	if(settings.Enabled == 0)
	{
		clearConnection();
	}
	else
	{
		if(serverCon == undefined)
		{
			dew.command("server.websocketinfo", {}).then(function(resp){
				var info = JSON.parse(resp);
				startConnection(info);
			});
		}
	}
}

$(document).ready(function(){
	console.log("waiting for signal server");
	dew.on("signal-ready", function(info){
		console.log("signal ready");
		startConnection(info.data);
	});
	
	dew.on("voip-ptt", function(state){
		PTT(state.data);
	});
	
	dew.on("voip-settings", function(response){
		updateSettings(response.data);
	});
	
	dew.on("show", function(args){
		if(args.data.volume){
			setVolume(args.data.volume.uid, args.data.volume.vol);
		}
	});
	dew.command("voip.PTT_Enabled", {}).then(function(){}); //triggers update of settings
	dew.show();
	dew.getSessionInfo().then(function(info){
		console.log(info);
		if(info.established == true){
			retry();
		}
	});
});
