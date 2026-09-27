import base from './data/world-style.json' with {type:'json'};
import spriteNames from './data/world-sprite-names.json' with {type:'json'};
import type {StyleSpecification,ExpressionSpecification} from 'maplibre-gl';
import {brandNames,referenceNames,categoryNames,restaurantClasses} from './world-labels';

const first=(...keys:string[]):ExpressionSpecification=>['case',...keys.flatMap(key=>[['!=',['coalesce',['get',key],''],''],['get',key]]),''] as ExpressionSpecification;
const lookup=(dictionary:Record<string,string>,key:ExpressionSpecification):ExpressionSpecification=>['coalesce',['get',key,['literal',dictionary]],''];
export function labelExpression(sourceLayer=''):ExpressionSpecification{
 const key:ExpressionSpecification=['downcase',first('name:en','name:latin','name')];
 const category=sourceLayer==='transportation_name'?'':sourceLayer==='aerodrome_label'?'机场':
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
   (sourceLayer==='transportation_name'?['var','readable']:['case',['!=',['var','readable'],['var','local']],['concat',['var','readable'],'\n',['var','local']],['var','local']])]
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
  if(layer.id==='building'&&layer.type==='fill')layer.paint={'fill-color':'#ddd9d3','fill-outline-color':'#b9b2a9','fill-opacity':.95};
  // The original translucent duplicate roof washed out small building footprints.
  if(layer.id==='building-top')layer.layout={...layer.layout,visibility:'none'};
  if(layer.type==='symbol'&&layer.layout&&layer['source-layer']==='poi'){
   if(layer.id==='poi-level-1')layer.minzoom=13;
   if(layer.id==='poi-level-2')layer.minzoom=14;
   if(layer.id==='poi-level-3')layer.minzoom=15;
   layer.layout['text-optional']=true;layer.layout['icon-optional']=true;
   layer.layout['text-padding']=1;layer.layout['text-max-width']=8;
   layer.layout['symbol-sort-key']=['coalesce',['get','rank'],99];
  }
  if(layer.id==='highway-name-minor')layer.minzoom=13.5;
  if(layer.id==='highway-name-path')layer.minzoom=15;
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
 // Open building footprints and places supplement gaps in the OSM basemap.
 // No country-scale requests: z14 tiles are loaded only at neighborhood scale.
 const attribution='© <a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noopener noreferrer">Overture Maps</a>';
 for(const theme of ['buildings','places'])style.sources['relay-overture-'+theme]={type:'vector',tiles:[origin+'/api/world-map/overture/'+theme+'/14/{x}/{y}'],minzoom:14,maxzoom:14,attribution};
 const buildingIndex=style.layers.findIndex(l=>l.id==='building');
 style.layers.splice(Math.max(0,buildingIndex),0,{id:'relay-overture-buildings-fill',type:'fill',source:'relay-overture-buildings','source-layer':'building',minzoom:14,paint:{'fill-color':'#dedad4','fill-outline-color':'#b8b1a8','fill-opacity':['interpolate',['linear'],['zoom'],14,.7,16,.95]}});
 for(const rank of [1,2,3])style.layers.push({id:'relay-overture-places-'+rank,type:'symbol',source:'relay-overture-places','source-layer':'place',minzoom:rank===1?14:rank===2?15:16,
  filter:['==',['get','rank'],rank],layout:{'text-field':labelExpression('poi'),'text-font':['Noto Sans Regular'],'text-size':13,'text-max-width':8,'text-anchor':'top','text-offset':[0,.6],'text-padding':5,'text-optional':false,'icon-optional':true,'icon-size':.85,'icon-image':['let','sprite',['concat',['get','icon'],'_11'],['case',['in',['var','sprite'],['literal',spriteNames]],['var','sprite'],'circle_stroked_11']],'symbol-sort-key':['-',1,['get','confidence']]},
  paint:{'text-color':'#405872','text-halo-color':'#fff','text-halo-width':1.5}});
 // House numbers are real features from the provider; never infer missing addresses.
 style.layers.push({id:'relay-house-numbers',type:'symbol',source:'default','source-layer':'housenumber',minzoom:17,layout:{'text-field':['to-string',['get','housenumber']],'text-font':['Noto Sans Regular'],'text-size':12,'text-padding':2},paint:{'text-color':'#685f56','text-halo-color':'#fff','text-halo-width':1.2}});
 return style;
}
