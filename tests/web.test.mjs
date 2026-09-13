import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLrc} from '../web/lyrics.mjs';
test('fractional, repeated and offset timestamps',()=>{
 const events=parseLrc('[offset:100]\n[00:01.5][00:03.050]hello world',5);
 assert.deepEqual(events.find(e=>e[0]===1.6),[1.6,['hello']]);
 assert.deepEqual(events.find(e=>e[0]===3.15),[3.15,['hello']]);
});
test('enhanced lyrics and blank clear',()=>{
 const events=parseLrc('[00:01]<00:01>hello <00:02.5>world\n[00:04]',5);
 assert.deepEqual(events.find(e=>e[0]===2.5),[2.5,['hello','world']]);
 assert.deepEqual(events.at(-1),[4,[]]);
});
test('negative shifts preserve active words at zero',()=>{
 assert.deepEqual(parseLrc('[00:00]one two\n[00:02]three',4,-1)[0],[0,['one','two']]);
});
test('reject untimed, out-of-range and unordered words',()=>{
 for(const text of ['bad','[00:99]bad','[20:00]late','[00:01]<00:03>a <00:02>b'])assert.throws(()=>parseLrc(text,5));
});
