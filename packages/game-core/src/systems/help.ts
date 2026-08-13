const subjects=['Movement','Doors','Items','Night','North','Weather','Ownership','Bread','Bridges','Money'];
const predicates=['allows related things to occur','is often relevant when it is relevant','does not usually alter unrelated facts','continues until it stops','may be useful under useful circumstances','is observable when observed','can fail to solve unrelated problems','remains subject to applicable rules','is different from some other things','should not be assumed to be helpful'];
const HELP=Array.from({length:100},(_,i)=>`${subjects[i%subjects.length]} ${predicates[Math.floor(i/subjects.length)%predicates.length]}.`);
HELP[73]='Ownership is determined at the end of a transfer.';
export function helpLine(seed:number): string { return HELP[Math.abs(seed)%HELP.length]!; }
export const HELP_COUNT=HELP.length;
