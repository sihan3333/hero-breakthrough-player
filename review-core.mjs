import { evaluateTurn, groundObservations, FACT_VALUES } from './diagnosis-engine.mjs';

export const FACT_FIELDS = {
  numbers: { title: '交手时双方人数', options: [['even','双方人数相当'],['outnumbered','我方人数更少']] },
  economy: { title: '出问题之前的经济', options: [['even','双方经济接近'],['behind','我已经明显经济落后']] },
  network: { title: '当时网络与设备', options: [['stable','网络与设备正常'],['unstable','有卡顿或延迟']] },
  recognition: { title: '对手的关键信息', options: [['present','我能指出需要留意的关键技能'],['missing','我说不清需要留意的关键技能']] },
  understanding: { title: '当时如何判断', options: [['present','我能解释当时应该做什么及理由'],['missing','我认得技能，但不知道该如何应对']] },
  execution: { title: '实际动作', options: [['fails','知道处理方式，但没有按计划做出来'],['stable','实际动作与原本的判断一致']] },
  last_hit: { title: '没有对手干扰时的补兵', options: [['fails','没有干扰也经常漏最后一下'],['comfortable','没有干扰时补兵正常'],['pressured','主要在受压时不敢吃线']] },
  recurrence: { title: '出现频率', options: [['repeated','最近几局反复出现'],['single','目前只记得这一次']] },
  scope: { title: '遇到的对手', options: [['broad','面对不同对手都出现过'],['specific','目前只在一个特定对手身上出现']] },
  timeline: { title: '哪件事先发生', options: [['economy_first','先漏线或离线，经济落后之后才交手失败'],['trade_first','先换血失败，之后回城或漏线才落后']] },
  recall: { title: '能否回忆具体过程', options: [['clear','能回忆同一个片段的过程'],['unclear','暂时记不清具体过程']] },
};
export const QUESTION_FIELDS = {
  conditions: ['numbers','economy','network'], recognition: ['recognition'],
  understanding: ['understanding'], execution: ['execution'], last_hit: ['last_hit'],
  recurrence: ['recurrence','scope'], economy_order: ['timeline'],
  other_cause: ['economy','timeline'], episode: ['recall'],
};
const uid = () => globalThis.crypto.randomUUID();
const now = () => new Date().toISOString();
export function makeSession(description) {
  const content = typeof description === 'string' ? description.trim() : '';
  if (!content || content.length > 1200) throw new Error('请用 1—1200 字描述一个具体片段。');
  return { version: 1, id: uid(), createdAt: now(), updatedAt: now(), phase:'review',
    messages:[{id:uid(),role:'user',content}], observations:[], finished:false, task:null, feedback:null };
}
export function reviewState(session) {
  const state = evaluateTurn({messages:session.messages,observations:session.observations,finish:session.finished});
  // The episode itself is supplied as free text. Guided mode asks explicit context
  // rather than pretending that it extracted facts from the description.
  if (state.question?.id === 'episode' && session.messages.length) {
    state.question = {id:'conditions',text:'先确认这一个片段的局面。记不清的项目可以选“不确定”，我们不会据此推断。'};
  }
  return state;
}
export function answerFields(session, answers) {
  if (session.phase !== 'review') throw new Error('本次行动已经保存，请开始新的复盘。');
  const entries = Object.entries(answers);
  if (!entries.length || entries.some(([key,value]) => !FACT_FIELDS[key] || (value !== 'unknown' && !FACT_VALUES[key].includes(value)))) throw new Error('请确认每一项回答。');
  const id = uid();
  const parts = entries.map(([key,value]) => value === 'unknown' ? `${FACT_FIELDS[key].title}：不确定` : FACT_FIELDS[key].options.find(o=>o[0]===value)[1]);
  const message = {id,role:'user',content:parts.join('；')+'。'};
  const replace = new Set(entries.map(([key])=>key));
  const observations = session.observations.filter(o=>!replace.has(o.key));
  entries.forEach(([key,value],i)=> { if(value !== 'unknown') observations.push({key,value,quote:parts[i],messageId:id}); });
  return {...session, messages:[...session.messages,message],observations,finished:false,updatedAt:now()};
}
export function validateExtraction(messages, payload) {
  if (!payload || !Array.isArray(payload.observations) || payload.observations.length > 16) throw new Error('AI 返回格式不符合要求，请使用引导复盘。');
  const observations = payload.observations;
  const latest = messages.at(-1)?.id;
  if (observations.some(o=>!o || o.messageId !== latest)) throw new Error('AI 引用了本次输入以外的信息，请手动确认。');
  const grounded = groundObservations(messages, observations);
  if (grounded.length !== observations.length) throw new Error('AI 提取的信息未通过原话校验，请使用引导复盘。');
  const keys = new Set();
  for (const o of grounded) {
    if (keys.has(o.key)) throw new Error('AI 提取的信息存在冲突，请手动确认。');
    keys.add(o.key);
  }
  return grounded;
}
export function confirmExtraction(session, selected) {
  if(session.phase !== 'review') throw new Error('本次行动已经保存。');
  const observations = validateExtraction(session.messages,{observations:selected});
  const keys = new Set(observations.map(o=>o.key));
  return {...session, observations:[...session.observations.filter(o=>!keys.has(o.key)),...observations],updatedAt:now()};
}
export function addDescription(session, content) {
  if(session.phase !== 'review' || !content?.trim() || content.length>1200) throw new Error('请补充 1—1200 字的具体经历。');
  return {...session,messages:[...session.messages,{id:uid(),role:'user',content:content.trim()}],finished:false,updatedAt:now()};
}
export function finishReview(session) { return {...session,finished:true,updatedAt:now()}; }
export function acceptTask(session) {
  const result = reviewState(session).result;
  if(!result) throw new Error('请先完成当前问题。');
  return {...session,phase:'practice',task:{...result,acceptedAt:now()},updatedAt:now()};
}
export function saveFeedback(session, input) {
  if(!session.task) throw new Error('请先保存本次行动。');
  if(!['no_opportunity','not_done','done'].includes(input.outcome)) throw new Error('请选择练习情况。');
  if(input.outcome === 'done' && !['matched','different','unsure'].includes(input.observation)) throw new Error('请选择实际观察。');
  const note = String(input.note || '').trim();
  if(note.length > 1200) throw new Error('反馈请保持在 1200 字以内。');
  return {...session,phase:'complete',feedback:{outcome:input.outcome,observation:input.outcome === 'done'?input.observation:null,note,createdAt:now()},updatedAt:now()};
}
export function isValidSession(s) {
  try {
    if(!s || s.version!==1 || typeof s.id!=='string' || !['review','practice','complete'].includes(s.phase) || typeof s.finished!=='boolean' || !Number.isFinite(Date.parse(s.createdAt)) || !Number.isFinite(Date.parse(s.updatedAt))) return false;
    if(!Array.isArray(s.messages)||s.messages.length<1||s.messages.length>50||!Array.isArray(s.observations)||s.observations.length>40) return false;
    if(s.messages.some(m=>!m||typeof m.id!=='string'||m.role!=='user'||typeof m.content!=='string'||m.content.length>4000)) return false;
    if(new Set(s.messages.map(m=>m.id)).size!==s.messages.length || groundObservations(s.messages,s.observations).length!==s.observations.length) return false;
    if(s.phase!=='review' && (!s.task || ['title','reason','action','measure'].some(k=>typeof s.task[k]!=='string'||s.task[k].length>4000))) return false;
    if(s.phase==='complete' && (!s.feedback||!['no_opportunity','not_done','done'].includes(s.feedback.outcome)||typeof s.feedback.note!=='string'||s.feedback.note.length>1200|| (s.feedback.outcome==='done'&&!['matched','different','unsure'].includes(s.feedback.observation)))) return false;
    return true;
  } catch { return false; }
}
