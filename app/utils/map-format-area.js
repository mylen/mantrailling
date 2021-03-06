import mapConst from "../utils/map-const";

/**
 * format length output
 * @param {ol.geom.Polygon} polygon
 * @return {string}
 */
export default function mapFormatArea(projection, polygon) {
  var area;
  var geom = /** @type {ol.geom.Polygon} */(polygon.clone().transform(
    projection, 'EPSG:4326'));
  var coordinates = geom.getLinearRing(0).getCoordinates();
  area = Math.abs(mapConst.wgs84Sphere.geodesicArea(coordinates));
  var output;
  if (area > 10000) {
    output = (Math.round(area / 1000000 * 100) / 100) +
    ' ' + 'km²';
  } else {
    output = (Math.round(area * 100) / 100) +
    ' ' + 'm²';
  }
  return output;
}
