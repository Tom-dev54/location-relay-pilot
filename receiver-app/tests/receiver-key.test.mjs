import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeReceiver,RECEIVER_STORAGE,validReceiverKey} from '../lib/receiver-key.ts';
const keyA='r_'+'a'.repeat(64),keyB='r_'+'b'.repeat(64);
function storage(value=null){return{value,getItem(){return this.value;},setItem(k,v){assert.equal(k,RECEIVER_STORAGE);this.value=v;}};}
test('首次打开直接生成且刷新复用入口',()=>{const s=storage();const a=initializeReceiver('',s,()=>new Uint8Array(32).fill(13));assert.ok(validReceiverKey(a.key));assert.equal(a.persisted,true);assert.equal(initializeReceiver('',s,()=>{throw Error('不应再次生成');}).key,a.key);});
test('不同设备用专属链接恢复同一入口',()=>{const s=storage();const a=initializeReceiver('#receive='+keyA,s,()=>{throw Error('不应生成');});assert.equal(a.key,keyA);assert.equal(s.value,keyA);});
test('显式打开其他入口时不合并身份',()=>{const s=storage(keyA);assert.equal(initializeReceiver('#receive='+keyB,s,()=>new Uint8Array(32)).key,keyB);assert.equal(s.value,keyB);});
test('存储受限时仍可使用并明确提示未保存',()=>{const s={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};assert.equal(initializeReceiver('#receive='+keyA,s,()=>new Uint8Array(32)).persisted,false);});
test('不完整链接不能悄悄创建另一个入口',()=>{assert.throws(()=>initializeReceiver('#receive=bad',storage(keyA),()=>new Uint8Array(32)));assert.throws(()=>initializeReceiver('',storage('bad'),()=>new Uint8Array(32)));});
test('朋友发送链接与接收入口的格式不同',()=>{assert.equal(validReceiverKey('a'.repeat(64)),false);assert.equal(validReceiverKey(keyA),true);});
