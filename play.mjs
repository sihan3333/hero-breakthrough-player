import { FACT_FIELDS, QUESTION_FIELDS, makeSession, reviewState, answerFields, validateExtraction, confirmExtraction, addDescription, finishReview, acceptTask, saveFeedback, isValidSession } from './review-core.mjs';

const $ = id => document.getElementById(id);
const screen = $('screen');
const STORAGE = 'hero-breakthrough:reviews:v1';
let records = [], current = null, liveAvailable = false, pending = [], busy = false, noticeTimer;
function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
function button(text, cls, action) { const b=el('button',cls,text); b.type='button'; b.addEventListener('click',()=>{try{action();}catch(error){tell(error.message);}}); return b; }
function tell(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('toast').hidden=true,6500); }
function storageWarning(text) { $('storage-warning').textContent=text;$('storage-warning').hidden=false;$('save-status').textContent='当前记录尚未写入浏览器，请导出备份'; }
try {
  const data=JSON.parse(localStorage.getItem(STORAGE)||'{"records":[]}');
  if(!Array.isArray(data.records)) throw new Error();
  records=data.records.filter(isValidSession).slice(0,30);
  if(records.length!==data.records.length) storageWarning('部分旧记录格式异常，已跳过；当前有效记录仍可使用。');
  current=records.find(s=>s.id===data.currentId)||null;
} catch { storageWarning('暂时无法恢复浏览器记录。仍可复盘，请使用“导出记录”保留本次内容。'); }
function persist() {
  if(current) records=[current,...records.filter(s=>s.id!==current.id)].slice(0,30);
  try { localStorage.setItem(STORAGE,JSON.stringify({records,currentId:current?.id||null}));$('save-status').textContent='已保存至当前浏览器 · 不会自动上传'; }
  catch { storageWarning('浏览器存储不可用或已满。请导出本次记录；关闭页面可能丢失未保存内容。'); }
  $('history-count').textContent=records.length;
}
function update(next) {current=next;persist();render();}
function startNew(prefill='') {current=null;pending=[];persist();renderStart(prefill);setStages('review');$('page-title').textContent='把“打不过”，说具体一点。';}
function setStages(stage) {for(const li of $('steps').children)li.classList.toggle('active',li.dataset.stage===stage);}
function intro(text) {return el('p','intro',text);}
function card(title,tag) {const n=el('section','card');if(tag)n.append(el('p','section-tag',tag));if(title)n.append(el('h2','',title));return n;}
function row(...children) {const n=el('div','actions');n.append(...children);return n;}
function exportCurrent() {
  if(!current)return;
  const blob=new Blob([JSON.stringify({product:'英雄突破',exportedAt:new Date().toISOString(),record:current},null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob), a=el('a');a.href=url;a.download=`英雄突破-我的复盘-${current.createdAt.slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  tell('记录已导出。文件包含你的自述与反馈，请自行决定是否分享。');
}
function textArea(placeholder,value='') {const t=el('textarea');t.maxLength=1200;t.required=true;t.placeholder=placeholder;t.value=value;return t;}
function consentBox() {
  const label=el('label','consent'), checkbox=el('input');checkbox.type='checkbox';checkbox.disabled=!liveAvailable;
  label.dataset.modeConsent='true';
  label.append(checkbox,el('span','',liveAvailable?'使用 AI 辅助提取：同意将本次复盘对话发送至 DeepSeek。提取后仍由我确认。':'当前使用引导复盘：根据你逐项确认的信息判断，不调用 AI。'));
  if(!liveAvailable)checkbox.hidden=true;
  return {label,checkbox};
}
function renderStart(prefill='') {
  setStages('review');
  screen.replaceChildren();
  screen.append(intro('不用先给自己下结论。回想一次前期对线，我们一起分清当时发生了什么，再决定下一局只观察哪一件事。'));
  const form=el('form','card');form.append(el('p','section-tag','01 / 从一个片段开始'),el('h2','','最近一次，发生了什么？'));
  const label=el('label','field-label','描述同一局、同一个片段');label.htmlFor='episode';form.append(label);
  const input=textArea('例如：刚才对线时，我想等对面交技能再靠近兵线，但他一上来我就按乱了。那时我方辅助在河道……',prefill);input.id='episode';form.append(input);
  const foot=el('div','textarea-footer'), count=el('span','','0 / 1200');foot.append(el('span','','不用写账号或昵称；记不清也可以直接说。'),count);form.append(foot);input.addEventListener('input',()=>count.textContent=`${input.value.length} / 1200`);count.textContent=`${input.value.length} / 1200`;
  const consent=consentBox();form.append(consent.label);
  const submit=el('button','primary','开始我的复盘  →');submit.type='submit';form.append(row(submit,button('我暂时记不清具体片段','text-button',()=>{update(finishReview(answerFields(makeSession('暂时记不清具体片段，希望知道下一次要记录什么。'),{recall:'unclear'})));})));
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;try{current=makeSession(input.value);persist();if(consent.checkbox.checked && liveAvailable)await extractAI();else render();}catch(error){tell(error.message);}});
  screen.append(form);
  const hints=el('div','hint-grid');for(const [i,title,text] of [['01','一次只看一个片段','经济、人数和动作放在同一局面里。'],['02','不确定，也能继续','信息不足时，先带走一个观察任务。'],['03','下一局练完再回来','记录有没有执行，而非只看输赢。']]){const n=el('div','hint-item');n.append(el('span','',i),el('strong','',title),el('p','',text));hints.append(n);}screen.append(hints);
  const privacy=el('p','muted','复盘仅依据你的描述和确认信息，不会读取游戏账号或自动分析录像。记录保存在当前浏览器，最多保留最近 30 次；可随时导出或清除。');privacy.style.marginTop='24px';screen.append(privacy);
}
function transcript() {
  const details=el('details');details.append(el('summary','','查看本次描述与回答'));
  const list=el('div','transcript');current.messages.forEach((m,i)=>{const n=el('div');n.append(el('small','',i===0?'开始时的描述':`补充 ${i}`),el('p','',m.content));list.append(n);});details.append(list);return details;
}
function selectField(key,value) {
  const box=el('div'), label=el('label','field-title',FACT_FIELDS[key].title), select=el('select');select.name=key;select.id=`fact-${key}`;label.htmlFor=select.id;select.required=true;
  const blank=el('option','','请选择');blank.value='';select.append(blank);
  for(const [v,text] of [...FACT_FIELDS[key].options,['unknown','不确定 / 记不清']]){const opt=el('option','',text);opt.value=v;select.append(opt);}
  select.value=value||'';box.append(label,select);return {box,select};
}
function factSummary(editable=true) {
  const facts=reviewState(current).evidence;
  const wrap=card('已经确认的信息','可核对 · 可修正');
  wrap.append(el('p','muted','这些信息来自你的回答。若有误，请在保存行动前修正；旧判断会随之重新计算。'));
  if(!facts.length)wrap.append(el('p','muted','目前还没有足够的确认信息。仅凭“打不过”，无法判断个人能力。'));
  for(const fact of facts){
    const line=el('div','fact-line'), text=el('div');text.append(el('span','',fact.label),el('p','evidence-quote',`你的描述：“${fact.quote}”`));line.append(text);
    if(editable)line.append(button('修正','',()=>{
      if(line.querySelector('select'))return;
      const form=el('form'), field=selectField(fact.key,fact.value);form.append(field.box);const save=el('button','secondary','保存修正');save.type='submit';form.append(save);text.replaceChildren(form);
      form.addEventListener('submit',event=>{event.preventDefault();try{update(answerFields(current,{[fact.key]:field.select.value}));tell('已替换旧信息，并重新检查判断。');}catch(error){tell(error.message);}});
    }));wrap.append(line);
  }
  wrap.append(el('hr','divider'),transcript());return wrap;
}
function renderReview(state) {
  $('page-title').textContent='先把局面和动作分开看。';setStages('review');
  screen.append(intro('每次只补充一组关键线索。请选择符合这个片段的情况；无法确认的信息可以保留为不确定。'));
  const form=el('form','card'), heading=el('div','question-header');heading.append(el('p','section-tag','正在理清这一局'),el('span','question-count',`已补充 ${Math.max(0,current.messages.length-1)} 次`));form.append(heading);
  form.append(el('p','question-text',state.question.text));
  const keys=QUESTION_FIELDS[state.question.id];
  if(!keys){form.append(el('p','muted','前后描述需要核对。你可以在下方修正事实，或先保存观察任务。'));}
  const fields=el('div','fields'), selects=[];
  for(const key of keys||[]){const previous=current.observations.find(o=>o.key===key)?.value;const f=selectField(key,previous);fields.append(f.box);selects.push(f.select);}
  form.append(fields);
  if(keys){const submit=el('button','primary','确认这些信息  →');submit.type='submit';form.append(row(submit));form.addEventListener('submit',event=>{event.preventDefault();try{update(answerFields(current,Object.fromEntries(selects.map(s=>[s.name,s.value]))));}catch(error){tell(error.message);}});}
  form.append(button('先不继续回答，带走观察任务','text-button',()=>update(finishReview(current))));screen.append(form,factSummary());
  renderSupplement();
}
function renderSupplement(){
  const d=el('details','card');d.dataset.supplement='true';d.append(el('summary','','还有一个细节想补充？'));
  const form=el('form'), t=textArea('补充这个片段里你确定的事实，或说明你想纠正什么。');t.style.marginTop='16px';form.append(t);
  const consent=consentBox();form.append(consent.label);const b=el('button','secondary','保存补充');b.type='submit';form.append(row(b));
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;try{current=addDescription(current,t.value);persist();if(consent.checkbox.checked&&liveAvailable)await extractAI();else{render();tell('补充已保存。引导模式不会自动理解文字，请在问题或“修正”中确认相关信息。');}}catch(error){tell(error.message);}});d.append(form);screen.append(d);
}
function actionContent(task,accepted=false){
  const banner=el('section','result-banner');banner.append(el('p','section-tag',accepted?'我的行动卡 / 已保存':'本次优先项 / 基于自述的初步判断'),el('h2','',task.title),el('p','',task.reason));screen.append(banner);
  const n=card('下一次，只做这一件事');const action=el('div','action-block');action.append(el('h3','','你的行动'),el('p','',task.action));
  const measure=el('div','observation-box');measure.append(el('strong','','练完回来时，观察什么'),el('p','',task.measure));n.append(action,measure);return n;
}
function renderResult(state){
  $('page-title').textContent='下一步，先从这一件事开始。';setStages('result');
  const n=actionContent(state.result);n.append(row(button('保存行动，下一局试试  →','primary',()=>{update(acceptTask(current));tell('行动卡已保存在这个浏览器。练完后从“我的记录”回来。');}),button('导出这次复盘','text-button',exportCurrent)));
  n.append(el('p','muted','这是一项待验证的训练或观察方向。一次复盘不代表已确认根因，也不能保证胜率提升。'));screen.append(n,factSummary(),row(button('再补充一个细节','secondary',()=>{if(!screen.querySelector('[data-supplement]'))renderSupplement();screen.querySelector('[data-supplement]').open=true;}),button('开始另一局复盘','text-button',()=>startNew())));
}
function renderPractice(){
  $('page-title').textContent='行动已保存，练完再回来。';setStages('practice');
  screen.append(intro('可以先关闭页面。回到同一个浏览器，打开“我的记录”就能找到这张行动卡；也可以现在导出备份。'));
  const n=actionContent(current.task,true);n.append(row(button('我已练习 / 想记录情况','primary',()=>{renderFeedback();$('feedback-form').scrollIntoView({behavior:'smooth',block:'start'});}),button('导出行动卡','text-button',exportCurrent)));screen.append(n);
  screen.append(row(button('开始另一局复盘','secondary',()=>startNew())));
  const details=el('details','card');details.append(el('summary','','查看本次复盘依据'));details.append(factSummary(false));screen.append(details);
}
const outcomeText={no_opportunity:'没有遇到适用场景',not_done:'遇到了，但没有执行',done:'已经执行了这项行动'};
const observationText={matched:'实际情况与原判断基本相符',different:'实际情况与原判断不同',unsure:'仍然无法判断'};
function radioChoice(name,value,title,sub){const label=el('label','choice'),input=el('input');input.type='radio';input.name=name;input.value=value;input.required=true;const copy=el('span','',title);if(sub)copy.append(el('small','',sub));label.append(input,copy);return {label,input};}
function renderFeedback(){
  if($('feedback-form'))return;
  const form=el('form','card');form.id='feedback-form';form.append(el('p','section-tag','03 / 练完回来看看'),el('h2','','这一次，发生了什么？'),el('p','muted','没有遇到机会或没有做出来，也都是有用的信息。不用按一局输赢给自己打分。'));
  const choices=el('div','choice-list');for(const [v,title,sub] of [['no_opportunity',outcomeText.no_opportunity,'这次还没有条件检验行动。'],['not_done',outcomeText.not_done,'记录卡在了哪里，帮助调整下一步。'],['done',outcomeText.done,'再看实际情况是否符合原来的判断。']])choices.append(radioChoice('outcome',v,title,sub).label);form.append(choices);
  const observation=el('div');observation.hidden=true;observation.append(el('hr','divider'),el('h3','','执行之后，你观察到了什么？'));
  const obsInputs=[];for(const [v,title]of Object.entries(observationText)){const r=radioChoice('observation',v,title);r.input.required=false;r.input.disabled=true;obsInputs.push(r.input);observation.append(r.label);}form.append(observation);
  choices.addEventListener('change',()=>{const done=form.elements.outcome.value==='done';observation.hidden=!done;obsInputs.forEach(i=>{i.disabled=!done;i.required=done;});});
  const label=el('label','field-label','可选：写下一个具体片段或回放时间点');label.htmlFor='practice-note';label.style.marginTop='22px';const note=textArea('原本准备做什么？实际发生了什么？下次需要调整什么？');note.id='practice-note';note.name='note';note.required=false;form.append(label,note);
  const submit=el('button','primary','保存这次反馈  →');submit.type='submit';form.append(row(submit));form.addEventListener('submit',event=>{event.preventDefault();try{update(saveFeedback(current,{outcome:form.elements.outcome.value,observation:form.elements.observation.value,note:note.value}));}catch(error){tell(error.message);}});screen.append(form);
}
function renderComplete(){
  $('page-title').textContent='把这次观察，留给下一次判断。';setStages('practice');
  const n=card('这次反馈已保存','本机复盘记录');n.append(el('p','question-text',outcomeText[current.feedback.outcome]));
  if(current.feedback.observation)n.append(el('p','muted',observationText[current.feedback.observation]));
  if(current.feedback.note)n.append(el('p','observation-box',current.feedback.note));
  const responses={no_opportunity:'这次还没有检验到原行动，可以保留行动卡，等类似场景出现时再观察。',not_done:'下一次先查清没有执行的原因：是没注意到信号、动作太复杂，还是原建议不适用？',done:'这是一条新的观察，还不能证明训练有效。可以带着这个具体片段，开始下一次复盘。'};
  n.append(el('hr','divider'),el('p','feedback-response',responses[current.feedback.outcome]),row(button('带着新片段，再复盘一次  →','primary',()=>startNew(current.feedback.note?`上一次练习的观察：${current.feedback.note}\n这一次具体片段：`:'')),button('导出复盘和反馈','text-button',exportCurrent)));screen.append(n);
  const previous=el('details','card');previous.append(el('summary','','查看当时的行动和依据'));const box=el('div','action-block');box.append(el('h3','',current.task.title),el('p','',current.task.action),el('p','muted',current.task.measure));previous.append(box,transcript());screen.append(previous,row(button('修改这次反馈','secondary',()=>{current={...current,phase:'practice'};persist();render();renderFeedback();})));}
async function extractAI(){
  const sessionId=current.id;busy=true;pending=[];render();
  try{
    const response=await fetch('/.netlify/functions/coach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,messages:current.messages}),signal:AbortSignal.timeout(22000)});
    const payload=await response.json();if(!response.ok)throw new Error(payload.error||'AI 服务暂时不可用。');
    if(current?.id!==sessionId)return;
    pending=validateExtraction(current.messages,payload);
    if(!pending.length)tell('没有提取到足够可靠的信息。请继续逐项确认。');
  }catch(error){if(current?.id===sessionId)tell(`${error.name==='TimeoutError'?'AI 请求超时。':error.message} 已保留输入，可继续引导复盘。`);}
  finally{busy=false;if(current?.id===sessionId)render();}
}
function renderPending(){
  const form=el('form','card');form.append(el('p','section-tag','AI 提取 / 等你确认'),el('h2','','这些理解符合当时情况吗？'),el('p','muted','逐项勾选你确认的事实。模型可能误解语义，即使原话引用正确，也需要你核对。'));
  const inputs=[];for(const [i,fact]of pending.entries()){const label=el('label','check-row'),input=el('input');input.type='checkbox';input.value=i;const text=el('span','',fact.label);text.append(el('small','',`原话：“${fact.quote}”`));label.append(input,text);inputs.push(input);form.append(label);}
  const submit=el('button','primary','确认选中信息，继续  →');submit.type='submit';form.append(row(submit,button('都不采用，改用引导复盘','text-button',()=>{pending=[];render();})));form.addEventListener('submit',event=>{event.preventDefault();try{const next=confirmExtraction(current,inputs.filter(i=>i.checked).map(i=>pending[Number(i.value)]));pending=[];update(next);}catch(error){tell(error.message);}});screen.append(form);
}
function render(){
  screen.replaceChildren();$('mode-badge').textContent=liveAvailable?'引导复盘 · AI 可选':'引导复盘';
  if(!current){renderStart();return;}
  if(busy){screen.append(card('正在整理你描述的线索'),el('p','loading-line','输入已保存。AI 提取后，会先请你确认；如请求失败，可继续引导复盘。'));return;}
  if(pending.length){renderPending();return;}
  if(current.phase==='practice'){renderPractice();return;}
  if(current.phase==='complete'){renderComplete();return;}
  const state=reviewState(current);if(state.result)renderResult(state);else renderReview(state);
  if(!state.result)screen.append(row(button('导出当前记录','text-button',exportCurrent),button('另开一局复盘','text-button',()=>startNew())));
}
function showHistory(){
  const list=$('history-list');list.replaceChildren();
  if(!records.length)list.append(el('p','empty-history','还没有记录。完成一次描述，就会自动保存在这里。'));
  for(const s of records){const b=button('','history-item',()=>{if(busy)return;tell('已打开这次复盘。');current=s;pending=[];persist();render();$('history-panel').hidden=true;});const title=s.task?.title||s.messages[0].content.slice(0,32);b.append(el('strong','',title),el('span','',`${new Date(s.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Singapore',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${{review:'复盘中',practice:'等待练习反馈',complete:'已有反馈'}[s.phase]}`));list.append(b);}
  $('history-panel').hidden=false;
}
$('history-toggle').addEventListener('click',showHistory);$('history-close').addEventListener('click',()=>$('history-panel').hidden=true);
$('clear-history').addEventListener('click',()=>{if(busy)return;if(!confirm('清除当前浏览器中的全部复盘与反馈？此操作无法撤销，请先导出需要保留的记录。'))return;try{localStorage.removeItem(STORAGE);records=[];current=null;pending=[];$('history-count').textContent='0';$('history-panel').hidden=true;render();tell('本机记录已清除。');}catch{tell('浏览器未允许清除记录，请检查存储设置。');}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('history-panel').hidden=true;});
$('history-count').textContent=records.length;render();
if(!location.hostname.endsWith('.github.io')) fetch('/.netlify/functions/coach',{signal:AbortSignal.timeout(3500)}).then(r=>r.ok?r.json():null).then(data=>{
  liveAvailable=data?.configured===true;
  $('mode-badge').textContent=liveAvailable?'引导复盘 · AI 可选':'引导复盘';
  // Update availability in place: a slow status response must never erase text.
  for(const label of document.querySelectorAll('[data-mode-consent]')){
    const input=label.querySelector('input');input.disabled=!liveAvailable;input.hidden=!liveAvailable;
    label.querySelector('span').textContent=liveAvailable?'使用 AI 辅助提取：同意将本次复盘对话发送至 DeepSeek。提取后仍由我确认。':'当前使用引导复盘：根据你逐项确认的信息判断，不调用 AI。';
  }
}).catch(()=>{});
