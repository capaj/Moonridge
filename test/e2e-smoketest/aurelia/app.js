import {default as $MR} from 'moonridge-client';

var MRB = $MR({url: 'http://localhost:8080'});  //true indicates, that this backend should be used by default
MRB.socket.on('disconnect', function() {
	console.log("Ha disconnected!");
});

export class MoonridgeAureliaShowcase {
	constructor(){
		//console.log("MR", MR);
		var fighter = MRB.model('fighter');
		this.liveQuery = fighter.liveQuery().sort('health').exec();
		this.liveQuery.on('any', function(params) {
			console.log("LQ", this);
			console.log("params", params);
		});

	}
	get fighters(){
		try {
			return this.liveQuery.docs.map(JSON.stringify);
		}catch(e){}
	}
}