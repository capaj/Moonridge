require('rpc/rpc-client-angular');
angular.module('Moonridge', ['RPC']).factory('$MR', require('./moonridge/Moonridge'));
require('./moonridge/extend/angular-extend');
require('./moonridge/moonridge-directives');
require('./moonridge/moonridge-query-dropdown');