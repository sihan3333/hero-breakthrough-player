import {CATALOG,TASKS} from './training-content.mjs';
import {STORAGE_KEY,isReady,createSession,submitAnswer,advanceSession,visibleFeedback,scoreSummary,answerComparison,saveTask,saveFieldwork,addRetry,saveDraft,validateSession} from './training-core.mjs';
const $=id=>document.getElementById(id),screen=$('screen');
let records=[],current=null,protectedRaw=null,retryId=null,retryAnswer=null,toastTimer;
const phaseNames={baseline:'先试一试','baseline-summary':'先试反馈',practice:'边学边练',feedback:'练习反馈',transfer:'新情境',summary:'单元回顾',fieldwork:'等待实战反馈',complete:'已有实战反馈'};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function button(text,cls,action){const b=el('button',cls,text);b.type='button';b.addEventListener('click',()=>{try{action();}catch(e){tell(e.message);}});return b;}
function row(...children){const n=el('div','actions');n.append(...children);return n;}
function card(title,tag){const n=el('section','card');if(tag)n.append(el('p','section-tag',tag));if(title)n.append(el('h2','',title));return n;}
function tell(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,7000);}
function warn(text){$('storage-warning').textContent=text;$('storage-warning').hidden=false;$('save-status').textContent='本次记录请导出备份';}
try{
  const raw=localStorage.getItem(STORAGE_KEY);
  if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed.records)||parsed.records.length>30)throw new Error('记录格式不支持');records=parsed.records;current=records.find(s=>s?.id===parsed.activeId&&validateSession(s,CATALOG))||null;}
}catch{
  try{protectedRaw=localStorage.getItem(STORAGE_KEY);}catch{}
  warn('旧训练记录无法恢复，原数据不会被覆盖。仍可体验并导出本次内容，或在记录面板中导出旧数据。');
}
function persist(){
  if(current)records=[current,...records.filter(s=>s?.id!==current.id)].slice(0,30);
  $('history-count').textContent=records.length;
  if(protectedRaw!==null)return;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,activeId:current?.id||null,records}));$('save-status').textContent='已保存至当前浏览器 · 不会自动上传';}
  catch{warn('浏览器存储不可用或已满。内容仍在本次页面中，请导出备份后再关闭。');}
}
function revealWorkspace(){$('page-title').focus({preventScroll:true});$('workspace').scrollIntoView({block:'start',behavior:'instant'});}
function update(s){current=s;persist();render();revealWorkspace();}
function download(value,name){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportSession(s=current){if(!s)return;download({product:'英雄突破 · 情境训练',exportedAt:new Date().toISOString(),contentKind:s.mode==='demo'?'原创情境演示，未经玩家审核':'经审核内容',score:validateSession(s,CATALOG)?scoreSummary(s,CATALOG):null,record:s},`英雄突破-训练记录-${new Date().toISOString().slice(0,10)}.json`);tell('已导出。记录可能包含你的文字描述，请自行决定是否分享。');}
function setStage(stage){for(const li of $('training-steps').children){const active=li.dataset.stage===stage;li.classList.toggle('active',active);if(active)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');}}
function heading(title,stage){$('page-title').textContent=title;setStage(stage);}
function begin(mode='demo'){retryId=null;retryAnswer=null;update(createSession(mode,CATALOG));$('page-title').focus({preventScroll:true});}
function showLanding(){
  heading('交手前，先把局面看清楚。','baseline');
  const hero=el('section','training-hero');hero.append(el('p','section-tag','ONE SKILL / 一个判断能力'),el('h2','','先找到关键信息，\n再说出行动的理由。'),el('p','','先留下自己的判断，再比较参考思路，最后换新情境试一次。完成后，选择一件事带进下一局。'));
  const meta=el('div','unit-meta');meta.append(el('span','','8 个原创情境'),el('span','','不计时'),el('span','','当前不做正式评分'));hero.append(meta,row(button('开始原创情境练习  →','primary',()=>begin())));screen.append(hero);
  const path=el('div','lesson-path');for(const[title,sub]of [['先试一试','2 题 · 先留下自己的想法'],['边学边练','4 题 · 对照参考思路'],['换新情境','2 题 · 暂不提前提示'],['带进实战','1 项行动 · 练完再反馈']]){const n=el('div');n.append(el('strong','',title),el('small','',sub));path.append(n);}screen.append(path);
  const n=card('这次练习，先练什么？');n.append(el('p','muted','识别同一片段中已经知道和仍然未知的信息，并据此说明行动理由。一次情境只调查有限的问题，不给你贴能力标签。'),el('div','source-note','内容来源：产品原型原创文本，不是真实对局录像。参考思路尚未经公孙离玩家审核；练习完成次数不代表水平提升。'));
  const locked=el('div','locked-unit');locked.append(el('h3','','真实回放训练 · 材料准备中'),el('p','muted','正式训练需要获得公开许可的真实片段，以及对事实、合理选择和适用条件的玩家审核。准备好之前，不开放正式评分。'));
  if(isReady(CATALOG))locked.append(row(button('开始经审核的正式训练','secondary',()=>begin('verified'))));
  const details=el('details');details.append(el('summary','','准备一个真实片段，需要什么？'),el('p','source-details','选择一个能看清交手前局面的片段，标记决策时间点。记录当时可见的信息，以及玩家原本打算做什么。公开使用前需确认许可并去除账号、聊天等识别信息；尚未审核的片段不进入评分题。'));locked.append(details);n.append(locked);screen.append(n);
  if(records.length)screen.append(row(button('查看以前的训练记录','text-button',showHistory)));
}
function progress(){const n=el('div','training-progress'),copy=el('div','progress-copy');copy.append(el('span','',phaseNames[current.phase]),el('span','',`已保存 ${current.answers.length} / 8 个首次判断`));const track=el('div','progress-track'),fill=el('div','progress-fill');fill.style.width=`${current.answers.length/8*100}%`;track.append(fill);n.append(copy,track);return n;}
function scenarioBoard(c){
  const n=card();const h=el('div','scenario-header');h.append(el('h2','',c.title),el('span','scene-pill','原创文本情境'));n.append(h,el('p','scenario-scene',c.scene));
  const board=el('div','fact-board');for(const[label,value]of c.visibleFacts){const tile=el('div','fact-tile');tile.append(el('span','',label),el('strong','',value));board.append(tile);}n.append(board);return n;
}
function answerForm(c,{retry=false}={}){
  const form=el('form','card');form.id='training-answer';form.append(el('p','section-tag',retry?'重复练习 / 不覆盖首次作答':'先留下自己的判断'));
  const draft=!retry&&current.draft?.caseId===c.id?current.draft:null;
  const clues=el('fieldset','answer-section'),legend=el('legend','','你认为哪些信息与这次判断有关？');legend.append(el('small','','可多选'));clues.append(legend);
  for(const option of c.clueOptions){const label=el('label','answer-option'),input=el('input');input.type='checkbox';input.name='clue';input.value=option.id;input.checked=draft?.clueIds?.includes(option.id)||false;label.append(input,el('span','',option.text));clues.append(label);}form.append(clues);
  const actions=el('fieldset','answer-section');actions.append(el('legend','','现在，你会怎样继续判断？'));
  for(const option of c.actionOptions){const label=el('label','answer-option'),input=el('input');input.type='radio';input.name='action';input.value=option.id;input.required=true;input.checked=draft?.actionId===option.id;label.append(input,el('span','',option.text));actions.append(label);}form.append(actions);
  const why=el('label','reason-label','可选：用一句话说说你的理由');why.htmlFor='training-reason';const reason=el('textarea','training-reason');reason.id='training-reason';reason.maxLength=600;reason.value=draft?.reason||'';reason.placeholder='你注意到了什么？哪些条件让你作出这个选择？';form.append(why,reason);
  const read=()=>({clueIds:[...form.querySelectorAll('input[name=clue]:checked')].map(i=>i.value),actionId:form.elements.action.value,reason:reason.value});
  if(!retry)form.addEventListener('input',()=>{current=saveDraft(current,read(),CATALOG);persist();});
  const error=el('p','inline-error');error.setAttribute('role','alert');const submit=el('button','primary',retry?'保存这次重复练习  →':'提交这次判断  →');submit.type='submit';form.append(error,row(submit));
  form.addEventListener('submit',event=>{event.preventDefault();try{const input=read();if(retry){const next=addRetry(current,c.id,input,CATALOG);retryAnswer=next.retries.at(-1);update(next);}else update(submitAnswer(current,input,CATALOG));$('page-title').focus({preventScroll:true});}catch(e){error.textContent=e.message;}});
  if(!retry)form.append(el('p','training-ack',c.role==='practice'?'提交后可以比较参考思路。':'本组两题都提交后，再一起查看参考思路。'));
  return form;
}
function showQuestion(){const c=CATALOG.cases[current.index],stage=c.role;heading(stage==='baseline'?'先留下你的判断。':stage==='practice'?'把注意到的信息，说清楚。':'换个情境，再想一次。',stage);screen.append(progress(),scenarioBoard(c),answerForm(c));}
function reference(c,a){
  const n=card(c.title,current.mode==='demo'?'参考思路草案 · 尚未玩家审核':'经审核的参考思路');
  const comparison=answerComparison(current,c,a,CATALOG),own=el('div','answer-copy');own.append(el('strong','','你这次选择的行动'),el('p','',comparison.selectedAction?.text||'未记录'));if(a.reason)own.append(el('p','',`你的理由：${a.reason}`));n.append(own);
  const columns=el('div','comparison-grid'),chosen=el('div'),referenceClues=el('div');chosen.append(el('h3','','你关注的信息'));referenceClues.append(el('h3','','参考关注点'));
  for(const[items,container]of [[comparison.selectedClues,chosen],[comparison.referenceClues,referenceClues]]){const list=el('ul','reference-list');for(const o of items)list.append(el('li','',o.text));container.append(list);}columns.append(chosen,referenceClues);n.append(columns);
  const explanation=el('div','reference-block');explanation.append(el('h3','','为什么要核对这些信息'),el('p','reference-rationale',c.rationale));if(c.feedbackByOption[a.actionId])explanation.append(el('p','source-note',c.feedbackByOption[a.actionId]));
  const alternatives=el('details');alternatives.append(el('summary','','参考思路包含哪些有条件的选择？'));for(const o of comparison.referenceActions)alternatives.append(el('p','source-details',o.text));explanation.append(alternatives);n.append(explanation);
  if(comparison.official)n.append(el('p','source-details',`线索识别：${comparison.grade.clues?'符合审核依据':'存在遗漏或误选'}；行动依据：${comparison.grade.action?'符合审核依据':'需要再核对条件'}。`));
  n.append(el('p','source-details',`来源：${c.source.title} · 内容版本 ${c.contentVersion}${current.mode==='demo'?' · 非真实回放，不作为正式评分依据':''}`));return n;
}
function showBaselineSummary(){heading('先比较一下，你关注了什么。','baseline');screen.append(progress(),el('p','intro','两题都已保存。现在可以比较思路；接下来四题会在每次作答后提供参考解释。'));
  for(const c of visibleFeedback(current,CATALOG).filter(c=>c.role==='baseline'))screen.append(reference(c,current.answers.find(a=>a.caseId===c.id)));
  screen.append(row(button('进入边学边练  →','primary',()=>update(advanceSession(current)))));
}
function showPracticeFeedback(){const a=current.answers.at(-1),c=CATALOG.cases.find(c=>c.id===a.caseId);heading('对照信息，再看这次选择。','practice');screen.append(progress(),reference(c,a),row(button(current.index===6?'换新情境，再试两题  →':'继续下一个练习  →','primary',()=>update(advanceSession(current)))));}
function showSummary(){
  heading('把一个观察点，带进下一局。','fieldwork');
  const hero=el('section','training-hero');hero.append(el('p','section-tag','单元回顾 / 保留首次判断'),el('h2','','你已完成这一轮情境练习。'),el('p','','接下来选择一项实战任务。看看这些思路在你的真实片段中是否适用，练完再带着具体观察回来。'));screen.append(hero);
  const metrics=el('div','summary-metrics');for(const[value,label]of [[current.answers.length,'首次判断已保存'],[4,'边学边练情境'],[current.retries.length,'重复练习另存']]){const n=el('div');n.append(el('strong','',value),el('span','',label));metrics.append(n);}screen.append(metrics);
  const scores=scoreSummary(current,CATALOG);if(scores.baseline&&scores.transfer){const n=card('本次题目中的表现');n.append(el('p','muted',`前测：线索 ${scores.baseline.clues}/2，行动依据 ${scores.baseline.actions}/2；新情境：线索 ${scores.transfer.clues}/2，行动依据 ${scores.transfer.actions}/2。题量较少，不表示整体能力或训练效果。`));screen.append(n);}else screen.append(el('p','source-note','本轮使用未审核的原创情境，不显示正确率或能力等级。完成练习不等于已经能在实战做到。'));
  const newCases=el('details','card');newCases.append(el('summary','','查看两个新情境的判断与参考思路'));for(const c of visibleFeedback(current,CATALOG).filter(c=>c.role==='transfer'))newCases.append(reference(c,current.answers.find(a=>a.caseId===c.id)));screen.append(newCases);
  const form=el('form','card');form.append(el('p','section-tag','由你确认适用性'),el('h2','','下一局，你想只关注哪一件事？'),el('p','muted','根据自己的真实困扰选择。这不是系统对你能力的诊断；不适用时可以换一个任务。'));
  for(const[key,task]of Object.entries(TASKS)){const label=el('label','answer-option task-option'),input=el('input');input.type='radio';input.name='task';input.value=key;input.required=true;const text=el('span');text.append(el('strong','',task.title),el('small','',task.trigger));label.append(input,text);form.append(label);}
  const submit=el('button','primary','保存这项实战任务  →');submit.type='submit';form.append(row(submit));form.addEventListener('submit',event=>{event.preventDefault();try{update(saveTask(current,form.elements.task.value));tell('任务已保存。练完后从训练记录回来。');}catch(e){tell(e.message);}});screen.append(form);
  retrySection();screen.append(row(button('导出这一轮记录','text-button',()=>exportSession()),button('开启新一轮','text-button',()=>begin())));
}
function retrySection(){const d=el('details','card');d.append(el('summary','','想重做一道练习？首次作答会保留'));const select=el('select','repeat-select');select.setAttribute('aria-label','选择要重做的练习');for(const c of CATALOG.cases.filter(c=>c.role==='practice')){const o=el('option','',c.title);o.value=c.id;select.append(o);}d.append(select,button('重做所选练习','secondary',()=>{retryId=select.value;retryAnswer=null;render();revealWorkspace();}));screen.append(d);}
function showRetry(){const c=CATALOG.cases.find(c=>c.id===retryId);heading('重复练习，保留每一次尝试。','practice');screen.append(el('p','retry-label','重复练习 · 不加入首次前后对照'));if(retryAnswer){screen.append(reference(c,retryAnswer),row(button('返回这轮记录','primary',()=>{retryId=null;retryAnswer=null;render();revealWorkspace();})));}else screen.append(scenarioBoard(c),answerForm(c,{retry:true}),row(button('暂不重做，返回记录','text-button',()=>{retryId=null;render();revealWorkspace();})));}
function taskCard(){const t=current.task,n=card(t.title,'我的实战任务 · 根据自己的选择');for(const[label,value]of [['什么时候观察',t.trigger],['只做这一件事',t.action],['回来时带什么',t.measure]]){const block=el('div','task-detail');block.append(el('strong','',label),el('p','',value));n.append(block);}n.append(el('p','task-exception',`不适用或需谨慎的条件：${t.exception}`));return n;}
const outcomes={no_opportunity:'没有遇到适用场景',not_done:'遇到了，但没有执行',done:'已经尝试执行'};
const observations={matched:'实际情况与原想法基本相符',different:'实际情况与原想法不同',unsure:'还无法判断'};
function choice(name,value,text,required=true){const label=el('label','choice'),input=el('input');input.type='radio';input.name=name;input.value=value;input.required=required;label.append(input,el('span','',text));return {label,input};}
function fieldworkForm(){
  const form=el('form','card');form.id='fieldwork-form';form.append(el('h2','','练完后，记录实际发生的事。'),el('p','muted','没遇到场景、没能执行和已经执行，都分别记录。以下内容是你的自述，未经独立核对。'));
  for(const[v,text]of Object.entries(outcomes))form.append(choice('outcome',v,text).label);
  const observed=el('div');observed.hidden=true;observed.append(el('hr','divider'),el('h3','','尝试之后，实际情况如何？'));const radios=[];for(const[v,text]of Object.entries(observations)){const r=choice('observation',v,text,false);r.input.disabled=true;radios.push(r.input);observed.append(r.label);}form.append(observed);
  form.addEventListener('change',()=>{const done=form.elements.outcome.value==='done';observed.hidden=!done;radios.forEach(i=>{i.required=done;i.disabled=!done;});});
  const timeLabel=el('label','reason-label','可选：回放时间点'),time=el('input','training-timepoint');timeLabel.htmlFor='field-time';time.id='field-time';time.name='timepoint';time.maxLength=80;time.placeholder='例如：第 2 局 01:35';
  const label=el('label','reason-label','可选：写一个具体片段'),note=el('textarea','training-reason');label.htmlFor='field-note';note.id='field-note';note.name='note';note.maxLength=1200;note.placeholder='当时看见了什么？原本想做什么？实际做了什么？';
  if(current.fieldwork){time.value=current.fieldwork.timepoint||'';note.value=current.fieldwork.note;}
  form.append(timeLabel,time,label,note);const submit=el('button','primary','保存实战反馈  →');submit.type='submit';form.append(row(submit));form.addEventListener('submit',event=>{event.preventDefault();try{update(saveFieldwork(current,{outcome:form.elements.outcome.value,observation:form.elements.observation.value,timepoint:time.value,note:note.value}));}catch(e){tell(e.message);}});return form;
}
function showFieldwork(){heading('任务已保存，练完再回来。','fieldwork');screen.append(el('p','intro','可以先去玩一局。回到同一个浏览器，打开“训练记录”就能找到这项任务。'),taskCard(),row(button('我已练习 / 想记录情况','primary',()=>{if(!$('fieldwork-form'))screen.append(fieldworkForm());$('fieldwork-form').scrollIntoView({behavior:'smooth',block:'start'});}),button('导出任务和练习记录','text-button',()=>exportSession())));retrySection();}
function showComplete(){heading('这条观察，留给下一次判断。','fieldwork');const f=current.fieldwork,n=card('实战反馈已保存','玩家自述 · 未经独立核对');n.append(el('p','question-text',outcomes[f.outcome]));if(f.observation)n.append(el('p','muted',observations[f.observation]));if(f.timepoint)n.append(el('p','source-details',`时间点：${f.timepoint}`));if(f.note)n.append(el('p','observation-box',f.note));n.append(el('hr','divider'),el('p','feedback-response',f.outcome==='no_opportunity'?'这次还没有检验到任务。可以等类似场景出现，再记录一次。':f.outcome==='not_done'?'下一次先调查卡在哪里：没注意到信号、条件不合适，还是任务不够具体？':'这是一条新的观察，仍需要具体片段核对；单次执行或输赢不能证明训练有效。'),row(button('导出训练和实战反馈','primary',()=>exportSession()),button('开始新一轮练习','secondary',()=>begin())));screen.append(n);const details=el('details','card');details.append(el('summary','','查看当时的实战任务'),taskCard());screen.append(details,row(button('补充或修改实战反馈','text-button',()=>{if(!$('fieldwork-form'))screen.append(fieldworkForm());$('fieldwork-form').scrollIntoView({behavior:'smooth',block:'start'});})));retrySection();}
function render(){screen.replaceChildren();$('training-mode').textContent=current?.mode==='verified'?'经审核内容训练':'原创情境演示';$('content-notice').hidden=current?.mode==='verified';if(!current){showLanding();return;}if(retryId){showRetry();return;}if(['baseline','practice','transfer'].includes(current.phase))showQuestion();else if(current.phase==='baseline-summary')showBaselineSummary();else if(current.phase==='feedback')showPracticeFeedback();else if(current.phase==='summary')showSummary();else if(current.phase==='fieldwork')showFieldwork();else showComplete();if(!['summary','complete'].includes(current.phase))screen.append(row(button('导出当前训练记录','text-button',()=>exportSession()),button('新开一轮，保留这次记录','text-button',()=>begin())));}
function showHistory(){const list=$('history-list');list.replaceChildren();if(protectedRaw!==null){const n=el('div','version-archive','原始旧记录未覆盖，暂时不能恢复。');n.append(row(button('导出旧训练原始数据','secondary',()=>download(protectedRaw,'英雄突破-旧训练原始记录.json'))));list.append(n);}if(!records.length)list.append(el('p','lesson-empty','还没有训练记录。开始后会自动保存。'));
  for(const s of records){if(!validateSession(s,CATALOG)){const archive=el('div','version-archive','旧版本或格式不支持的记录：保留原内容，仅供导出。');archive.append(row(button('导出这条原始记录','text-button',()=>exportSession(s))));list.append(archive);continue;}const b=button('','history-item',()=>{current=s;retryId=null;retryAnswer=null;persist();render();$('history-panel').hidden=true;});b.append(el('strong','',s.task?.title||CATALOG.title),el('span','',`${new Date(s.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Singapore',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${phaseNames[s.phase]} · ${s.mode==='demo'?'原创演示':'已审核'}`));list.append(b);}$('history-panel').hidden=false;}
$('training-history').addEventListener('click',showHistory);$('close-history').addEventListener('click',()=>$('history-panel').hidden=true);
$('clear-training').addEventListener('click',()=>{if(!confirm('仅清除当前浏览器的训练记录？此操作无法撤销。原有复盘记录不会被清除，请先导出需要保留的训练内容。'))return;try{localStorage.removeItem(STORAGE_KEY);records=[];current=null;protectedRaw=null;retryId=null;retryAnswer=null;$('history-count').textContent='0';$('history-panel').hidden=true;$('storage-warning').hidden=true;$('save-status').textContent='记录仅保存在当前浏览器';render();tell('训练记录已清除，原有复盘记录未更改。');}catch{tell('浏览器未允许清除，请检查存储设置。');}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('history-panel').hidden=true;});$('history-count').textContent=records.length;render();
