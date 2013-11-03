angular.module('Moonridge', []).factory('$MR', function $MR($rpc, storage, $q) {
    function Moonridge(backendUrl) {
        var self = this;
        $rpc.connect('http:'+ backendUrl);
        self.ready = $q.defer();
        $rpc.loadChannel('Moonridge').then(function (mrChnl) {
            mrChnl.getModels().then(self.ready.resolve);
        });
		this.getChannel = function (name) {
			return self.ready.then(function (obj) {

				$rpc.expose('MR-' + name, {
					pub: function (param) {
						return 'whatever you need from client returned ' + param;
					}
				}).then(
					function (channel) {
						console.log(" client channel ready");
					}
				);
			})
		};
        return this;
    };
    return Moonridge;
});