import React from 'react';

var {Component} = React;

export default class Fighters extends Component {
	constructor(...props) {
		super(...props);
		this.state = {
			LQ : [
				{key: '1', title: 'Item 1', description: 'So cool', voteCount: 49},
				{key: '2', title: 'Item 2', description: 'Meh', voteCount: 11},
				{key: '3', title: 'Item 3', description: 'Great', voteCount: 30}
				]
		};
	}

	render() {
		var feedItems = this.state.LQ.map(function(item) {
			return <div>{item.description}</div>;
		});

		return (
			<ul className="list-group container">
				{feedItems}
			</ul>
		);
	}
}
