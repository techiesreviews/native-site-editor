import { test, expect } from '@playwright/test';

test('open fields keep their target and meaning while own typing preserves focus and lifecycle ownership', async ({page,baseURL})=>{
 await page.goto(`${baseURL}/`);
 const proof=await page.evaluate(async()=>{
  const {createEditBar}=await import('/src/components/edit-bar.ts');
  const pane=document.createElement('div');pane.style.cssText='position:fixed;inset:0;background:white;z-index:9999';document.body.append(pane);
  const frame=document.createElement('div');frame.style.cssText='width:800px;height:600px';pane.append(frame);
  const bar=createEditBar(pane,frame),events:string[]=[];
  const rect={top:100,left:100,width:100,height:40,bottom:140,right:200};
  let writes=0;
  const model=(kind='Input',path='index.html',revision='repo:1',node=[0],source='before',identity='nativeName',open=false)=>({kind,origin:{path,revision,node,source,stamp:{holds:()=>true,changed:()=>undefined}},controls:[{kind:'address' as const,label:'Name',identity,value:'',open,onOpen:()=>events.push(`open:${kind}`),onClose:()=>events.push(`close:${kind}`),onInput:()=>{writes++;events.push(`write:${kind}`);}}]});
  bar.show(model(),rect);(bar.element.querySelector('button') as HTMLButtonElement).click();
  const input=pane.querySelector('.edit-bar__field-input') as HTMLInputElement;input.value='typing';input.setSelectionRange(2,2);
  bar.show(model('Input','index.html','repo:1',[0],'after'),rect);
  const kept=document.activeElement===input&&input.selectionStart===2&&input.value==='typing';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  bar.show(model('Link'),rect);
  input.value='stale';input.dispatchEvent(new Event('input',{bubbles:true}));
  const collisionHidden=(pane.querySelector('.edit-bar__popover') as HTMLElement).hidden;
  const collisionWrites=writes;
  const closed:string[]=[];
  for(const changed of [model('Input','other.html'),model('Input','index.html','repo:2'),model('Input','index.html','repo:1',[1]),model('Input','index.html','repo:1',[0],'before','ariaLabel')]){
   bar.show(model(),rect);(bar.element.querySelector('button') as HTMLButtonElement).click();
   bar.show(changed,rect);closed.push(String((pane.querySelector('.edit-bar__popover') as HTMLElement).hidden));
  }
  bar.show(model(),rect);(bar.element.querySelector('button') as HTMLButtonElement).click();
  const at=events.length;bar.show(model('Link','index.html','repo:1',[1],'after','address',true),rect);
  const order=events.slice(at);
  bar.destroy();pane.remove();
  return {kept,collisionHidden,collisionWrites,closed,order};
 });
 expect(proof).toEqual({kept:true,collisionHidden:true,collisionWrites:1,closed:['true','true','true','true'],order:['close:Input','open:Link']});
});
