export function fitScale(images:{width:number;height:number}[],space:{width:number;height:number},sideBySide:boolean):number{
 return Math.max(.001,Math.min(1,(space.width/(sideBySide?images.length:1))/Math.max(...images.map(i=>i.width)),space.height/Math.max(...images.map(i=>i.height))));
}
