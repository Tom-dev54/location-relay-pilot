export const bundledGlyphRanges=['0-255','256-511','512-767','768-1023','3584-3839','7680-7935'];
export function preloadWorldAssets(){
 if(typeof document==='undefined')return;
 const suffix=devicePixelRatio>1?'@2x':'';
 for(const file of ['noto-regular-0-255.pbf',`sprite${suffix}.json`,`sprite${suffix}.png`]){
  const href='/api/map-assets/v3/'+file;
  if(document.querySelector(`link[data-world-preload="${file}"]`))continue;
  const link=document.createElement('link');link.rel='preload';link.as='fetch';link.crossOrigin='anonymous';link.href=href;link.dataset.worldPreload=file;document.head.appendChild(link);
 }
}
