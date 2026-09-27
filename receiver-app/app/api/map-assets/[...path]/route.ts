import {mapAssetResponse} from '../../../../lib/map-assets-response';
export async function GET(_request:Request,context:{params:Promise<{path:string[]}>}){
 return mapAssetResponse((await context.params).path.join('/'));
}
