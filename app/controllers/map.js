import Ember from 'ember';
import getStyleFunction from "../utils/map-style";
import conf from "../config/environment";
import file from "../utils/file-io";

/**
 * Created by alex on 29/03/2015.
 */
export default Ember.Controller.extend({
  needs: ["mapLayers"],
  mapLayers: Ember.computed.alias("controllers.mapLayers"),
  map: null,
  currentLayer: null,
  basicURL: conf.basicURL,
  expertURL: conf.expertURL,
  isScreenshotLoading: false,

  bindCommand: function () {
    var me = this;
    this.command.register(this, 'map.view.extent.fit', function (options) {
      var map = this.get('map');
      var layer = this.get('currentLayer');
      return new Promise(function (resolve, error) {
        map.getView().fit(layer.getSource().getExtent(), (map.getSize()));
        resolve(true);
      });
    });
    this.command.register(this, 'map.screenshot.data.get', function (options) {
      return new Promise(function (resolve, error) {
        var data = $('#map >> canvas').cropper("getCroppedCanvas").toDataURL('image/png');
        resolve(data);
      });
    });
    this.command.register(this, 'map.screenshot.complete', function (options) {
      return new Promise(function (resolve, error) {
        me.set("displayScreenshot", false);
        $('#map >> canvas').cropper("destroy");
        resolve(true);
      });
    });
  }.on('init'),


  createMap: function () {
    return new ol.Map({
      target: 'map',
      view: new ol.View({
        center: ol.proj.transform([5.1475, 45.6329], 'EPSG:4326', 'EPSG:3857'),
        zoom: 15
      })
    });
  },

  createVectorSource: function (features) {
    var vectorSource = null;
    if (!Ember.isEmpty(features)) {
      vectorSource = new ol.source.GPX({object: features});
    } else {
      vectorSource = new ol.source.Vector();
    }
    return vectorSource;
  },

  createVector: function (source) {
    return new ol.layer.Vector({
      source: source
    });
  },

  changeCurrentLayer: function (layer) {
    if (Ember.isEmpty(layer)) {
      var source = this.createVectorSource();
      layer = this.createVector(source);
      layer.setStyle(getStyleFunction(this.command, this.i18n));
    } else if (!Ember.isEmpty(this.map)) {
      this.map.removeLayer(this.currentLayer);
    }
    if (!Ember.isEmpty(this.map)) {
      if (!Ember.isEmpty(this.currentLayer)) {
        this.map.removeLayer(this.currentLayer);
      }
      this.map.addLayer(layer);
    }
    this.set('currentLayer', layer);
    return layer;
  },


  build: function () {
    var me = this;
    this.set('map', this.createMap());
    window.gMap = this.map;
    this.get('mapLayers').loadLayers().then(function (layers) {
      var map = me.get('map');
      var vectors = [];
      if (map.getLayers().get('length') !== 0) {
        // Save current vecotr used for drawing
        map.getLayers().getArray().forEach(function (vector) {
          vectors.push(vector);
          map.removeLayer(vector);
        });
      }
      // set Tile layers
      layers.forEach(function (layer) {
        map.addLayer(layer.layer);
      });
      // restore vectors
      vectors.forEach(function (vector) {
        map.addLayer(vector);
      });
      if (!Ember.isEmpty(me.currentLayer)) {
        me.changeCurrentLayer(me.currentLayer);
      }
    });
  },

  actions: {
    screenshot: function () {
      var map = this.get('map');
      var me = this;
      console.log("screenshot loading");
      this.set("isScreenshotLoading", true);
      setTimeout(function () {
        $('#map >> canvas').cropper({
          guides: false,
          zoomable: false,
          mouseWheelZoom: false,
          built: function () {
            document.addEventListener('keyup', function (event) {
              if (event.keyCode === 27) {
                $('#screenshot-box-buttons').appendTo("#container");
                me.set("displayScreenshot", false);
                $('#map >> canvas').cropper("destroy");
                $("#screenshot-box-buttons").find("button").off('click');
              }
            });

            var topLeft = map.getPixelFromCoordinate(me.get("currentLayer").getSource().getExtent().slice(0, 2));
            var bottomRight = map.getPixelFromCoordinate(me.get("currentLayer").getSource().getExtent().slice(2, 4));
            $("#map >> canvas").cropper("setCropBoxData",
              {
                "left": topLeft[0] - 30,
                "top": bottomRight[1] - 30,
                "width": bottomRight[0] - topLeft[0] + 60,
                "height": topLeft[1] - bottomRight[1] + 60
              }
            );

            me.set("displayScreenshot", true);
            $('#screenshot-box-buttons').appendTo(".cropper-crop-box");

            $("#screenshot-box-buttons").find("button.save").on('click', function () {
              var data = $('#map >> canvas').cropper("getCroppedCanvas").toDataURL('image/png');
              me.command.send("map.trails.selected.name.get", null, function(name) {
                file.write(data, name, "png", "image/png");
                $('#screenshot-box-buttons').appendTo("#container");
                me.set("displayScreenshot", false);
                $('#map >> canvas').cropper("destroy");
                $("#screenshot-box-buttons").find("button").off('click');
              });
            });
            me.set("isScreenshotLoading", false);
            console.log("screenshot loaded");
          }
        });
      });
    }
  }
});
