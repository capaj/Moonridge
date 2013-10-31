angular.module('Moonridge', []).factory('$MR', function $MR($rpc, storage, $q) {
    var ctor = function Moonridge(backendUrl) {
        var self = this;
        $rpc.connect('http:'+ backendUrl);
        self.ready = $q.defer();
        $rpc.loadChannel('Moonridge').then(function (mrChnl) {
            mrChnl.getModels().then(function (models) {
//                models.forEach
                self.ready.resolve({}); //TODO finish ctor
            })
        });
        return self.ready.promise;
    };
    return ctor;
});