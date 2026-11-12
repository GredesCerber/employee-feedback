import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const e2eRequire = createRequire(join(root, 'tests/e2e/package.json'));
const toolsRequire = createRequire(join(root, '.hk/qa-tools/package.json'));
const { chromium } = e2eRequire('@playwright/test');
const sourceSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
import fs from 'node:fs';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:5182';
const axe=toolsRequire.resolve('axe-core/axe.min.js');
const outfile=fileURLToPath(new URL('evidence/automated-latest.json', import.meta.url));
const configs=[{width:360,locale:'ru',theme:'light'},{width:768,locale:'ru',theme:'light'},{width:1280,locale:'ru',theme:'light'},{width:360,locale:'en',theme:'dark'},{width:1280,locale:'en',theme:'light'},{width:360,locale:'kk',theme:'light'},{width:1280,locale:'kk',theme:'dark'}];
const targets=[['submit','employee','/submit'],['my','employee','/my'],['employee-detail','employee','DETAIL'],['queue','manager','/queue'],['manager-detail','manager','DETAIL'],['summary','admin','/summary'],['dashboard','admin','/dashboard'],['about','employee','/about']];
const results=[];const browser=await chromium.launch({headless:true});
for (const config of configs) {
 const context=await browser.newContext({viewport:{width:config.width,height:900},reducedMotion:'reduce'});
 await context.addInitScript(({locale,theme})=>{localStorage.setItem('employee-feedback.locale',locale);localStorage.setItem('theme',theme)},config);
 const page=await context.newPage();
 for(const [name,role,path] of targets){
  const item={...config,name,role,path};
  try {
   await page.goto(base+'/my',{waitUntil:'domcontentloaded'});
   if(role!=='employee') await page.locator('header select').first().selectOption(role);
   await page.waitForTimeout(300);
   let destination=path;
   if(path==='DETAIL'){
    const list=role==='employee'?'/my':'/queue';
    await page.evaluate(p=>{history.pushState({},'',p);dispatchEvent(new PopStateEvent('popstate'))},list);
    await page.locator(`a[href^="${list}/"]`).first().waitFor({timeout:10000});
    destination=await page.locator(`a[href^="${list}/"]`).first().getAttribute('href');
   }
   await page.evaluate(p=>{history.pushState({},'',p);dispatchEvent(new PopStateEvent('popstate'))},destination);
   await page.waitForTimeout(1000);
   await page.waitForFunction(()=>!document.querySelector('[role="status"]')?.textContent?.includes('Загрузка'),null,{timeout:6000}).catch(()=>{});
   await page.addScriptTag({path:axe});
   const axeResult=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
   const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>document.documentElement.clientWidth+1 && r.width>0 && getComputedStyle(e).position!=='fixed'}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className?.baseVal??e.className,text:e.textContent?.trim().slice(0,70),right:Math.round(e.getBoundingClientRect().right)}))}));
   Object.assign(item,{url:page.url(),heading:await page.locator('main h1').first().textContent().catch(()=>null),violations:axeResult.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))})),incomplete:axeResult.incomplete.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),layout});
  }catch(e){item.error=String(e)}
  results.push(item);console.log(JSON.stringify({name,config,error:item.error,violations:item.violations?.length,overflow:item.layout?.scrollWidth-item.layout?.viewport}));
 }
 await context.close();
}
await browser.close();fs.writeFileSync(outfile,JSON.stringify({url:base,sha:sourceSha,axe:'4.14.0',generatedAt:new Date().toISOString(),configs,results},null,2));


