// Copyright (C) 2007-2013, GoodData(R) Corporation. All rights reserved.
define(['./xhr'], function(xhr) {
    'use strict';

    /**
     * # JS SDK
     * Here is a set of functions that mostly are a thin wraper over the [GoodData API](https://developer.gooddata.com/api).
     * Before calling any of those functions, you need to authenticate with a valid GoodData
     * user credentials. After that, every subsequent call in the current session is authenticated.
     * You can find more about the GD authentication mechanism here.
     *
     * ## Conventions and Dependencies
     * * Depends on [jQuery JavaScript library](http://jquery.com/) javascript library
     * * Each SDK function returns [jQuery Deferred promise](http://api.jquery.com/deferred.promise/)
     *
     * ## GD Authentication Mechansim
     * In this JS SDK library we provide you with a simple `login(username, passwd)` function
     * that does the magic for you.
     * To fully understand the authentication mechansim, please read
     * [Authentication via API article](http://developer.gooddata.com/article/authentication-via-api)
     * on [GooData Developer Portal](http://developer.gooddata.com/)
     *
     * @module sdk
     * @class sdk
     */

    // `emptyReportDefinition` documents structure of payload our executor accepts
    // so for now, we have to mangle data into this form
    // This empty object serves as a template which is **cloned**
    // and filled with element data as needed
    var emptyReportDefinition = {
        "reportDefinition":{
            "content":{
                "filters":[],
                "format":"grid",
                "grid":{
                    "rows":[],
                    "columns":[],
                    "sort":{
                    "columns":[],
                    "rows":[]
                    },
                    "columnWidths":[],
                    "metrics":[]
                }
            },
            "meta":{
                "title":"Test",
                "summary":"",
                "tags":"",
                "deprecated":0,
                "category":"reportDefinition"
            }
        }
    };
    var DEFAULT_PALETTE = [
        {r:0x2b, g:0x6b, b:0xae},
        {r:0x69, g:0xaa, b:0x51},
        {r:0xee, g:0xb1, b:0x4c},
        {r:0xd5, g:0x3c, b:0x38},
        {r:0x89, g:0x4d, b:0x94},
        {r:0x73, g:0x73, b:0x73},
        {r:0x44, g:0xa9, b:0xbe},
        {r:0x96, g:0xbd, b:0x5f},
        {r:0xfd, g:0x93, b:0x69},
        {r:0xe1, g:0x5d, b:0x86},
        {r:0x7c, g:0x6f, b:0xad},
        {r:0xa5, g:0xa5, b:0xa5},
        {r:0x7a, g:0xa6, b:0xd5},
        {r:0x82, g:0xd0, b:0x8d},
        {r:0xff, g:0xd2, b:0x89},
        {r:0xf1, g:0x84, b:0x80},
        {r:0xbf, g:0x90, b:0xc6},
        {r:0xbf, g:0xbf, b:0xbf}
    ];

    /**
     *
     * Transforms array of elements (metrics and attributes)
     * into structure *executor* accepts

     * basically what we construct here is `reportDefinition` of
     * grid which has everything in columns

     * **BEWARE** - it will change
     * @method getReportDefinition
     * @param {Array} Array of elements
     * @return {Object} Report definition filled-in with supplied elements
     */
    var getReportDefinition = function(elements) {
        var currentMetrics = elements.filter(function(element) {
            return element.type === 'metric';
        });

        var currentAttributes = elements.filter(function(element) {
            return element.type === 'attribute';
        });

        // Deep clone `emptyReportDefinition` to fill with data
        var reportDef = $.extend(true, {}, emptyReportDefinition);

        var grid = reportDef.reportDefinition.content.grid;

        grid.metrics = currentMetrics.map(function(metric) {
            return {
                uri: metric.uri,
                alias: ''
            };
        });

        // everything is in columns
        grid.columns = currentAttributes.map(function(attribute) {
            return {
                attribute: {
                    alias: '',
                    totals:[[],[]],
                    uri: attribute.uri
                }
            };
        // if we have any metrics, we need to include `"metricGroup"` property
        }).concat(currentMetrics.length ? ["metricGroup"] : []);

        return reportDef;
    };

    /**
     * Simple get path helper method
     *
     * @private
     * @method getPath
     * @param {Object} obj object to start getting path from
     * @param {String} path path identifier
     * @return object at given path
     */
    var getPath = function(obj, path) {
        var paths = path.split('.'),
            found = obj,
            i;

        for (i = 0; i < paths.length; ++i) {
            if (found[paths[i]] === undefined) {
                return undefined;
            } else {
                found = found[paths[i]];
            }
        }
        return found;
    };

    /**
     * Create getter function for accessing nested objects
     *
     * @param {String} path Target path to nested object
     * @method getIn
     * @private
     */
    var getIn = function(path) {
        return function(object) {
            return getPath(object, path);
        };
    };

    /**
     * Find out whether a user is logged in
     *
     * Returns a promise which either:
     * **resolves** - which means user is logged in or
     * **rejects** - meaning is not logged in
     * @method isLoggedIn
     */
    var isLoggedIn = function() {
        return $.getJSON('/gdc/account/token');
    };


    /**
     * This function provides an authentication entry point to the GD API. It is needed to authenticate
     * by calling this function prior any other API calls. After providing valid credentials
     * every subsequent API call in a current session will be authenticated.
     *
     * @method login
     * @param {String} username
     * @param {String} password
     */
    var login = function(username, password) {
        var d = $.Deferred();

        // for local development, use login+password to staging
        xhr.post("/gdc/account/login", {
            data: JSON.stringify({
                postUserLogin: {
                    login: username,
                    password: password,
                    remember: 1,
                    captcha: "",
                    verifyCaptcha: ""
                }
            })
        }).then(d.resolve, d.reject);

        return d.promise();
    };

    /**
     * Logs out current user
     * @method logout
     */
    var logout = function() {
        var d = $.Deferred();

        isLoggedIn().then(function() {
            return xhr.get('/gdc/app/account/bootstrap').then(function(result) {
                var userUri = result.bootstrapResource.accountSetting.links.self;
                var userId = userUri.match(/([^\/]+)\/?$/)[1];

                return userId;
            }, d.reject);
        }, d.resolve).then(function(userId) {
            return xhr.ajax('/gdc/account/login/' + userId, {
                method: 'delete'
            });
        }).then(d.resolve, d.reject);

        return d.promise();
    };

    /**
     * Fetches projects available for the user represented by the given profileId
     *
     * @method getProjects
     * @param {String} profileId - User profile identifier
     * @return {Array} An Array of projects
     */
    var getProjects = function(profileId) {
        return xhr.get('/gdc/account/profile/' + profileId + '/projects').then(function(result) {
            return result.projects.map(function(p) { return p.project; });
        });
    };

    /**
     * Fetches all datasets for the given project
     *
     * @method getDatasets
     * @param {String} projectId - GD project identifier
     * @return {Array} An array of objects containing datasets metadata
     */
    var getDatasets = function(projectId) {
        return xhr.get('/gdc/md/' + projectId + '/query/datasets').then(getIn('query.entries'));
    };

    /**
     * Fetches a chart color palette for a project represented by the given
     * projectId parameter.
     *
     * @method getColorPalette
     * @param {String} projectId - A project identifier
     * @return {Array} An array of objects with r, g, b fields representing a project's
     * color palette
     */
    var getColorPalette = function(projectId) {
        var d = $.Deferred();

        xhr.get('/gdc/projects/'+ projectId +'/styleSettings').then(function(result) {
            d.resolve(result.styleSettings.chartPalette.map(function(c) {
                return {
                    r: c.fill.r,
                    g: c.fill.g,
                    b: c.fill.b
                };
            }));
        }, function(err) {
            if (err.status === 200) {
                d.resolve(DEFAULT_PALETTE);
            }
            d.reject(err);
        });

        return d.promise();
    };

    /**
     * Sets given colors as a color palette for a given project.
     *
     * @method setColorPalette
     * @param {String} projectId - GD project identifier
     * @param {Array} colors - An array of colors that we want to use within the project.
     * Each color should be an object with r, g, b fields.
     */
    var setColorPalette = function(projectId, colors) {
        var d = $.Deferred();

        xhr.put('/gdc/projects/'+ projectId +'/styleSettings', {
            data:  {
                styleSettings: {
                    chartPalette: colors.map(function(c, idx) {
                        return {
                            guid: 'guid'+idx,
                            fill: c
                        };
                    })
                }
            }
        }).then(d.resolve, d.reject);

        return d.promise();
    };

    /**
     * For the given projectId it returns table structure with the given
     * elements in column headers.
     *
     * @method getData
     * @param {String} projectId - GD project identifier
     * @param {Array} elements - An array of attribute or metric identifiers.
     * @return {Object} Structure with `headers` and `rawData` keys filled with values from execution.
     */
    var getData = function(projectId, elements) {
        // Create request and result structures
        var request = {
            execution: {
                columns: elements
            }
        };
        var executedReport = {
            isLoaded: false
        };
        // create empty promise-like Ember.Object
        var d = $.Deferred();

        // Execute request
        xhr.post('/gdc/internal/projects/'+projectId+'/experimental/executions', {
            data: JSON.stringify(request)
        }, d.reject).then(function(result) {
            // Populate result's header section
            executedReport.headers = result.executionResult.columns.map(function(col) {
                if (col.attributeDisplayForm) {
                    return {
                        type: 'attrLabel',
                        id: col.attributeDisplayForm.meta.identifier,
                        uri: col.attributeDisplayForm.meta.uri,
                        title: col.attributeDisplayForm.meta.title
                    };
                } else {
                    return {
                        type: 'metric',
                        id: col.metric.meta.identifier,
                        title: col.metric.meta.title,
                        format: col.metric.content.format
                    };
                }
            });
            // Start polling on url returned in the executionResult for tabularData
            return xhr.ajax(result.executionResult.tabularDataResult);
        }, d.reject).then(function(result) {
            // After the retrieving computed tabularData, resolve the promise
            executedReport.rawData = result.tabularDataResult.values;
            executedReport.isLoaded = true;
            d.resolve(executedReport);
        }, d.reject);

        return d.promise();
    };

    /**
     * Get additional information about elements specified by their uris
     * `elementUris` is the array of uris of elements to be look-up
     * Currently makes a request for each object, should be encapsulated
     * to one call
     *
     * @method getElementDetails
     * @param {Array} array of element uri strings
     */
    var getElementDetails = function(elementUris) {
        var d = $.Deferred();

        var fns = elementUris.map(function(uri) {
            return xhr.ajax(uri);
        });

        $.when.apply(this, fns).done(function() {
            // arguments is the array of resolved
            var args = Array.prototype.slice.call(arguments);

            var enriched = args.map(function(element) {
                var root = element[0];
                if (root.attributeDisplayForm) {
                    return {
                        type: 'attribute',
                        uri: root.attributeDisplayForm.meta.uri,
                        formOf: root.attributeDisplayForm.content.formOf,
                        name: root.attributeDisplayForm.meta.title
                    };
                } else if (root.metric) {
                    return {
                        type: 'metric',
                        uri: root.metric.meta.uri,
                        name: root.metric.meta.title
                    };
                }
            });

            // override titles with related attribute title
            var uri2fn = {};
            var ids = {};

            var indi = [], i = 0;

            var fns = [];

            enriched.forEach(function(el, idx) {
                if (el.formOf) {
                    fns.push(xhr.ajax(el.formOf));
                    ids[el.uri] = idx;
                    indi[i++] = idx;
                }
            });

            // all formOf are executed
            $.when.apply(this, fns).done(function() {
                var args = Array.prototype.slice.call(arguments);

                args.forEach(function(arg, idx) {
                    // get element to owerwrite
                    var which = indi[idx];
                    var update = enriched[which];

                    update.name = arg[0].attribute.meta.title;
                });

                d.resolve(enriched);
            });

        });
        return d.promise();
    };

    /**
     * Reutrns all attributes in a project specified by projectId param
     *
     * @method getAttributes
     * @param projectId Project identifier
     * @return {Array} An array of attribute objects
     */
    var getAttributes = function(projectId) {
        return xhr.get('/gdc/md/' + projectId + '/query/attributes').then(getIn('query.entries'));
    };

    /**
     * Returns all dimensions in a project specified by projectId param
     *
     * @method getDimensions
     * @param projectId Project identifier
     * @return {Array} An array of dimension objects
     * @see getFolders
     */
    var getDimensions = function(projectId) {
        return xhr.get('/gdc/md/' + projectId + '/query/dimensions').then(getIn('query.entries'));
    };

    /**
     * Returns project folders. Folders can be of specific types and you can specify
     * the type you need by passing and optional `type` parameter
     *
     * @method getFolders
     * @param {String} projectId - Project identifier
     * @param {String} type - Optional, possible values are `metric`, `fact`, `attribute`
     * @return {Array} An array of dimension objects
     */
    var getFolders = function(projectId, type) {
        var _getFolders = function(projectId, type) {
            var typeURL = type ? '?type='+type : '';

            return xhr.get('/gdc/md/' + projectId + '/query/folders' + typeURL).then(getIn('query.entries'));
        };

        switch (type) {
            case 'fact':
            case 'metric':
                return _getFolders(projectId, type);
            case 'attribute':
                return getDimensions(projectId);
            default:
                var d = $.Deferred();
                $.when(_getFolders(projectId, 'fact'),
                       _getFolders(projectId, 'metric'),
                       getDimensions(projectId)).done(function(facts, metrics, attributes) {
                    d.resolve({fact: facts, metric: metrics, attribute: attributes});
                });
                return d.promise();
        }
    };

    /**
     * Get folders with items.
     * Returns array of folders, each having a title and items property which is an array of
     * corresponding items. Each item is either a metric or attribute, keeping its original
     * verbose structure.
     *
     * @method getFoldersWithItems
     * @param {String} type type of folders to return
     * @return {Array} Array of folder object, each containing title and
     * corresponding items.
     */
    var getFoldersWithItems = function(projectId, type) {
        var result = $.Deferred();

        // fetch all folders of given type and process them
        getFolders(projectId, type).then(function(folders) {

            // Helper function to get details for each metric in the given
            // array of links to the metadata objects representing the metrics.
            // @return the array of promises
            var getMetricItemsDetails = function(array) {
                var d = $.Deferred();
                $.when.apply(this, array.map(getObjectDetails)).then(function() {
                    var metrics = Array.prototype.slice.call(arguments).map(function(item) {
                        return item.metric;
                    });
                    d.resolve(metrics);
                }, d.reject);
                return d.promise();
            };

            // helper mapBy function
            var mapBy = function(array, key) {
                return array.map(function(item) {
                    return item[key];
                });
            };

            // helper for sorting folder tree structure
            // sadly @returns void (sorting == mutating array in js)
            var sortFolderTree = function(structure) {
                structure.forEach(function(folder) {
                    folder.items.sort(function(a, b) {
                        if(a.meta.title < b.meta.title) {
                            return -1;
                        } else if(a.meta.title > b.meta.title) {
                            return 1;
                        }

                        return 0;
                    });
                });
                structure.sort(function(a, b) {
                    if(a.title < b.title) {
                        return -1;
                    } else if(a.title > b.title) {
                        return 1;
                    }

                    return 0;
                });
            };

            var foldersLinks = mapBy(folders, 'link');
            var foldersTitles = mapBy(folders, 'title');

            // fetch details for each folder
            $.when.apply(this, foldersLinks.map(getObjectDetails)).then(function() {
                var folderDetails = Array.prototype.slice.call(arguments);

                // if attribute, just parse everything from what we've received
                // and resolve. For metrics, lookup again each metric to get its
                // identifier. If passing unsupported type, reject immediately.
                if (type === 'attribute') {
                    // get all attributes, subtract what we have and add rest in unsorted folder
                    getAttributes(projectId).then(function(attributes) {
                        // get uris of attributes which are in some dimension folders
                        var attributesInFolders = [];
                        folderDetails.forEach(function(fd) {
                            fd.dimension.content.attributes.forEach(function(attr) {
                                attributesInFolders.push(attr.meta.uri);
                            });
                        });
                        // unsortedUris now contains uris of all attributes which aren't in a folder
                        var unsortedUris =
                            attributes
                                .filter(function(item) { return attributesInFolders.indexOf(item.link) === -1; })
                                .map(function(item) { return item.link; });
                        // now get details of attributes in no folders
                        $.when.apply(this, unsortedUris.map(getObjectDetails)).then(function() {
                            // get unsorted attribute objects
                            var unsortedAttributes = Array.prototype.slice.call(arguments).map(function(attr) { return attr.attribute; });
                            // create structure of folders with attributes
                            var structure = folderDetails.map(function(folderDetail) {
                                return {
                                    title: folderDetail.dimension.meta.title,
                                    items: folderDetail.dimension.content.attributes
                                };
                            });
                            // and append "Unsorted" folder with attributes to the structure
                            structure.push({
                                title: "Unsorted",
                                items: unsortedAttributes
                            });
                            sortFolderTree(structure);
                            result.resolve(structure);
                        });
                    });
                } else if (type === 'metric') {
                    var entriesLinks = folderDetails.map(function(entry) {
                        return mapBy(entry.folder.content.entries, 'link');
                    });
                    // get all metrics, subtract what we have and add rest in unsorted folder
                    getMetrics(projectId).then(function(metrics) {
                        // get uris of metrics which are in some dimension folders
                        var metricsInFolders = [];
                        folderDetails.forEach(function(fd) {
                            fd.folder.content.entries.forEach(function(metric) {
                                metricsInFolders.push(metric.link);
                            });
                        });
                        // unsortedUris now contains uris of all metrics which aren't in a folder
                        var unsortedUris =
                            metrics
                                .filter(function(item) { return metricsInFolders.indexOf(item.link) === -1; })
                                .map(function(item) { return item.link; });

                        // sadly order of parameters of concat matters! (we want unsorted last)
                        entriesLinks.push(unsortedUris);

                        // now get details of all metrics
                        $.when.apply(this, entriesLinks.map(function(linkArray, idx) {
                            return getMetricItemsDetails(linkArray);
                        })).then(function() {
                            // all promises resolved, i.e. details for each metric are available
                            var tree = Array.prototype.slice.call(arguments);
                            var structure = tree.map(function(treeItems, idx) {
                                // if idx is not in foldes list than metric is in "Unsorted" folder
                                return {
                                    title: (foldersTitles[idx] || "Unsorted"),
                                    items: treeItems
                                };
                            });
                            sortFolderTree(structure);
                            result.resolve(structure);
                        }, result.reject);
                    });
                } else {
                    result.reject();
                }
            });
        }, result.reject);

        return result.promise();
    };

    /**
     * Returns all metrics in a project specified by the given projectId
     *
     * @method getMetrics
     * @param projectId Project identifier
     * @return {Array} An array of metric objects
     */
    var getMetrics = function(projectId) {
        return xhr.get('/gdc/md/' + projectId + '/query/metrics').then(getIn('query.entries'));
    };

    /**
     * Returns all metrics that are reachable (with respect to ldm of the project
     * specified by the given projectId) for given attributes
     *
     * @method getAvailableMetrics
     * @param {String} projectId - Project identifier
     * @param {Array} attrs - An array of attribute uris for which we want to get
     * availabale metrics
     * @return {Array} An array of reachable metrics for the given attrs
     * @see getAvailableAttributes
     */
    var getAvailableMetrics = function(projectId, attrs) {
        var d = $.Deferred();

        xhr.post('/gdc/md/'+ projectId +'/availablemetrics', {
            data: JSON.stringify(attrs)
        }).then(function(result) {
            d.resolve(result.entries);
        }, d.reject);

        return d.promise();
    };

    /**
     * Returns all attributes that are reachable (with respect to ldm of the project
     * specified by the given projectId) for given metrics (also called as drillCrossPath)
     *
     * @method getAvailableAttributes
     * @param {String} projectId - Project identifier
     * @param {Array} metrics - An array of metric uris for which we want to get
     * availabale attributes
     * @return {Array} An array of reachable attributes for the given metrics
     * @see getAvailableMetrics
     */
    var getAvailableAttributes = function(projectId, metrics) {
        var d = $.Deferred();

        xhr.post('/gdc/md/'+ projectId +'/drillcrosspaths', {
            data: JSON.stringify(metrics)
        }).then(function(result) {
            d.resolve(result.drillcrosspath.links);
        }, d.reject);

        return d.promise();
    };

    /**
     * Get current project id
     *
     * @method getCurrentProjectId
     * @return {String} current project identifier
     */
    var getCurrentProjectId = function() {
        return xhr.get('/gdc/app/account/bootstrap').then(function(result) {
            return result.bootstrapResource.current.project.links.self.split('/').pop();
        });
    };

    /**
     * Get details of a metadata object specified by its uri
     *
     * @method getObjectDetails
     * @param uri uri of the metadata object for which details are to be retrieved
     * @return {Object} object details
     */
    var getObjectDetails = function(uri) {
        var d = $.Deferred();

        xhr.get(uri, {
            headers: { Accept: 'application/json' },
            dataType: 'json',
            contentType: 'application/json'
        }).then(function(res) {
            d.resolve(res);
        }, d.reject);

        return d.promise();
    };

    /**
     * Get identifier of a metadata object identified by its uri
     *
     * @method getObjectIdentifier
     * @param uri uri of the metadata object for which the identifier is to be retrieved
     * @return {String} object identifier
     */
    var getObjectIdentifier = function(uri) {
        var obj,
            d = $.Deferred(),
            idFinder = function(obj) {
                if (obj.attribute) {
                    return obj.attribute.content.displayForms[0].meta.identifier;
                } else if (obj.dimension) {
                    return obj.dimension.content.attributes.content.displayForms[0].meta.identifier;
                } else if (obj.metric) {
                    return obj.metric.meta.identifier;
                }

                throw "Unknown object!";
            };

        if (!$.isPlainObject(uri)) {
            getObjectDetails(uri).then(function(data) { d.resolve(idFinder(data)); }, d.reject);
        } else {
            d.resolve(idFinder(obj));
        }

        return d.promise();
    };

    /**
     * Get uri of an metadata object, specified by its identifier and project id it belongs to
     *
     * @method getObjectUri
     * @param projectId id of the project
     * @param identifier identifier of the metadata object
     * @return {String} uri of the metadata object
     */
    var getObjectUri = function(projectId, identifier) {
        var d = $.Deferred(),
            uriFinder = function(obj) {
                var data = (obj.attribute) ? obj.attribute : obj.metric;
                return data.meta.uri;
            };

        xhr.ajax('/gdc/md/'+projectId+'/identifiers', {
            type: 'POST',
            headers: { Accept: 'application/json' },
            data: {
                "identifierToUri": [identifier]
            }
        }).then(function(data) {
            var found = data.identifiers.filter(function(i) {
                return i.identifier === identifier;
            });

            if(found[0]) {
                return getObjectDetails(found[0].uri);
            }

            d.reject('identifier not found');
        }, d.reject).then(function(objData) {
            if (!objData.attributeDisplayForm) {
                return d.resolve(uriFinder(objData));
            } else {
                return getObjectDetails(objData.attributeDisplayForm.content.formOf).then(function(objData) {
                            d.resolve(uriFinder(objData));
                        }, d.reject);
            }
        }, d.reject);

        return d.promise();
    };

    return {
        DEFAULT_PALETTE: DEFAULT_PALETTE,
        isLoggedIn: isLoggedIn,
        login: login,
        logout: logout,
        getProjects: getProjects,
        getDatasets: getDatasets,
        getColorPalette: getColorPalette,
        setColorPalette: setColorPalette,
        getData: getData,
        getAttributes: getAttributes,
        getFolders: getFolders,
        getFoldersWithItems: getFoldersWithItems,
        getDimensions: getDimensions,
        getMetrics: getMetrics,
        getAvailableMetrics: getAvailableMetrics,
        getAvailableAttributes: getAvailableAttributes,
        getReportDefinition: getReportDefinition,
        getCurrentProjectId: getCurrentProjectId,
        getObjectDetails: getObjectDetails,
        getObjectIdentifier: getObjectIdentifier,
        getObjectUri: getObjectUri
    };
});