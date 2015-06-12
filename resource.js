var reqwest = require('reqwest');
var extend = require('extendify')();
var querystring = require('querystring');
var EventRegistry = require('./event-registry.js');
var Serializer = require('./serializer.js');
var SnapshotPlugin = require('./plugins/snapshot.js');

var req = function (method, url, data) {

    // Construct query string from data if it's a GET request
    if (method.toLowerCase() === 'get') {
        var query = querystring.stringify(data);
        if (query !== '') {
            url += '?' + query;
        }
        data = null;
    }

    // Initiate request and return a promise
    return reqwest({
        url: url,
        method: method,
        data: data ? JSON.stringify(data) : null,
        type: 'json',
        contentType: 'application/json'
    });

};

var deserializePromise = function (serializer, promise) {

    return promise.then(function (response) {
        return serializer.deserialize(response);
    });

};

var createResourcePrototype = function () {
    var ResourceInstance = {};

    ResourceInstance.$get = function () {
        return deserializePromise(req('get', this.$url())).then(function (refreshed) {
            this.$attrs(refreshed.attrs());
            this.$eventRegistry.trigger('get', this);
            return this;
        }.bind(this));
    };

    ResourceInstance.$delete =
    ResourceInstance.$remove =
    ResourceInstance.$destroy = function () {
        return req('delete', this.$url()).then(function () {
            this.$eventRegistry.trigger('delete', this);
            return this;
        }.bind(this));
    };

    ResourceInstance.$save = function () {
        var method = this.$id() ? this.$config.updateMethod.toLowerCase() : 'post';
        return deserializePromise(req(method, this.$url(), this.$attrs())).then(function (saved) {
            this.$attrs(saved.$attrs());
            this.$eventRegistry.trigger('save', this);
            this.$snapshots.length = 0;
            return this;
        }.bind(this));
    };

    ResourceInstance.$attrs = function (attrs) {
        if (attrs) {
            // Setter
            for (var prop in attrs) {
                if (attrs.hasOwnProperty(prop)) {
                    this[prop] = attrs[prop];
                }
            }
        } else {
            // Getter
            attrs = {};
            for (var prop in this) {
                if (this.hasOwnProperty(prop) && 0 !== prop.indexOf('$')) {
                    attrs[prop] = this[prop];
                }
            }
            return JSON.parse(JSON.stringify(attrs));
        }
    };

    ResourceInstance.$url = function () {
        var url = this.$config.url;
        if (this.$id()) {
            url += '/' + this.$id();
        }
        return url;
    };

    ResourceInstance.$id = function () {
        return this[this.$config.idAttribute] || null;
    };

    return ResourceInstance;
};


var createResource = function (config) {
    var resource = function (attrs) {
        this.$config = config;
        this.$eventRegistry = resource.eventRegistry;
        for (var prop in attrs) {
            if (attrs.hasOwnProperty(prop)) {
                this[prop] = attrs[prop];
            }
        }
    };

    resource.config = config;
    resource.eventRegistry = new EventRegistry(['save', 'query', 'delete', 'get']);
    resource.eventRegistry.import(config.on);

    resource.query = function (query) {
        return deserializePromise(config.serializer, req('get', config.url, query)).then(function (instances) {
            resource.eventRegistry.trigger('query', instances);
            return instances;
        });
    };

    resource.get = function (id) {
        return deserializePromise(config.serializer, req('get', config.url + '/' + id, null)).then(function (instance) {
            resource.eventRegistry.trigger('get', instance);
            return instance;
        });
    };

    return resource;
};

var defaultConfig = {

    url: null,

    prefix: '',

    suffix: '',

    idAttribute: 'id',

    updateMethod: 'PATCH',

    on: {},

    plugins: [SnapshotPlugin]

};

var resourceFactory = function (config) {
    config = extend(defaultConfig, resourceFactory._config, config);
    if (!config.url) {
        throw 'url option must be defined';
    }
    if (config.prefix && config.prefix !== '') {
        config.url = config.prefix + config.url;
    }
    var resource = createResource(config);
    config.serializer = config.serializer || new Serializer(resource);
    resource.prototype = createResourcePrototype(resource);
    config.plugins.forEach(function (plugin) {
        plugin(resource);
    });
    return resource;
};

resourceFactory.config = function (config) {
    resourceFactory._config = extend(resourceFactory._config, config);
};

resourceFactory._config = {};

module.exports = resourceFactory;
