var Serializer = function (Resource) {

    this.resource = Resource;

};


Serializer.prototype.deserialize = function (response) {

    if (Array.isArray(response)) {
        var instances = [];
        for (var i = 0; i < response.length; i++) {
            instances.push(this.deserialize(response[i]));
        }
        return instances;
    } else {
        return new this.resource(response);
    }

};


module.exports = Serializer;