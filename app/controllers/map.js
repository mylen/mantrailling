import Ember from 'ember';
import getStyleFunction from "../utils/map-style";
import conf from "../config/environment";

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
  displayScreenshot: false,

  bindCommand: function () {
    this.command.register(this, 'map.view.extent.fit', function(options) {
      var map = this.get('map');
      var layer = this.get('currentLayer');
      return new Promise(function (resolve, error) {
        map.getView().fitExtent( layer.getSource().getExtent(), (map.getSize()));
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
    if (features !== undefined && features !== null) {
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
    if (layer === undefined || layer === null) {
      var source = this.createVectorSource();
      layer = this.createVector(source);
      layer.setStyle(getStyleFunction(this.command, this.i18n));
    } else if (this.map !== null) {
      this.map.removeLayer(this.currentLayer);
    }
    if (this.map !== null) {
      if (this.currentLayer !== null) {
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
        map.getLayers().getArray().forEach(function(vector) {
          vectors.push(vector);
          map.removeLayer(vector);
        });
      }
      // set Tile layers
      layers.forEach(function(layer) {
        map.addLayer(layer.layer);
      });
      // restore vectors
      vectors.forEach(function(vector) {
        map.addLayer(vector);
      });
      if (me.currentLayer !== null) {
        me.changeCurrentLayer(me.currentLayer);
      }
    });
  },

  actions: {
    screenshot: function() {
      var map = this.get('map');
      this.set("displayScreenshot", true);
      $("#screenshot-box-outer").css({position:'absolute', top: 200, left: 200, width: 200, height: 200, border: "2px solid red", "z-index": 1000});
      $('#screenshot-box-outer')
        .draggable()
        .resizable({
          handles: "all"
        });
      $("#screenshot-box").css({width: "100%", height: "100%"});
      $("#screenshot-box-buttons").css({float: "right"});
      $("#screenshot-box-buttons").find("button").on('click', function() {
        map.once('postcompose', function(event) {
          var canvas = event.context.canvas;
          var data = canvas.toDataURL('image/png');
        });
        map.renderSync();
// http://fengyuanchen.github.io/cropper/
        var left = $('#screenshot-box').offset().left;
        var top = $('#screenshot-box').offset().top;
        var data = ctx.getImageData(left,top,$('#screenshot-box').width(),$('#screenshot-box').height());
        this.set("displayScreenshot", false);
      });
    }
  }
});
