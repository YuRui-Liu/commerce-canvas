type RunOrder={id:string;createdAt:string};
export function newestGenerations<T extends RunOrder>(runs:readonly T[]):T[]{
 return [...runs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
}
export function latestApprovedGeneration<T extends RunOrder&{nodeId:string;approvedAt:string|null}>(runs:readonly T[],nodeId:string,currentId?:string):T|undefined{
 const approved=runs.filter(run=>run.nodeId===nodeId&&run.approvedAt);
 return approved.find(run=>run.id===currentId)??newestGenerations(approved)[0];
}
