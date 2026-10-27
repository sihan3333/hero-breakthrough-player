import { evaluateTurn, getDemoCases } from './diagnosis-engine.mjs';

const cases = getDemoCases();
const caseNotes = {
  knowledge: '先检查人数、经济和网络条件，再确认认知缺口是否反复出现。',
  execution: '能解释处理方式是反向证据；继续区分“知道”与“做到”。',
  economy: '先追问事件顺序，经济落后本身还不能说明根因。',
  numbers: '人数劣势会改变吃线空间，当前先收集公平条件下的观察。',
  unclear: '承认证据不足，把下一次需要带回的信息说清楚。',
};
const el = Object.fromEntries(['case-list','case-note','case-title','conversation','reset','next','step-status','evidence-count','hypotheses','evidence-list'].map(id => [id, document.getElementById(id)]));
let active = cases[1];
let cursor = 0;
let messages = [];
let observations = [];

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

for (const [index, demo] of cases.entries()) {
  const button = node('button', 'case-button');
  button.type = 'button';
  button.dataset.case = demo.id;
  button.setAttribute('aria-pressed', 'false');
  button.append(node('span','case-number',String(index + 1).padStart(2,'0')),node('span','',demo.title));
  button.addEventListener('click', () => chooseCase(demo));
  el['case-list'].append(button);
}

function showEvidence(state) {
  el['evidence-count'].textContent = `${state.evidence.length} 条`;
  el.hypotheses.replaceChildren(...state.hypotheses.map(h => {
    const item = node('div',`hypothesis${h.level.startsWith('较强') ? ' strong' : ''}`);
    item.append(node('span','',h.label),node('span','',h.level));
    return item;
  }));
  const evidenceNodes = state.evidence.map(item => {
    const card = node('div','evidence-item');
    card.append(node('span','',item.label),node('p','',`“${item.quote}”`));
    return card;
  });
  el['evidence-list'].replaceChildren(...(evidenceNodes.length ? evidenceNodes : [node('p','empty-state','对话开始后，这里会显示判断使用的原话与事实。')]));
}

function addMessage(role, content, question) {
  const message = node('div',`message ${role}`);
  message.append(node('span','speaker',role === 'player' ? '玩家 · 预设案例' : '诊断反馈'));
  message.append(node('p','',content));
  if (question) message.append(node('p','question',question));
  el.conversation.append(message);
}

function addResult(state) {
  const result = node('section','result-card');
  result.setAttribute('aria-label','本次诊断结果');
  result.append(node('span','result-type',state.status === 'training' ? '训练优先项 · 基于自述的初步判断' : '观察任务 · 继续收集证据'));
  result.append(node('h4','',state.result.title));
  const details = node('dl');
  for (const [title, value] of [['为什么这样判断',state.result.reason],['下一步只做这一件事',state.result.action],['回来时观察什么',state.result.measure]]) details.append(node('dt','',title),node('dd','',value));
  result.append(details);
  el.conversation.append(result);
}

function refreshControls(state) {
  const done = Boolean(state.result);
  el['step-status'].textContent = done ? `已完成 ${cursor} 轮 · 可切换其他案例` : `${cursor} / ${active.turns.length} 轮玩家描述`;
  el.next.replaceChildren(document.createTextNode(done ? '换一个案例' : cursor ? '继续下一轮' : '开始这一段对话'),node('span','',done ? '↗' : '→'));
  el.next.dataset.done = String(done);
}

function chooseCase(demo) {
  active = demo; cursor = 0; messages = []; observations = [];
  el['case-title'].textContent = demo.title;
  el['case-note'].textContent = caseNotes[demo.id];
  for (const button of el['case-list'].children) button.setAttribute('aria-pressed', String(button.dataset.case === demo.id));
  el.conversation.replaceChildren();
  addMessage('coach','我们先看最近一次具体对线。每一轮只补充一个关键线索，再决定下一步该调查什么。','点击下方按钮，开始回放这个预设案例。');
  const state = evaluateTurn({});
  showEvidence(state); refreshControls(state);
  el.conversation.scrollTop = 0;
}

el.next.addEventListener('click', () => {
  if (el.next.dataset.done === 'true') {
    chooseCase(cases[(cases.indexOf(active) + 1) % cases.length]);
    return;
  }
  const turn = active.turns[cursor];
  if (!turn) return;
  cursor += 1;
  messages.push({id:`u${cursor}`,role:'user',content:turn.text});
  observations.push(...turn.observations);
  addMessage('player',turn.text);
  const state = evaluateTurn({messages,observations});
  if (state.result) addResult(state);
  else addMessage('coach',state.interpretation,state.question?.text);
  showEvidence(state); refreshControls(state);
  el.conversation.scrollTo({top:el.conversation.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
});
el.reset.addEventListener('click', () => chooseCase(active));
chooseCase(active);
