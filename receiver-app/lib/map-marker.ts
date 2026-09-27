export type MarkerPoint={id:string;coordinates:[number,number];title:string;selected?:boolean};
// All providers use the same bottom-centred anchor. The tip, not the icon's
// centre, is the coordinate; labels never change the marker's measured box.
export function mapMarker(point:MarkerPoint,select:(id:string)=>void):HTMLButtonElement{
 const button=document.createElement('button');button.type='button';button.className='relay-map-point'+(point.selected?' is-selected':'');
 button.dataset.pointId=point.id;button.title=point.title;button.setAttribute('aria-label','查看位置：'+point.title);button.setAttribute('aria-pressed',String(!!point.selected));
 button.innerHTML='<svg viewBox="0 0 40 48" aria-hidden="true"><path class="pin-body" d="M20 2C10.6 2 3 9.6 3 19c0 11.5 17 28 17 28s17-16.5 17-28C37 9.6 29.4 2 20 2Z"/><circle class="pin-ring" cx="20" cy="19" r="7"/><circle class="pin-core" cx="20" cy="19" r="2.5"/></svg>';
 if(point.selected){const tag=document.createElement('span');tag.className='map-point-tag';tag.textContent='当前查看';button.appendChild(tag);}
 button.onclick=event=>{event.stopPropagation();select(point.id);};return button;
}
