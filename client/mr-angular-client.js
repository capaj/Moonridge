angular.module('Moonridge', []).factory('$MR', function $MR($rpc, storage, $q) {
    function Moonridge(backendUrl) {
        var self = this;
        var models = {};
		$rpc.connect('http:'+ backendUrl);
        self.ready = $q.defer();
        $rpc.loadChannel('Moonridge').then(function (mrChnl) {
            mrChnl.getModels().then(self.ready.resolve);
        });
		this.getModel = function (name) {
			var model = {deferred: $q.defer()};
			models[name] = model
			self.ready.then(function (serverModels) {

				var promises = {
					client: $rpc.expose('MR-' + name, {
						pub: function (doc, eventName) {
							//TODO fire model event in the client
						}
					}),
					server: $rpc.loadChannel('MR-' + name)
				};


				$q.all(promises).then(function (chnlPair) {
					model.deferred.resolve(chnlPair.server);
				})
			});
			return model.deferred.promise;

		};
        return this;
    };
    return Moonridge;
});