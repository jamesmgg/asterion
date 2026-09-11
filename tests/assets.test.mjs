import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('Every bundled planetary map is an actual image, not a failed download or Git LFS pointer',()=>{
 for(const file of fs.readdirSync('public/textures')){
  const bytes=fs.readFileSync('public/textures/'+file);
  assert.ok(bytes.length>10000,`${file} contains image data`);
  assert.equal(bytes.subarray(0,2).toString('hex'),file.endsWith('.png')?'8950':'ffd8',`${file} has valid image magic`);
 }
});
