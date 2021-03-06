/**
 * Created by alex on 04/04/2015.
 */
import Ember from 'ember';
import * as consts from '../utils/map-constants';
import tooltip from '../utils/ol-tooltip';
import getRGB from "../utils/color-get-rgb";
import calcBrightness from "../utils/color-get-brightness";
import colorLuminance from "../utils/color-get-luminance";
import getRoute from "../utils/google-route-between-a-and-b";
import formatLength from "../utils/map-format-length";
import formatArea from "../utils/map-format-area";

export default Ember.Controller.extend({

  needs: ['map', 'mtgTrail'],
  map: Ember.computed.alias("controllers.map.map"),
  currentLayer: Ember.computed.alias("controllers.map.currentLayer"),
  olDraw: null,
  mtgDrawState: null,
  onDrawStart: null,
  onDrawEnd: null,
  moveListenerKey: null,
  sketch: null,
  sketchLastState: null,
  color: null,
  colors: consts.COLORS,
  resetColor: null,
  popups: [],
  followPathMode: false,

  bindActions: function () {
    var me = this;
    this.command.register(this, 'actions.map.draw.point', function (options) {
      var me = this;
      return new Promise(function (resolve) {
        me.command.send('map.draw.point', {style: consts.style[consts.POINT]}, function (feature) {
          console.log("point created");
          me.command.send('map.draw.point.created', {feature: feature});
        });
      });
    });
    this.command.register(this, 'actions.map.draw.polygon', function (options) {
      var me = this;
      return new Promise(function (resolve) {
        me.command.send('map.draw.polygon', consts.style[consts.POLYGON], function (feature) {
          console.log("polygon created");
          me.command.send('map.draw.polygon.created', {feature: feature});
        });
      });
    });
    this.command.register(this, 'actions.map.draw.linestring', function (options) {
      var me = this;
      return new Promise(function (resolve) {
        $(".map-draw-linestring").addClass('hidden');
        $(".map-draw-follow-path").removeClass('hidden');
        me.command.send('map.draw.linestring', consts.style[consts.LINE_STRING], function (feature) {
          console.log("line string created");
          me.command.send('map.draw.linestring.created', {feature: feature}, function () {
            $(".map-draw-follow-path").addClass('hidden');
            $(".map-draw-linestring").removeClass('hidden');
            resolve(this);
          });
        });
      });
    });
    this.command.register(this, 'actions.map.draw.color', function (color) {
      var me = this;
      return new Promise(function (resolve) {
        me.changeColor(color);
        resolve(this);
      });
    });
  }.on('init'),

  bindCommand: function () {
    var me = this;
    this.command.register(this, 'map.draw.point', this.drawPoint);
    this.command.register(this, 'map.draw.location', this.drawLocation);
    this.command.register(this, 'map.draw.linestring', this.drawLineString);
    this.command.register(this, 'map.draw.polygon', this.drawPolygon);
    this.command.register(this, 'map.draw.color.change', function (options) {
      var me = this;
      return new Promise(function (resolve) {
        var feature = options.feature;
        var color = options.color;
        console.log("change color to:" + color);
        feature.set('color', color);
        resolve(feature);
      });
    });
    this.command.register(this, 'map.draw.linestring.mode', function (options) {
      return new Promise(function (resolve) {
        me.followPathMode = options.followPathMode;
        resolve(true);
      });
    });
  }.on('init'),

  initSelectAndModify: function () {
    var map = this.get('map');
    if (!Ember.isEmpty(map)) {
      map.addInteraction(this.get('select'));
      map.addInteraction(this.get('modify'));
      this.changeCursorOnFeature();
    }
  }.observes('map'),

  onGeometryChange: function () {
    var map = this.get('map');
    if (Ember.isEmpty(map)) {
      return;
    }
    map.removeInteraction(this.get('olDraw'));
    $('#map').off('mouseup');
    if (!Ember.isEmpty(this.get('mtgDrawState'))) {
      this.createDraw();
      map.addInteraction(this.get('olDraw'));
    }
  }.observes('mtgDrawState'),

  changeCursorOnFeature: function () {
    var map = this.get('map');
    $("#map").on('mousemove', function (e) {
      var pixel = map.getEventPixel(e.originalEvent);
      var hit = map.forEachFeatureAtPixel(pixel, function () {
        return true;
      });
      if (hit) {
        $("#map").css("cursor", "pointer");
      } else {
        $("#map").css("cursor", "");
      }
    });
  },

  deleteSelectionFactory: function (features, vector, me) {
    var me = this;
    this.deleteSelection = function (event) {
      if (event.keyCode === 46) {
        // remove all selected features from select and vector
        features.forEach(function (feature) {
          features.remove(feature);
          var vectorFeatures = vector.getSource().getFeatures();
          vectorFeatures.forEach(function (sourceFeature) {
            if (sourceFeature === feature) {
              vector.getSource().removeFeature(sourceFeature);
              me.command.send('map.feature.remove', {feature: sourceFeature});
            }
          });
        });
      }
    };
    return this.deleteSelection;
  },

  select: Ember.computed({
    get: function () {
      var me = this;
      if (!Ember.isEmpty(this.get('selectCache'))) {
        return this.get('selectCache');
      }
      var select = new ol.interaction.Select();

      // grab the features from the select interaction to use in the modify interaction
      var features = select.getFeatures();

      // when a feature is selected...
      features.on('add', function () {
        var vector = this.get('currentLayer');
        // listen to pressing of delete key, then delete selected features
        document.addEventListener('keyup', this.deleteSelectionFactory(features, vector, me));
      }, this);

      features.on('remove', function () {
        document.removeEventListener('keyup', this.deleteSelection);
        this.command.send('map.draw.change', {features: features});
      }, this);

      this.set('selectCache', select);
      return select;
    }
  }),

  modify: Ember.computed({
    get: function () {
      if (!Ember.isEmpty(this.get('modifyCache'))) {
        return this.get('modifyCache');
      }
      var select = this.get('select');
      var modify = new ol.interaction.Modify({
        features: select.getFeatures(),
        // the SHIFT key must be pressed to delete vertices, so
        // that new vertices can be drawn at the same position
        // of existing vertices
        deleteCondition: function (event) {
          return ol.events.condition.shiftKeyOnly(event) &&
            ol.events.condition.singleClick(event);
        }
      });

      this.set('modifyCache', modify);
      return modify;
    }
  }),

  createDraw: function () {
    var me = this;
    var currentLayer = this.get('currentLayer');
    var source = currentLayer.getSource();
    var geometry = this.get('mtgDrawState');
    if (this.get('mtgDrawState') === consts.MARKER || this.get('mtgDrawState') === consts.LOCATION) {
      geometry = consts.POINT;
    }
    this.set('olDraw', new ol.interaction.Draw({
      source: source,
      type: geometry,
      geometryFunction: function(coordinates, geometry) {
        if (!geometry) {
          geometry = new ol.geom.LineString(null);
        }
        geometry.setCoordinates(coordinates);
        return geometry;
      }
    }));
    tooltip.createTooltips(this.get('map'), this.get('sketch'), this.get('mtgDrawState'));

    this.get('olDraw').on('drawstart',
      function (evt) {
        // set sketch
        var feature = evt.feature;
        var geom = feature.getGeometry();

        if (geom.getType() === consts.LINE_STRING) {
          feature.on('change', function (e) {
            this.command.send('map.linestring.change', {feature: e.currentTarget});
          }, this);
        }
        if (!Ember.isEmpty(this.get('onDrawStart'))) {
          this.get('onDrawStart')(feature);
        }
        this.set('sketch', feature);
        tooltip.sketch = feature;
        document.addEventListener('keyup', this.get('olDraw').removeLastPoint);
        var me = this;
        $('#map').on('mouseup', function () {
          if (geom.getType() === consts.LINE_STRING && me.followPathMode) {
            var coords = geom.getCoordinates();
            var len = coords.length;
            if (len > 1) {
              var start = coords[len - 2];
              var end = coords[len - 1];
              getRoute(start, end).then(function (route) {
                me.get('olDraw').finishDrawing();
                geom.setCoordinates(coords.slice(0,-1).concat(route));
                //me.get('olDraw').sketchCoords_ = me.get('olDraw').sketchCoords_.slice(0,-2).concat(route);
                //me.get('olDraw').updateSketchFeatures_();
                //route.forEach(function(point) {
                //  event = {coordinate: point};
                //  me.get('olDraw').addToDrawing_(event);
                //});
                //geom.setCoordinates(coords.concat(route));
                //me.get('olDraw').sketchCoords_ = me.get('olDraw').sketchCoords_.concat(route);
              });
            }
          }
        });
      }, this);

    this.get('olDraw').on('drawend', function (e) {
      var feature = e.feature;
      var geom = feature.getGeometry();
      tooltip.deleteTooltips(this.get('map'));
      this.set('sketch', null);
      tooltip.sketch = null;
      this.set('mtgDrawState', null);
      $('#map').off('mouseup');
      document.removeEventListener('keyup', this.removeLastPoint);
      if (!Ember.isEmpty(this.get('onDrawEnd'))) {
        this.get('onDrawEnd')(feature);
      }
    }, this);
    return this.get('olDraw');
  },

  sketchSaveState: function () {
    var sketch = this.get('sketch');
    var sketchLastState = this.get('sketchLastState');
    if (sketch === sketchLastState) {
      return;
    }
    this.set('sketchLastState', sketch);
  }.observes('sketch'),

  handleSketchFinish: function () {
    var sketch = this.get('sketch');
    // Wait for sketch to be drawn
    if (Ember.isEmpty(sketch)) {
      sketch = this.get('sketchLastState');
      var popup;
      if (this.get('mtgDrawState') === consts.MARKER || this.get('mtgDrawState') === consts.LOCATION) {
        popup = this.container.lookup('component:map-popup', {singleton: false});
        popup.set('feature', sketch);
        popup.set('map', this.get('map'));
        if (this.get('mtgDrawState') === consts.LOCATION) {
          popup.set('content', ol.coordinate.toStringHDMS(
            ol.proj.transform(sketch.getGeometry().getFirstCoordinate(), 'EPSG:3857', 'EPSG:4326')));
          sketch.setStyle(new ol.style.Style());
        } else {
          popup.setEditable();
        }
        popup.append();
        this.get('popups').pushObject(popup);
      }
    }
  }.observes('sketch'),

  drawPointAtLocation: function (me, resolve, options) {
    var feature = new ol.Feature({
      geometry: new ol.geom.Point(options.location),
      name: 'GPS Tracker'
    });
    me.get('currentLayer').getSource().addFeature(feature);
    feature.set('extensions', options.style);
    resolve(feature);
  },

  drawPointUI: function (me, resolve, options) {
    me.set('mtgDrawState', consts.POINT);
    me.set('onDrawEnd', function (feature) {
      options.type = consts.POINT;
      if (!Ember.isEmpty(me.get('color'))) {
        feature.set('color', me.get('color'));
      }
      feature.set('extensions', options.style);
      me.set('onDrawEnd', null);
      resolve(feature);
    });
  },

  drawPoint: function (options) {
    var me = this;
    return new Promise(function (resolve) {
      if (!Ember.isEmpty(options) && !Ember.isEmpty(options.removeFeature)) {
        me.get('currentLayer').getSource().removeFeature(options.removeFeature);
      }
      if (!Ember.isEmpty(options.location)) {
        me.drawPointAtLocation(me, resolve, options);
      } else {
        me.drawPointUI(me, resolve, options);
      }
    });
  },

  draw: function (what, labelFunction, options) {
    var me = this;
    return new Promise(function (resolve) {
      if (!Ember.isEmpty(options) && !Ember.isEmpty(options.removeFeature)) {
        me.get('currentLayer').getSource().removeFeature(options.removeFeature);
      }
      me.set('mtgDrawState', what);
      me.set('onDrawStart', function (feature) {
        if (Ember.isEmpty(options.type)) {
          options.type = what;
        }
        if (!Ember.isEmpty(me.get('color'))) {
          feature.set('color', me.get('color'));
        }
        feature.set('extensions', options);
        me.set('onDrawStart', null);
      });
      me.set('onDrawEnd', function (feature) {
        var geometry = feature.getGeometry();
        var label = labelFunction(me.get('map').getView().getProjection(), geometry);
        feature.set('label', label);
        me.set('onDrawEnd', null);
        resolve(feature);
      });
    });
  },

  drawLineString: function (options) {
    return this.draw(consts.LINE_STRING, formatLength, options);
  },

  drawPolygon: function (options) {
    return this.draw(consts.POLYGON, formatArea, options);
  },

  drawLocation: function () {
    var me = this;
    return new Promise(function (resolve) {
      me.set('mtgDrawState', consts.LOCATION);
      resolve(true);
    });
  },

  changeColor: function (color) {
    this.set('color', color);
    console.log("color modified:" + color);

    var setBtnColor = function (color) {
      var brigthness = calcBrightness(getRGB(color));
      $('.btn-Color').css("background-color", color);
      $('.btn-Color').css("color", (brigthness < 220) ? "#ffffff" : "#000000");
      console.log("color modified:" + color + " (brightness: " + brigthness + ")");
    };

    setBtnColor(color);
    var darker = colorLuminance(color, -0.5);
    $('.btn-Color').hover(function () {
      setBtnColor(darker);
    }, function () {
      setBtnColor(color);
    });
  },

  actions: {
    drawLineStringAction: function () {
      this.command.send('actions.map.draw.linestring');
    },
    drawPolygonAction: function () {
      this.command.send('actions.map.draw.polygon');
    },
    drawPointAction: function () {
      this.command.send('actions.map.draw.point');
    },
    changeColor: function (color) {
      this.command.send('actions.map.draw.color', color);
    }
  }
});
