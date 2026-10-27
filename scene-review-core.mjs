export const SCENE_KEY='hero-breakthrough:scene-review:v1';
export const MAX_IMAGE_BYTES=20*1024*1024;
export const SAMPLE={id:'gongsunli-public-2023',kind:'sample',name:'公孙离 · 画面观察 01',url:'assets/real-scenes/gongsunli-2023.jpg',sourceUrl:'https://www.9game.cn/wzry/9328290.html',sourceDate:'2023-11-11'};
export const CHOICES={approach:'继续靠近',hold:'保持距离，继续观察',retreat:'先撤到安全位置',need_info:'还需要信息才能决定'};
export const OBSERVATION_ZONES=[
  {id:'map',label:'小地图',x:0,y:0,w:.18,h:.33,note:'查看此刻小地图上可见的位置。没显示在这里的人，不能仅凭这一帧确认其真实位置。'},
  {id:'health',label:'血条与等级',x:.45,y:.08,w:.44,h:.35,note:'对照画面中双方可见的血条与等级。这里没有完整经济面板，不能据此断言双方经济接近。'},
  {id:'skills',label:'技能与状态',x:.65,y:.6,w:.35,h:.4,note:'查看自己技能栏当下显示的信息。单帧不包含此前完整的技能顺序，也不能保证某个行动一定成功。'},
];
const now=()=>new Date().toISOString();
const updated=s=>({...s,updatedAt:now()});
export function validMedia(m){return Boolean(m&&((m.kind==='sample'&&m.id===SAMPLE.id)||(m.kind==='local'&&typeof m.name==='string'&&m.name.length<=200&&['image/jpeg','image/png','image/webp'].includes(m.mime)&&Number.isInteger(m.size)&&m.size>0&&m.size<=MAX_IMAGE_BYTES&&typeof m.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(m.fingerprint))));}
export function createReview(media=SAMPLE){if(!validMedia(media))throw new Error('请选择有效的游戏截图。');return {version:1,id:crypto.randomUUID(),media:media.kind==='sample'?{kind:'sample',id:SAMPLE.id}:{...media},phase:'answer',markers:[],draft:{choice:'',reason:''},firstAnswer:null,reflection:null,fieldwork:null,createdAt:now(),updatedAt:now()};}
function assertEditable(s){if(s.phase!=='answer'||s.firstAnswer)throw new Error('首次判断已保存。请在后面的复盘中补充，不覆盖原判断。');}
function markerOk(p){return p&&typeof p.x==='number'&&Number.isFinite(p.x)&&p.x>=0&&p.x<=1&&typeof p.y==='number'&&Number.isFinite(p.y)&&p.y>=0&&p.y<=1;}
export function addMarker(s,p){assertEditable(s);if(!markerOk(p))throw new Error('请在游戏画面内标记。');if(s.markers.length>=3)throw new Error('最多标记三个位置，可以撤销后重选。');return {...updated(s),markers:[...s.markers,{x:p.x,y:p.y}]};}
export function undoMarker(s){assertEditable(s);return {...updated(s),markers:s.markers.slice(0,-1)};}
export function updateDraft(s,input){assertEditable(s);if(typeof input.choice!=='string'||input.choice!==''&&!CHOICES[input.choice]||typeof input.reason!=='string'||input.reason.length>600)throw new Error('理由最多 600 字。');return {...updated(s),draft:{choice:input.choice,reason:input.reason}};}
export function submitDecision(s,input){assertEditable(s);if(!CHOICES[input?.choice]||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>600)throw new Error('请选择行动，并写下自己的判断理由。');return {...updated(s),phase:'compare',draft:{choice:'',reason:''},firstAnswer:{choice:input.choice,reason:input.reason.trim(),markers:s.markers.map(p=>({...p})),submittedAt:now()}};}
export function saveReflection(s,input){if(!s.firstAnswer||!['compare','task'].includes(s.phase))throw new Error('请先留下自己的判断。');if(typeof input.observation!=='string'||input.observation.length>1200||typeof input.task!=='string'||!input.task.trim()||input.task.length>600)throw new Error('请写下一项具体的实战观察任务；任务最多 600 字。');return {...updated(s),phase:'task',reflection:{observation:input.observation.trim(),task:input.task.trim(),savedAt:now()}};}
export function saveFieldwork(s,input){if(!s.reflection||!['task','complete'].includes(s.phase)||!['no_opportunity','not_done','done'].includes(input?.outcome))throw new Error('请选择实际练习情况。');if(input.outcome==='done'&&!['matched','different','unsure'].includes(input.observation))throw new Error('请选择尝试后的观察。');if(typeof(input.note??'')!=='string'||(input.note||'').length>1200)throw new Error('反馈最多 1200 字。');return {...updated(s),phase:'complete',fieldwork:{outcome:input.outcome,observation:input.outcome==='done'?input.observation:null,note:(input.note||'').trim(),evidenceType:'self-report',savedAt:now()}};}
export function validateReview(s){try{
  if(!s||s.version!==1||typeof s.id!=='string'||s.id.length>100||!validMedia(s.media)||!['answer','compare','task','complete'].includes(s.phase)||!Number.isFinite(Date.parse(s.createdAt))||!Number.isFinite(Date.parse(s.updatedAt))||!Array.isArray(s.markers)||s.markers.length>3||!s.markers.every(markerOk))return false;
  if(!s.draft||typeof s.draft.choice!=='string'||s.draft.choice!==''&&!CHOICES[s.draft.choice]||typeof s.draft.reason!=='string'||s.draft.reason.length>600)return false;
  if(s.phase==='answer'&&s.firstAnswer!==null)return false;
  if(s.phase!=='answer'){const a=s.firstAnswer;if(!a||!CHOICES[a.choice]||typeof a.reason!=='string'||!a.reason.trim()||a.reason.length>600||!Array.isArray(a.markers)||a.markers.length>3||!a.markers.every(markerOk)||!Number.isFinite(Date.parse(a.submittedAt)))return false;}
  if(['task','complete'].includes(s.phase)){const r=s.reflection;if(!r||typeof r.observation!=='string'||r.observation.length>1200||typeof r.task!=='string'||!r.task.trim()||r.task.length>600)return false;}
  if(s.phase==='complete'){const f=s.fieldwork;if(!f||f.evidenceType!=='self-report'||!['no_opportunity','not_done','done'].includes(f.outcome)||typeof f.note!=='string'||f.note.length>1200||f.outcome==='done'&&!['matched','different','unsure'].includes(f.observation)||f.outcome!=='done'&&f.observation!==null)return false;}
  return true;
}catch{return false;}}
