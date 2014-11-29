require('styles/moonridge-spinner.css!');
/**
 * @ngdoc directive
 * @name Moonridge.directive:mrController
 * @restrict AC
 *
 * @description
 * Will instantiate angular controller when Moonridge model resolves. This way it is possible to work with it instantly
 * without waiting on promises to resolve inside the controller itself.
 *
 */
angular.module('Moonridge').directive('mrController', function ($controller, $q, $MR) {
    var onError = function (err) {
        throw new Error("Cannot instantiate mr-controller - error: " + err);
    };
    return {
        scope: true,
        compile: function compile(tEl, tAttrs) {
            return {
                pre: function (scope, iElement, attr, controller) {
                    var ctrlName = attr.mrController;
                    var MRBackend;
                    if (attr.mrBackend) {
                        MRBackend = $MR.getBackend(attr.mrBackend);
                    } else {
                        MRBackend = $MR.getDefaultBackend();
                    }
                    var mrModels = attr.mrModels;

                    var instantiateAngularCtrl = function (models) {
                        scope.$on('$destroy', function() {
                            //TODO stop liveQueries
                        });
                        var localInj = {
                            $scope: scope
                        };
                        if (mrModels.indexOf(',') !== -1) {
                            angular.extend(localInj, models);
                        } else {
                            localInj[mrModels] = models;
                        }

                        localInj.moonridgeBackend = MRBackend;
                        var ctrl = $controller(ctrlName, localInj);
                        iElement.children().data('$ngControllerController', ctrl);
                    };

                    if (mrModels === undefined) {
                        throw new Error('No Moonridge models defined on element: ' + iElement);
                    } else {
                        if (mrModels.indexOf(',') !== -1) {
                            MRBackend.getModels(mrModels.split(',')).then(instantiateAngularCtrl, onError);
                        } else {
                            MRBackend.getModel(mrModels).then(instantiateAngularCtrl, onError);
                        }
                    }
                }
            };
        }
    }
})
/**
 * @ngdoc directive
 * @name Moonridge.directive:mrRepeat
 * @restrict A
 *
 * @description
 * syntactic sugar on top of ng-repeat directive. Will be replaced in linking phase by ng-repeat directive,
 * appends track by {model_name}._id if no track by expression is specified
 *
 */
    .directive('mrRepeat', function ($compile, mrSpinner) {
        var trackingProp = '_id'; //the same property that mongoose uses for identification of docs
        return {
            compile: function compile(tEl, tAttrs) {
                var content = tEl.html();
                tEl.html(mrSpinner);
                return function (scope, el, attr) {
                    var repeatExpr = attr.mrRepeat;
                    var filterExpr = '';
                    if (repeatExpr.indexOf('|') !== -1) {
                        filterExpr = ' |' + repeatExpr.split('|')[1];	//everything after |
                        repeatExpr = repeatExpr.split('|')[0].trim();
                    }
                    var modelName = repeatExpr.split(' in ')[0];
                    var varName = repeatExpr.split(' in ')[1];	//property on scope holding the query promise

                    var trackingExpr = '';
                    if (repeatExpr.indexOf('track by') === -1) {
                        trackingExpr = ' track by ' + modelName + '.' + trackingProp;
                    }

                    var LQ;
                    function onReady(resolveP) {
                        el.removeAttr('mr-repeat');
                        if (LQ) {
                            el.attr('ng-repeat', repeatExpr + '.docs' + filterExpr + trackingExpr);
                        } else {
                            el.attr('ng-repeat', repeatExpr  + filterExpr + trackingExpr);
                            scope[varName] = resolveP;   // overwriting the promise on scope with result of the query
                        }

                        el.html(content);
                        $compile(el)(scope);

                        if (LQ && !attr.noStopping) {
                            scope.$on('$destroy', function() {
                                LQ.stop();
//                                console.log("Query " + LQ._queryStringified + ' was stopped automatically.');
                            });

                        }
                    }

                    scope.$watch(varName, function (nV) {
                        if (nV) {
                            if (nV.promise) {	//when this is liveQuery
                                LQ = nV;
                                nV.promise.then(onReady);

                            } else if(nV.then) {	//when this is one time query
                                nV.then(onReady);
                            }
                        }
                    });

                }

            }
        }
    }).value('mrSpinner',
        '<div class="spinner">'+
        '<div class="rect1"></div>'+
        '<div class="rect2"></div>'+
        '<div class="rect3"></div>'+
        '<div class="rect4"></div>'+
        '<div class="rect5"></div>'+
        '</div>');