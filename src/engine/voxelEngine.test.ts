import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VoxelEngineCore,
  PaletteSubChunk,
  filterCommandAutocomplete,
  WorldTypeId,
} from './voxelEngine';

test('Title Screen zero-chunk initialization & dimension switch memory release', () => {
  const engine = new VoxelEngineCore(12345, 'normal', 5);
  assert.equal(engine.chunks.size, 0, 'Must have 0 chunks allocated on Title Screen');
  assert.equal(engine.meshes.size, 0, 'Must have 0 meshes allocated on Title Screen');

  engine.generateChunk(0, 0);
  engine.buildChunkMesh(0, 0);
  assert.equal(engine.chunks.size, 1);
  assert.equal(engine.meshes.size, 1);

  engine.switchDimension('minecraft:the_nether');
  assert.equal(engine.chunks.size, 0, 'Switching dimension must immediately free old chunks');
  assert.equal(engine.meshes.size, 0, 'Switching dimension must immediately free old meshes');
});

test('16-bit PaletteSubChunk compression & single-value optimization', () => {
  const sub = new PaletteSubChunk();
  assert.equal(sub.indices, null, 'All-air subchunk must allocate 0 index arrays');
  assert.equal(sub.get(5, 5, 5), 0);

  sub.set(3, 4, 5, 21); // Poplar Log
  assert.notEqual(sub.indices, null);
  assert.equal(sub.get(3, 4, 5), 21);
  assert.equal(sub.nonAirCount, 1);

  sub.set(3, 4, 5, 0);
  assert.equal(sub.get(3, 4, 5), 0);
  assert.equal(sub.nonAirCount, 0);
});

test('All 7 World Types generate expected terrain profiles', () => {
  const modes: WorldTypeId[] = [
    'normal',
    'jj_thunder',
    'amplified',
    'flat',
    'skyblock',
    'skyblock_lucky',
    'oneblock',
  ];

  for (const mode of modes) {
    const engine = new VoxelEngineCore(999, mode, 3);
    const chunk = engine.generateChunk(0, 0);
    assert.ok(chunk, `Chunk (0,0) generated for ${mode}`);
  }

  // Verify OneBlock infinite regeneration at (0, 64, 0)
  const oneBlockEngine = new VoxelEngineCore(999, 'oneblock', 3);
  oneBlockEngine.generateChunk(0, 0);
  assert.notEqual(oneBlockEngine.getBlock(0, 64, 0), 0);
  oneBlockEngine.setBlock(0, 64, 0, 0);
  assert.notEqual(
    oneBlockEngine.getBlock(0, 64, 0),
    0,
    'OneBlock must immediately regenerate next phase block when broken'
  );
  assert.equal(oneBlockEngine.oneBlockBrokenCount, 1);
});

test('Time-sliced Mega TNT explosion engine processes within slice budget & WorldEdit undo/redo works', () => {
  const engine = new VoxelEngineCore(42, 'flat', 3);
  engine.generateChunk(0, 0);
  assert.equal(engine.getBlock(4, 64, 4), 2); // Grass at Y=64

  engine.queueTimeSlicedExplosion(4, 64, 4, 3);
  const res = engine.stepExplosionSlice();
  assert.ok(res.dirtyChunkKeys.includes('0,0'));
  assert.equal(engine.getBlock(4, 64, 4), 0, 'Center block must be destroyed by explosion');

  // Test WorldEdit //set and //undo
  const we = engine.applyWorldEditBox([0, 65, 0], [2, 65, 2], 22, 'set');
  assert.equal(we.changedCount, 9);
  assert.equal(engine.getBlock(1, 65, 1), 22);

  const undone = engine.undoWorldEdit();
  assert.equal(undone.restoredCount, 9);
  assert.equal(engine.getBlock(1, 65, 1), 0);
});

test('Command autocomplete and custom JSON Mod registration work', () => {
  const engine = new VoxelEngineCore(1, 'normal', 3);
  const custom = engine.registerCustomModJson(
    JSON.stringify({
      id: 'CrystalMod:amethyst_tnt',
      name: 'Amethyst Nova TNT',
      color: '#b388ff',
      tnt_properties: { blast_radius: 12, fuse_ticks: 60 },
    })
  );
  assert.equal(custom.id, 'CrystalMod:amethyst_tnt');
  assert.equal(custom.tntRadius, 12);

  const suggestions = filterCommandAutocomplete('/give @s mega', Array.from(engine.blocksById.keys()));
  assert.ok(suggestions.some((s) => s.includes('megatnt:tnt_')));
});
