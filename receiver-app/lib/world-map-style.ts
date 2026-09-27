import base from './data/world-style.json' with {type:'json'};
import spriteNames from './data/world-sprite-names.json' with {type:'json'};
import type {StyleSpecification,ExpressionSpecification} from 'maplibre-gl';
import {brandNames,referenceNames,categoryNames,restaurantClasses} from './world-labels';

const first=(...keys:string[]):ExpressionSpecification=>['case',...keys.flatMap(key=>[['!=',['coalesce',['get',key],''],''],['get',key]]),''] as ExpressionSpecification;
const lookup=(dictionary:Record<string,string>,key:ExpressionSpecification):ExpressionSpecification=>['coalesce',['get',key,['literal',dictionary]],''];
export function labelExpression(sourceLayer=''):ExpressionSpecification{
 const key:ExpressionSpecification=['downcase',first('name:en','name:latin','name')];
 const category=sourceLayer==='transportation_name'?'道路':sourceLayer==='aerodrome_label'?'机场':
  ['coalesce',['get',['coalesce',['get','subclass'],''],['literal',categoryNames]],['get',['coalesce',['get','class'],''],['literal',categoryNames]],''];
 return ['let','zh',first('name:zh-Hans','name:zh','name:zh-Hant','name:zh_CN','name_zh'),
  'local',first('name','name:nonlatin','name:latin','name:en'),
  'readable',first('name:en','name:latin','name'),
  'official',['case',['all',['==',key,'subway'],['!', ['in',['coalesce',['get','class'],''],['literal',restaurantClasses]]]],'',lookup(brandNames,key)],
  'reference',lookup(referenceNames,key),
  ['case',['!=',['var','zh'],''],
   ['case',['!=',['var','local'],['var','zh']],['concat',['var','zh'],'\n',['var','local']],['var','zh']],
   ['!=',['var','official'],''],['concat',['var','official'],'\n',['var','readable']],
   ['!=',['var','reference'],''],['concat',['var','reference'],'†\n',['var','readable']],
   ['!=',category,''],['concat',category,'\n',['var','readable']],
   ['case',['!=',['var','readable'],['var','local']],['concat',['var','readable'],'\n',['var','local']],['var','local']]]
 ] as ExpressionSpecification;
}
export const bilingualName=labelExpression();

export function worldStyle(origin:string):StyleSpecification{
 const style=structuredClone(base) as unknown as StyleSpecification;
 style.glyphs=origin+'/api/world-map/fonts/{fontstack}/{range}.pbf';
 style.sprite=origin+'/api/map-assets/v3/sprite';
 const source=style.sources.default;if(source.type==='vector')source.tiles=[origin+'/api/world-map/vector/{z}/{x}/{y}'];
 for(const layer of style.layers){
  if(layer.type==='symbol'&&layer.layout?.['text-font'])layer.layout['text-font']=['Noto Sans Regular'];
  if(layer.type==='symbol'&&typeof layer.layout?.['icon-image']==='string'&&layer.layout['icon-image'].includes('{')){
   const token=layer.layout['icon-image'],parts=token.split(/(\{[^}]+\})/).filter(Boolean).map(part=>part.startsWith('{')?['to-string',['get',part.slice(1,-1)]]:part);
   // The upstream style includes POI classes without corresponding sprite artwork.
   // Keep their labels and show a generic dot instead of requesting a missing icon.
   layer.layout['icon-image']=['let','sprite',['concat',...parts],['case',['in',['var','sprite'],['literal',spriteNames]],['var','sprite'],token.includes('class')?'circle_11':'road_1']] as ExpressionSpecification;
  }
  if(layer.type!=='symbol'||!layer.layout?.['text-field']||!JSON.stringify(layer.layout['text-field']).includes('name'))continue;
  layer.layout['text-field']=labelExpression(layer['source-layer']);
  // One font avoids fetching the same glyph range separately in three weights.
  layer.layout['text-font']=['Noto Sans Regular'];
  if(typeof layer.layout['text-size']==='number')layer.layout['text-size']=Math.max(13,layer.layout['text-size']);
  layer.paint={...layer.paint,'text-halo-color':'#fff','text-halo-width':1.4};
 }
 return style;
}
