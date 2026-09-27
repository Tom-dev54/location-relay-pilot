type Resource={url:URL;type:string;maxBytes:number};
// Fixed resources only. No client-provided URLs, hosts, styles, or API credentials.
export function worldResource(path:string):Resource|null{
 const tile=/^(vector|tile-hd)\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})$/.exec(path);
 if(tile){
  const [,kind,zs,xs,ys]=tile,z=Number(zs),x=Number(xs),y=Number(ys);
  if(z>(kind==='vector'?14:19)||x>=2**z||y>=2**z)return null;
  return {url:new URL(`https://maps.geoapify.com/v1/tile/${kind==='vector'?'vector':'osm-bright'}/${z}/${x}/${y}${kind==='vector'?'.pbf':'@2x.png'}`),type:kind==='vector'?'application/x-protobuf':'image/png',maxBytes:2000000};
 }
 const font=/^fonts\/(Noto Sans (?:Regular|Italic|Bold))\/(\d{1,6})-(\d{1,6})\.pbf$/.exec(path);
 if(font){const start=Number(font[2]),end=Number(font[3]);if(start%256||end!==start+255||end>65535)return null;return {url:new URL(`https://maps.geoapify.com/v1/styles/osm-bright/fonts/${encodeURIComponent(font[1])}/${start}-${end}.pbf`),type:'application/x-protobuf',maxBytes:1000000};}
 if(/^sprite(?:@2x)?\.(?:json|png)$/.test(path))return {url:new URL('https://maps.geoapify.com/v1/styles/osm-bright/'+path),type:path.endsWith('.json')?'application/json':'image/png',maxBytes:2000000};
 return null;
}
