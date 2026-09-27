import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){
  const file=new URL(specifier+'.ts',context.parentURL);
  if(existsSync(file))return next(file.href,context);
 }
 return next(specifier,context);
}});
