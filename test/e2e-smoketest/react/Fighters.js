import React from 'react';

var {Component} = React;

import {default as $MR} from 'moonridge-client';

var MRB = $MR({url: 'http://localhost:8080'});  //true indicates, that this backend should be used by default
MRB.socket.on('disconnect', function() {
	console.log("Ha disconnected!");
});


export default class Fighters extends Component {
	constructor(...props) {
		super(...props);
		var fighter = MRB.model('fighter');
		this.state = {docs: []};
		var LQ = fighter.liveQuery().sort('health').exec();
		LQ.on('any', () => {
			this.setState({docs: LQ.docs});
		});
	}

	render() {
		var fighters = this.state.docs.map(function(item) {
			return <div key={item._id}>{item.name}</div>;
		});

		return (
			<ul className="list-group container">
				{fighters}
			</ul>
		);
	}
}
