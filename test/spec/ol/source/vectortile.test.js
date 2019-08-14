import Map from '../../../../src/ol/Map.js';
import View from '../../../../src/ol/View.js';
import VectorRenderTile from '../../../../src/ol/VectorRenderTile.js';
import VectorTile from '../../../../src/ol/VectorTile.js';
import GeoJSON from '../../../../src/ol/format/GeoJSON.js';
import MVT from '../../../../src/ol/format/MVT.js';
import VectorTileLayer from '../../../../src/ol/layer/VectorTile.js';
import {get as getProjection, get} from '../../../../src/ol/proj.js';
import VectorTileSource from '../../../../src/ol/source/VectorTile.js';
import {createXYZ} from '../../../../src/ol/tilegrid.js';
import TileGrid from '../../../../src/ol/tilegrid/TileGrid.js';
import {listen, unlistenByKey} from '../../../../src/ol/events.js';
import TileState from '../../../../src/ol/TileState.js';

describe('ol.source.VectorTile', function() {

  const format = new MVT();
  const source = new VectorTileSource({
    format: format,
    url: 'spec/ol/data/{z}-{x}-{y}.vector.pbf'
  });
  let tile;

  describe('constructor', function() {
    it('sets the format on the instance', function() {
      expect(source.format_).to.equal(format);
    });

    it('sets the default zDirection on the instance', function() {
      expect(source.zDirection).to.be(1);
    });

    it('uses ol.VectorTile as default tileClass', function() {
      expect(source.tileClass).to.equal(VectorTile);
    });

    it('creates a 512 XYZ tilegrid by default', function() {
      const tileGrid = createXYZ({tileSize: 512});
      expect(source.tileGrid.tileSize_).to.equal(tileGrid.tileSize_);
      expect(source.tileGrid.extent_).to.equal(tileGrid.extent_);
    });
  });

  describe('#getTile()', function() {

    it('creates a tile with the correct tile class', function() {
      tile = source.getTile(0, 0, 0, 1, getProjection('EPSG:3857'));
      expect(tile).to.be.a(VectorRenderTile);
    });

    it('sets the correct tileCoord on the created tile', function() {
      expect(tile.getTileCoord()).to.eql([0, 0, 0]);
    });

    it('fetches tile from cache when requested again', function() {
      expect(source.getTile(0, 0, 0, 1, getProjection('EPSG:3857')))
        .to.equal(tile);
    });

    it('loads source tiles', function(done) {
      const source = new VectorTileSource({
        format: new GeoJSON(),
        url: 'spec/ol/data/point.json'
      });
      const tile = source.getTile(0, 0, 0, 1, source.getProjection());

      tile.load();
      const key = listen(tile, 'change', function(e) {
        if (tile.getState() === TileState.LOADED) {
          const sourceTile = source.getSourceTiles(1, source.getProjection(), tile)[0];
          expect(sourceTile.getFeatures().length).to.be.greaterThan(0);
          unlistenByKey(key);
          done();
        }
      });
    });

    it('handles empty tiles', function(done) {
      const source = new VectorTileSource({
        format: new GeoJSON(),
        url: ''
      });
      const tile = source.getTile(0, 0, 0, 1, source.getProjection());

      const key = listen(tile, 'change', function(e) {
        unlistenByKey(key);
        expect(tile.getState()).to.be(TileState.EMPTY);
        done();
      });
      tile.load();
    });

    it('creates empty tiles outside the source extent', function() {
      const fullExtent = get('EPSG:3857').getExtent();
      const source = new VectorTileSource({
        extent: [fullExtent[0], fullExtent[1], 0, 0]
      });
      const tile = source.getTile(1, 1, 1, 1, source.getProjection());
      expect(tile.getState()).to.be(TileState.EMPTY);
    });

    it('creates new tile when source key changes', function() {
      source.setKey('key1');
      const tile1 = source.getTile(0, 0, 0, 1, getProjection('EPSG:3857'));
      const tile2 = source.getTile(0, 0, 0, 1, getProjection('EPSG:3857'));
      source.setKey('key2');
      const tile3 = source.getTile(0, 0, 0, 1, getProjection('EPSG:3857'));
      expect(tile1).to.equal(tile2);
      expect(tile1.key).to.be('key1');
      expect(tile3.key).to.be('key2');
    });

  });

  describe('#getTileGridForProjection', function() {
    it('creates a tile grid with the source tile grid\'s tile size', function() {
      const tileGrid = source.getTileGridForProjection(getProjection('EPSG:3857'));
      expect(tileGrid.getTileSize(0)).to.be(512);
    });
  });

  describe('Tile load events', function() {
    it('triggers tileloadstart and tileloadend with ol.VectorTile', function(done) {
      tile = source.getTile(14, 8938, 5680, 1, getProjection('EPSG:3857'));
      let started = false;
      source.on('tileloadstart', function() {
        started = true;
      });
      source.on('tileloadend', function(e) {
        expect(started).to.be(true);
        expect(e.tile).to.be.a(VectorTile);
        expect(e.tile.getFeatures().length).to.be(1327);
        done();
      });
      tile.load();
    });
  });

  describe('different source and render tile grids', function() {

    let source, map, loaded, requested, target;

    beforeEach(function() {

      loaded = [];
      requested = 0;

      function tileUrlFunction(tileCoord) {
        ++requested;
        if (tileCoord.toString() == '5,13,-29') {
          return tileCoord.join('/');
        }
      }

      function tileLoadFunction(tile, src) {
        tile.setLoader(function() {});
        loaded.push(src);
      }

      const extent = [665584.2026596286, 7033250.839875697, 667162.0221431496, 7035280.378636755];

      source = new VectorTileSource({
        tileGrid: new TileGrid({
          origin: [218128, 6126002],
          resolutions: [4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5]
        }),
        tileUrlFunction: tileUrlFunction,
        tileLoadFunction: tileLoadFunction
      });

      target = document.createElement('div');
      target.style.width = target.style.height = '100px';
      document.body.appendChild(target);

      map = new Map({
        layers: [
          new VectorTileLayer({
            extent: extent,
            source: source
          })
        ],
        target: target,
        view: new View({
          zoom: 11,
          center: [666373.1624999996, 7034265.3572]
        })
      });

    });

    afterEach(function() {
      document.body.removeChild(target);
    });

    it('loads available tiles', function(done) {
      map.renderSync();
      setTimeout(function() {
        expect(requested).to.be.greaterThan(1);
        expect(loaded).to.eql(['5/13/-29']);
        done();
      }, 0);
    });

  });

});
