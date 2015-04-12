import {default as $MR} from 'moonridge-node';
var MRB;	//Moonridge backend

var dfd = new Promise(function (resolve){
	resolve({url: 'http://localhost:8080'});
});

MRB = $MR('local', dfd, true);  //true indicates, that this backend should be used by default
MRB.connectPromise.then(function(socket) {
	//you can hook up more events here
	socket.on('disconnect', function() {
		console.log("Ha disconnected!");
	});
});

export class MoonridgeAureliaShowcase {
	constructor(){
		//console.log("MR", MR);
		MRB.getModel('fighter').then(fighter => {
			this.liveQuery = fighter.liveQuery().sort('health').exec();
			this.liveQuery.on('any', function(params) {
				console.log("LQ", this);
				console.log("params", params);
			})
		});
	}
	get fighters(){
		try {
			return this.liveQuery.docs.map(JSON.stringify);
		}catch(e){}
	}
}