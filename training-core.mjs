import {CATALOG,TASKS} from './training-content.mjs';
export const STORAGE_KEY='hero-breakthrough:training:v1';
const phases=['baseline','baseline-summary','practice','feedback','transfer','summary','fieldwork','complete'];
const now=()=>new Date().toISOString();
const copy=s=>({...s,updatedAt:now()});
function eligible(c){return c.publicPermission===true&&c.reviewStatus==='approved'&&Array.isArray(c.source?.reviewers)&&c.source.reviewers.some(r=>typeof r.alias==='string'&&r.alias.trim()&&Number.isFinite(Date.parse(r.date)))&&typeof c.source.gameVersion==='string'&&c.source.gameVersion.trim();}
export function isReady(catalog=CATALOG){return catalog.cases.length===8&&catalog.cases.every(eligible)&&catalog.cases.every((c,i)=>c.role===(i<2?'baseline':i<6?'practice':'transfer'));}
export function createSession(mode='demo',catalog=CATALOG){
  if(!['demo','verified'].includes(mode)||mode==='verified'&&!isReady(catalog))throw new Error('正式训练需要完整的审核内容，目前请体验原创情境演示。');
  return {version:1,id:crypto.randomUUID(),unitId:catalog.id,contentVersion:catalog.version,mode,phase:'baseline',index:0,answers:[],feedbackSeen:[],retries:[],task:null,fieldwork:null,draft:null,createdAt:now(),updatedAt:now()};
}
function normalizeAnswer(c,input){
  if(!input||!Array.isArray(input.clueIds)||input.clueIds.length<1||new Set(input.clueIds).size!==input.clueIds.length||input.clueIds.some(id=>!c.clueOptions.some(o=>o.id===id))||!c.actionOptions.some(o=>o.id===input.actionId)||typeof(input.reason??'')!=='string'||(input.reason||'').length>600)throw new Error('请选择至少一条线索和一项行动；理由最多 600 字。');
  return {caseId:c.id,contentVersion:c.contentVersion,clueIds:[...input.clueIds],actionId:input.actionId,reason:(input.reason||'').trim(),answeredAt:now()};
}
export function submitAnswer(s,input,catalog=CATALOG){
  if(!validateSession(s,catalog)||!['baseline','practice','transfer'].includes(s.phase))throw new Error('请先查看本轮反馈，再继续下一题。');
  const c=catalog.cases[s.index],answer=normalizeAnswer(c,input),index=s.index+1;
  const phase=c.role==='baseline'?(index===2?'baseline-summary':'baseline'):c.role==='practice'?'feedback':index===8?'summary':'transfer';
  return {...copy(s),index,phase,answers:[...s.answers,answer],draft:null};
}
export function advanceSession(s){
  if(s.phase==='baseline-summary')return {...copy(s),phase:'practice'};
  if(s.phase==='feedback')return {...copy(s),phase:s.index===6?'transfer':'practice',feedbackSeen:[...new Set([...s.feedbackSeen,s.answers.at(-1).caseId])]};
  throw new Error('当前没有可以继续的反馈步骤。');
}
export function visibleFeedback(s,catalog=CATALOG){
  return catalog.cases.filter((c,i)=>i<s.answers.length&&(c.role==='practice'||c.role==='baseline'&&s.answers.length>=2||c.role==='transfer'&&s.answers.length===8));
}
function grade(c,a){return {clues:a.clueIds.length===c.requiredClueIds.length&&c.requiredClueIds.every(id=>a.clueIds.includes(id)),action:c.acceptedActionIds.includes(a.actionId),missing:c.requiredClueIds.filter(id=>!a.clueIds.includes(id)),extra:a.clueIds.filter(id=>!c.requiredClueIds.includes(id))};}
export function scoreSummary(s,catalog=CATALOG){
  const empty={mode:s?.mode||'demo',baseline:null,transfer:null};
  if(s?.mode!=='verified'||!isReady(catalog)||!validateSession(s,catalog))return empty;
  const block=role=>{const cases=catalog.cases.filter(c=>c.role===role);if(!cases.every(c=>s.answers.some(a=>a.caseId===c.id)))return null;const grades=cases.map(c=>grade(c,s.answers.find(a=>a.caseId===c.id)));return {clues:grades.filter(g=>g.clues).length,actions:grades.filter(g=>g.action).length,total:cases.length};};
  return {...empty,baseline:block('baseline'),transfer:block('transfer')};
}
export function answerComparison(s,c,a,catalog=CATALOG){
  const checked=s.mode==='verified'&&isReady(catalog)&&validateSession(s,catalog);
  return {official:checked,grade:checked?grade(c,a):null,selectedClues:c.clueOptions.filter(o=>a.clueIds.includes(o.id)),selectedAction:c.actionOptions.find(o=>o.id===a.actionId),referenceClues:c.clueOptions.filter(o=>c.requiredClueIds.includes(o.id)),referenceActions:c.actionOptions.filter(o=>c.acceptedActionIds.includes(o.id))};
}
export function saveTask(s,key){if(s.phase!=='summary'||!TASKS[key])throw new Error('请先完成情境练习，再选择实战任务。');return {...copy(s),phase:'fieldwork',task:{key,...TASKS[key],acceptedAt:now()}};}
export function saveFieldwork(s,input){
  if(!s.task||!['fieldwork','complete'].includes(s.phase)||!['no_opportunity','not_done','done'].includes(input?.outcome))throw new Error('请选择这次实战的情况。');
  if(input.outcome==='done'&&!['matched','different','unsure'].includes(input.observation))throw new Error('请记录执行后的实际观察。');
  if(typeof(input.note??'')!=='string'||(input.note||'').length>1200||typeof(input.timepoint??'')!=='string'||(input.timepoint||'').length>80)throw new Error('反馈最多 1200 字，时间点最多 80 字。');
  return {...copy(s),phase:'complete',fieldwork:{outcome:input.outcome,observation:input.outcome==='done'?input.observation:null,note:(input.note||'').trim(),timepoint:(input.timepoint||'').trim(),evidenceType:'self-report',createdAt:now()}};
}
export function addRetry(s,id,input,catalog=CATALOG){if(s.answers.length!==8||s.retries.length>=40)throw new Error('请先完成整个单元；每次单元最多保存 40 次重复练习。');const c=catalog.cases.find(c=>c.id===id&&c.role==='practice');if(!c)throw new Error('只能重做练习题，首次作答不会被覆盖。');return {...copy(s),retries:[...s.retries,normalizeAnswer(c,input)]};}
export function saveDraft(s,input,catalog=CATALOG){
  if(!['baseline','practice','transfer'].includes(s.phase))return s;
  const c=catalog.cases[s.index];
  if(!input||!Array.isArray(input.clueIds)||input.clueIds.some(id=>!c.clueOptions.some(o=>o.id===id))||input.actionId&&!c.actionOptions.some(o=>o.id===input.actionId)||typeof input.reason!=='string'||input.reason.length>600)return s;
  return {...copy(s),draft:{caseId:c.id,clueIds:[...new Set(input.clueIds)],actionId:input.actionId||'',reason:input.reason}};
}
export function validateSession(s,catalog=CATALOG){
  try{
    if(!s||s.version!==1||typeof s.id!=='string'||s.id.length>100||s.unitId!==catalog.id||s.contentVersion!==catalog.version||!['demo','verified'].includes(s.mode)||s.mode==='verified'&&!isReady(catalog)||!phases.includes(s.phase)||!Number.isInteger(s.index)||s.index<0||s.index>8||!Number.isFinite(Date.parse(s.createdAt))||!Number.isFinite(Date.parse(s.updatedAt)))return false;
    if(!Array.isArray(s.answers)||s.answers.length!==s.index||!Array.isArray(s.retries)||s.retries.length>40||!Array.isArray(s.feedbackSeen))return false;
    for(const [i,a]of s.answers.entries()){if(a.caseId!==catalog.cases[i].id||a.contentVersion!==catalog.cases[i].contentVersion||!Number.isFinite(Date.parse(a.answeredAt)))return false;normalizeAnswer(catalog.cases[i],a);}
    for(const a of s.retries){const c=catalog.cases.find(c=>c.id===a.caseId&&c.role==='practice');if(!c||a.contentVersion!==c.contentVersion)return false;normalizeAnswer(c,a);}
    const legal={baseline:s.index<2,'baseline-summary':s.index===2,practice:s.index>=2&&s.index<6,feedback:s.index>=3&&s.index<=6,transfer:s.index>=6&&s.index<8,summary:s.index===8,fieldwork:s.index===8,complete:s.index===8};if(!legal[s.phase])return false;
    if(s.draft!==null&&s.draft!==undefined){const c=catalog.cases[s.index],d=s.draft;if(!['baseline','practice','transfer'].includes(s.phase)||!c||d.caseId!==c.id||!Array.isArray(d.clueIds)||new Set(d.clueIds).size!==d.clueIds.length||d.clueIds.some(id=>!c.clueOptions.some(o=>o.id===id))||typeof d.actionId!=='string'||d.actionId!==''&&!c.actionOptions.some(o=>o.id===d.actionId)||typeof d.reason!=='string'||d.reason.length>600)return false;}
    if(s.feedbackSeen.some(id=>!s.answers.some(a=>a.caseId===id)||!catalog.cases.some(c=>c.id===id&&c.role==='practice')))return false;
    if(['fieldwork','complete'].includes(s.phase)&&(!TASKS[s.task?.key]||['title','trigger','action','exception','measure'].some(key=>s.task[key]!==TASKS[s.task.key][key])))return false;
    if(s.phase==='complete'&&(!s.fieldwork||s.fieldwork.evidenceType!=='self-report'||!['no_opportunity','not_done','done'].includes(s.fieldwork.outcome)||typeof s.fieldwork.note!=='string'||s.fieldwork.note.length>1200||s.fieldwork.outcome==='done'&&!['matched','different','unsure'].includes(s.fieldwork.observation)||s.fieldwork.outcome!=='done'&&s.fieldwork.observation!==null))return false;
    return true;
  }catch{return false;}
}
