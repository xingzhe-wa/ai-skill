function E(t){return t.replace(/[\u200B-\u200D\uFEFF]/g,"").replace(/[\u00A0\u202F]/g," ").trim().replace(/\s+/g," ")}function bt(t){const e=E(t);let o=2166136261;for(let r=0;r<e.length;r+=1)o^=e.charCodeAt(r),o=Math.imul(o,16777619);return`fnv1a:${(o>>>0).toString(16).padStart(8,"0")}:${e.length}`}function Ce(t){const e=E(t.blockText),o=E(t.exact),r=Math.max(0,Math.min(t.start,e.length)),d=Math.max(r,Math.min(t.end,e.length)),a=t.blockIndex;return{exact:o,prefix:e.slice(Math.max(0,r-80),r),suffix:e.slice(d,d+80),containerFingerprint:t.containerFingerprint??bt(t.containerText??t.blockText),blockFingerprint:t.blockFingerprint??bt(t.blockText),...a===void 0?{}:{blockIndex:a},position:{start:r,end:d}}}const mt="bubble-style",Rt={background:"linear-gradient(135deg, #fffbf0, #fff4e6)",textColor:"#3d2b0f",accentColor:"#d97706",fontSize:14,fontFamily:'-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',borderRadius:14,boxShadow:"0 8px 32px rgba(245, 158, 11, 0.18), 0 2px 8px rgba(0,0,0,0.06)",opacity:.97};function de(t){if(typeof t=="object"&&t!==null){const e=t;if(typeof e.background=="string"&&typeof e.textColor=="string"&&typeof e.accentColor=="string"&&typeof e.fontSize=="number"&&typeof e.fontFamily=="string"&&typeof e.borderRadius=="number"&&typeof e.boxShadow=="string"&&typeof e.opacity=="number")return{background:e.background,textColor:e.textColor,accentColor:e.accentColor,fontSize:e.fontSize,fontFamily:e.fontFamily,borderRadius:e.borderRadius,boxShadow:e.boxShadow,opacity:e.opacity}}return{...Rt}}async function Ee(){try{const t=await chrome.storage.local.get(mt);return de(t[mt])}catch{return{...Rt}}}const gt="yuque-private-comments-host",ne="yuque-private-comments-highlight-style",yt="yuque-private-comments-source-highlight",ot="h1,h2,h3,h4,p,li,blockquote,pre,td,th",ke=['[data-testid*="content"]','[data-testid*="editor"]','[class*="lake-content"]','[class*="doc-content"]','[class*="editor-content"]','[class*="reader-content"]','[role="main"]',"main","article"].join(",");function Te(t){const e=new URL(t),o=e.hostname.toLowerCase();if(e.protocol!=="http:"&&e.protocol!=="https:"||o!=="yuque.com"&&!o.endsWith(".yuque.com"))throw new Error("只支持 yuque.com 页面");return e.hash="",e.href}function Le(t){try{const e=new URL(t);return e.protocol!=="https:"||e.hostname.toLowerCase()!=="www.yuque.com"||e.port?!1:Ft.some(o=>e.pathname===o||e.pathname.startsWith(o+"/"))}catch{return!1}}function le(t){try{const e=new URL(t),o=e.hostname.toLowerCase();return e.protocol==="https:"&&(o==="yuque.com"||o.endsWith(".yuque.com"))&&!Le(t)}catch{return!1}}async function V(t){return await chrome.runtime.sendMessage(t)??{ok:!1,error:"后台服务暂不可用，请刷新扩展后重试"}}function s(t,e){const o=document.createElement(t);return e&&(o.className=e),o}function oe(t){const e=[];let o=t;for(;o&&o!==document.body;){const r=o.parentNode;if(!r)return null;e.unshift(Array.prototype.indexOf.call(r.childNodes,o)),o=r}return o===document.body?e:null}function pe(t){return t instanceof Element?t:(t==null?void 0:t.parentElement)??null}function re(t){var e;return((e=pe(t))==null?void 0:e.closest(ot))??null}function ue(t){const e=pe(t);return!!(e!=null&&e.closest(`#${gt}`))}function fe(t){const e=Array.from(t.querySelectorAll(ot));return t instanceof HTMLElement&&t.matches(ot)&&e.unshift(t),e.filter(o=>!ue(o))}function Se(t){return fe(t).map((e,o)=>({index:o,text:e.textContent??"",fingerprint:bt(e.textContent??"")}))}function Ae(t){const e=t.closest(ke);return e&&!ue(e)?e:document.body}function ae(t){const e=[],o=document.createTreeWalker(t,NodeFilter.SHOW_TEXT,{acceptNode(d){const a=d,l=a.parentElement;return!a.data||!l||l.closest(`#${gt}, script, style, noscript, textarea, input, select, option`)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}});let r=o.nextNode();for(;r;)e.push(r),r=o.nextNode();return e}function xe(t){var d;const e=[];let o=null,r=null;for(const a of t){const l=((d=a.parentElement)==null?void 0:d.closest(ot))??null;r!==null&&l!==null&&r!==l&&e.length>0&&(e.push({char:" ",start:{node:a,offset:0},end:{node:a,offset:0}}),o=null),l&&(r=l);for(let p=0;p<a.data.length;p+=1){const b=a.data[p];if(/[\s\u00A0\u202F]/.test(b)){e.length>0&&!o&&(o={node:a,offset:p});continue}/[\u200B-\u200D\uFEFF]/.test(b)||(o&&(e.push({char:" ",start:o,end:{node:a,offset:p}}),o=null),e.push({char:b,start:{node:a,offset:p},end:{node:a,offset:p+1}}))}}return e}function $e(t,e,o){if(e<0||o<=e||o>t.length)return null;const r=t[e],d=t[o-1];if(!r||!d)return null;const a=document.createRange();try{return a.setStart(r.start.node,r.start.offset),a.setEnd(d.end.node,d.end.offset),a}catch{return null}}function ie(t,e,o){const r=document.createRange();try{return r.selectNodeContents(t),r.setEnd(e,o),E(r.toString()).length}catch{return null}}function Be(t,e){if(!e.contains(t.startContainer)||!e.contains(t.endContainer))return null;const o=ie(e,t.startContainer,t.startOffset),r=ie(e,t.endContainer,t.endOffset);if(o===null||r===null||r<=o)return null;const d=E(t.toString()),a=E(e.textContent??""),l=a.slice(o,r)===d?o:a.indexOf(d);return l<0?null:{start:l,end:l+d.length}}function Ie(t){const e=re(t.startContainer),o=re(t.endContainer),r=E(t.toString());if(!e||e!==o||!r)return;const d=Ae(e),l=Se(d).findIndex(b=>fe(d)[b.index]===e),p=Be(t,e);if(!(p===null||l<0))return Ce({exact:r,blockText:e.textContent??"",containerText:d.textContent??"",blockFingerprint:bt(e.textContent??""),blockIndex:l,start:p.start,end:p.end})}function ze(t,e){const o=oe(t.startContainer),r=oe(t.endContainer);if(o===null||r===null)return;const d=E(document.body.textContent??""),a=E(t.toString()),l=a?d.indexOf(a):-1;return{startPath:o,startOffset:t.startOffset,endPath:r,endOffset:t.endOffset,prefix:(e==null?void 0:e.prefix)??(l>0?d.slice(Math.max(0,l-80),l):""),suffix:(e==null?void 0:e.suffix)??(l>=0?d.slice(l+a.length,l+a.length+80):"")}}function Ne(){var b;const t=window.getSelection(),e=(t==null?void 0:t.toString().trim())??"",o=t==null?void 0:t.anchorNode,r=o instanceof Element?o:o==null?void 0:o.parentElement,d=r==null?void 0:r.closest(ot),a=t!=null&&t.rangeCount?t.getRangeAt(0):null,l=a?Ie(a):void 0,p=((b=d==null?void 0:d.textContent)==null?void 0:b.trim().replace(/\s+/g," ").slice(0,160))??"";return{selectedText:e,anchor:p||(e?`选中文本：${e.slice(0,120)}`:"当前文档"),rangeAnchor:a?ze(a,l):void 0,quoteSelector:l}}function he(t){const e=new Date(t);return Number.isNaN(e.getTime())?t:e.toLocaleString("zh-CN",{dateStyle:"short",timeStyle:"short"})}function Fe(t,e){t.textContent=e}function se(t,e,o){const r=s("button",e);return r.type="button",r.textContent=t,r.addEventListener("click",o),r}function Re(t,e){const o=E(e);if(!o)return null;const r=xe(t),a=r.map(l=>l.char).join("").indexOf(o);return a<0?null:$e(r,a,a+o.length)}function Me(){if(document.getElementById(ne))return;const t=s("style");t.id=ne,t.textContent=`
    .${yt} {
      outline: 3px solid rgba(12, 119, 119, 0.48) !important;
      outline-offset: 4px !important;
      background-color: rgba(78, 188, 163, 0.18) !important;
      transition: outline-color 180ms ease, background-color 180ms ease !important;
    }
  `,document.documentElement.append(t)}let N=null,Nt={...Rt};const nt=["/hangzhewa","/dashboard"];let Ft=[...nt];function It(t){Me(),N==null||N.classList.remove(yt);const e=t.commonAncestorContainer instanceof Element?t.commonAncestorContainer:t.commonAncestorContainer.parentElement;e==null||e.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"}),e==null||e.classList.add(yt),N=e;const o=window.getSelection();o==null||o.removeAllRanges(),o==null||o.addRange(t.cloneRange())}function ce(){N==null||N.classList.remove(yt),N=null;const t=window.getSelection();t==null||t.removeAllRanges()}const y="yuque-private-comment-inline-bubble";function zt(t,e){var P;(P=document.getElementById(y))==null||P.remove();const o=document.createElement("div");o.id=y;const r=document.createElement("div");r.className="ipb-header";const d=document.createElement("span");d.className="ipb-author",d.textContent=t.author;const a=document.createElement("span");a.className="ipb-time",a.textContent=he(t.createdAt),r.append(d,a);const l=document.createElement("div");l.className="ipb-body",l.textContent=t.body;const p=document.createElement("button");p.className="ipb-close",p.type="button",p.textContent="×",p.setAttribute("aria-label","关闭"),o.append(r,l,p),be();const b=e.getBoundingClientRect(),F=280,K=16;let m=b.right+K;m+F>window.innerWidth-8&&(m=b.left-F-K),m<8&&(m=Math.max(8,Math.min(window.innerWidth-F-8,b.left)));const rt=Math.max(8,Math.min(window.innerHeight-200,b.top));o.style.left=`${m}px`,o.style.top=`${rt}px`,document.body.append(o),o.classList.add("ipb-visible"),p.addEventListener("click",()=>{o.classList.remove("ipb-visible"),window.setTimeout(()=>o.remove(),200),ce()});const w=at=>{o.contains(at.target)||(o.classList.remove("ipb-visible"),window.setTimeout(()=>o.remove(),200),ce(),document.removeEventListener("pointerdown",w))};window.setTimeout(()=>{document.addEventListener("pointerdown",w)},100)}function be(){var b;const t=Nt;(b=document.getElementById(`${y}-style`))==null||b.remove();const e=document.createElement("style");e.id=`${y}-style`;const o=t.background,r=t.textColor.toLowerCase()==="#e2e8f0"||t.background.includes("1e293b"),d=r?"rgba(255,255,255,0.4)":"#9aacad",a=r?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.06)",l=r?"rgba(255,255,255,0.8)":"#555",p=r?"rgba(255,255,255,0.35)":"#9aacad";e.textContent=`
    #${y} {
      position: fixed;
      z-index: 2147482999;
      width: 300px;
      padding: 0;
      border: 1px solid ${t.accentColor}33;
      border-radius: ${t.borderRadius}px;
      background: ${o};
      opacity: ${t.opacity};
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: ${t.boxShadow};
      font-family: ${t.fontFamily};
      transform: scale(0.92) translateY(8px);
      transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    #${y}.ipb-visible {
      opacity: ${t.opacity};
      transform: scale(1) translateY(0);
    }
    #${y} .ipb-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 6px;
    }
    #${y} .ipb-author {
      color: ${t.accentColor};
      font-size: 12px;
      font-weight: 700;
    }
    #${y} .ipb-time {
      color: ${p};
      font-size: 10px;
    }
    #${y} .ipb-body {
      padding: 0 12px 12px;
      color: ${t.textColor};
      font-size: ${t.fontSize}px;
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    #${y} .ipb-close {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: ${d};
      font-size: 16px;
      line-height: 20px;
      text-align: center;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    #${y} .ipb-close:hover {
      background: ${a};
      color: ${l};
    }
  `,document.documentElement.append(e)}function _e(){var te;(te=document.getElementById(gt))==null||te.remove();const t=chrome.runtime.getURL("icons/float-ball.png"),e=s("aside");e.id=gt;const o=e.attachShadow({mode:"open"}),r=s("style");r.textContent=`
    :host {
      all: initial;
      color: #21343d;
      font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
      font-size: 13px;
    }
    * { box-sizing: border-box; }
    /* ── 悬浮球（独立元素，与面板分离）── */
    .float-ball {
      position: fixed;
      z-index: 2147483001;
      bottom: 24px;
      right: 24px;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 2px solid #fff;
      border-radius: 999px;
      background: #0c7777 url('${t}') center / 60% no-repeat;
      box-shadow: 0 6px 20px rgba(12, 119, 119, 0.35), 0 0 0 4px rgba(12, 119, 119, 0.12);
      cursor: grab;
      opacity: 1;
      transform: scale(1);
      transition: opacity 0.2s ease, transform 0.2s ease;
      will-change: transform, opacity;
    }
    .float-ball:active { cursor: grabbing; }
    .float-ball.dragging { transition: none; }
    .float-ball.hidden {
      opacity: 0;
      transform: scale(0.5);
      pointer-events: none;
    }
    /* 悬浮球红点角标 */
    .float-ball .badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border: 2px solid #fff;
      border-radius: 999px;
      background: #e74c3c;
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      line-height: 14px;
      text-align: center;
    }
    .float-ball .badge:empty { display: none; }

    /* ── 面板（独立元素，不 morph）── */
    .panel {
      position: fixed;
      z-index: 2147483000;
      bottom: 80px;
      right: 24px;
      display: flex;
      width: min(340px, calc(100vw - 32px));
      max-height: calc(100vh - 110px);
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #d5e0e2;
      border-radius: 12px;
      background: #f7faf9;
      box-shadow: 0 16px 48px rgba(28, 58, 64, 0.22);
      /* 只用 opacity + transform 做过渡，GPU 合成层零布局 */
      opacity: 1;
      transform: scale(1) translateY(0);
      transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
      will-change: transform, opacity;
      contain: layout style paint;
    }
    .panel.dragging {
      cursor: grabbing;
      user-select: none;
      transition: none;
    }
    .panel.hidden {
      opacity: 0;
      transform: scale(0.92) translateY(12px);
      pointer-events: none;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 14px;
      border-bottom: 1px solid #dbe5e5;
      background: #fff;
    }
    .title-wrap { display: flex; align-items: baseline; gap: 8px; }
    .title { color: #15333c; font-size: 14px; font-weight: 800; }
    .count { color: #789096; font-size: 11px; }
    .icon-button {
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid #d4e0e1;
      border-radius: 5px;
      color: #47636b;
      background: #fff;
      cursor: pointer;
      font: inherit;
      font-size: 15px;
      line-height: 1;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .icon-button:hover {
      background: #eef4f4;
      border-color: #b0c9c6;
      color: #0c7777;
    }
    .icon-button:active {
      background: #e0eaea;
    }
    .content {
      display: flex;
      min-height: 0;
      flex: 1;
      flex-direction: column;
      overflow: auto;
    }
    .connection-banner {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      margin: 11px 12px 0;
      padding: 10px;
      border: 1px solid #ead9b9;
      border-radius: 6px;
      color: #785a2d;
      background: #fff9eb;
      font-size: 12px;
      line-height: 1.5;
    }
    .connection-banner[hidden] { display: none; }
    .connection-banner button {
      flex: 0 0 auto;
      padding: 0;
      border: 0;
      color: #996b22;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
    }
    .toolbar-note { color: #789096; font-size: 11px; }
    .primary-button {
      min-height: 30px;
      padding: 0 10px;
      border: 0;
      border-radius: 5px;
      color: #fff;
      background: #0c7777;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
    }
    .primary-button:disabled { cursor: wait; opacity: .5; }
    .comment-list { display: grid; gap: 8px; padding: 0 12px 14px; }
    .empty {
      padding: 20px 12px 25px;
      color: #819195;
      text-align: center;
      line-height: 1.6;
    }
    .comment-card {
      padding: 0;
      border: 1px solid #e0e8e7;
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .comment-card:hover {
      border-color: #b8d0cd;
      box-shadow: 0 2px 8px rgba(12, 119, 119, 0.08);
    }
    /* 卡片摘要（折叠态：作者 + 评论预览） */
    .card-summary {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
    }
    .card-summary-text {
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }
    .card-summary-text:active {
      opacity: 0.7;
    }
    .card-summary-text .body-preview {
      color: #3a5056;
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    /* 展开时隐藏摘要预览，避免重复 */
    .comment-card.expanded .body-preview { display: none; }
    .card-chevron {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      border: 0;
      background: transparent;
      color: #8a9a9e;
      cursor: pointer;
      font-size: 12px;
      line-height: 20px;
      text-align: center;
      transition: transform 0.18s ease;
    }
    .comment-card.expanded .card-chevron { transform: rotate(180deg); }
    /* 卡片详情（默认隐藏） */
    .card-details {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.2s ease;
    }
    .comment-card.expanded .card-details {
      max-height: 500px;
    }
    .card-details-inner {
      padding: 0 12px 10px;
      border-top: 1px solid #eef4f3;
    }
    .comment-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #829296;
      font-size: 11px;
    }
    .author { color: #0c7777; font-weight: 800; }
    /* 关联原文：弱化配角，左侧竖线引用样式 */
    .selected {
      margin: 0 0 8px;
      padding: 6px 10px;
      border-left: 3px solid #c4d8d5;
      background: #f4f8f7;
      border-radius: 0 4px 4px 0;
      color: #7a8b8e;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .selected-label {
      color: #9aacad;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    /* 评论正文：主角，突出显示 */
    .body {
      padding: 8px 10px;
      border-radius: 6px;
      background: #f0f7f5;
      border: 1px solid #d5e8e4;
      color: #1a3540;
      font-size: 13.5px;
      font-weight: 500;
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .anchor {
      margin-top: 7px;
      color: #8a9a9e;
      font-size: 11px;
      line-height: 1.4;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .card-actions { display: flex; gap: 12px; margin-top: 10px; }
    .text-button {
      padding: 0;
      border: 0;
      color: #377278;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
    }
    .danger-button { color: #a75a5a; }
    .comment-form {
      margin: 0 12px 12px;
      padding: 12px;
      border: 1px solid #c9dddd;
      border-radius: 7px;
      background: #eff7f5;
    }
    .form-title { margin-bottom: 10px; color: #21454c; font-size: 12px; font-weight: 800; }
    .field { display: grid; gap: 5px; margin-bottom: 9px; }
    .field label { color: #617a7f; font-size: 11px; font-weight: 700; }
    .field input, .field textarea {
      width: 100%;
      padding: 7px 8px;
      border: 1px solid #c8d9d8;
      border-radius: 5px;
      color: #253e45;
      background: #fff;
      font: inherit;
      font-size: 12px;
      line-height: 1.5;
      resize: vertical;
    }
    .field textarea { min-height: 48px; }
    .field textarea.body-input { min-height: 76px; }
    .field textarea.context-input {
      min-height: 38px;
      max-height: 58px;
      resize: none;
      color: #60767b;
      background: #f8fbfa;
    }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .secondary-button {
      min-height: 29px;
      padding: 0 10px;
      border: 1px solid #c6d5d6;
      border-radius: 5px;
      color: #48666b;
      background: #fff;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 700;
    }
    .feedback {
      min-height: 18px;
      padding: 0 12px 10px;
      color: #9a5c5c;
      font-size: 11px;
      line-height: 1.5;
    }
    .feedback[data-kind="success"] { color: #2f725c; }
    .feedback[data-kind="info"] { color: #5c7379; }
    .selection-action {
      position: fixed;
      z-index: 2147483001;
      display: none;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid #0c7777;
      border-radius: 6px;
      color: #fff;
      background: #0c7777;
      box-shadow: 0 5px 16px rgba(28, 58, 64, .2);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
    }
    @media (max-width: 600px) {
      .panel { right: 12px; bottom: 76px; max-height: calc(100vh - 100px); }
      .float-ball { right: 16px; bottom: 16px; }
    }
  `;const d=s("section","panel hidden"),a=s("button","float-ball");a.type="button",a.title="展开评论面板",a.setAttribute("aria-label","展开评论面板");const l=s("span","badge");a.append(l);const p=s("header","panel-header"),b=s("div","title-wrap"),F=s("span","title");F.textContent="私有评论";const K=s("span","count");b.append(F,K);const m=s("button","icon-button");m.type="button",m.title="收起或展开评论面板",m.setAttribute("aria-label","收起或展开评论面板"),m.setAttribute("aria-expanded","true"),m.textContent="−",p.append(b,m);const rt=s("div","content"),w=s("button","selection-action");w.type="button",w.textContent="添加私有评论";const P=s("div","connection-banner"),at=s("span"),it=s("button");it.type="button",it.textContent="打开设置",P.append(at,it);const Mt=s("div","toolbar"),_t=s("span","toolbar-note");_t.textContent="仅自己可见";const Q=s("button","primary-button");Q.type="button",Q.textContent="新增评论",Mt.append(_t,Q);const R=s("form","comment-form");R.hidden=!0;const wt=s("div","form-title"),Ot=s("div","field"),Ht=s("label");Ht.textContent="关联原文（自动）";const A=s("textarea");A.className="context-input",A.readOnly=!0,A.rows=2,Ot.append(Ht,A);const vt=s("div","field"),Yt=s("label");Yt.textContent="锚点";const M=s("input");M.type="text",M.tabIndex=-1,vt.hidden=!0,vt.append(Yt,M);const Pt=s("div","field"),Xt=s("label");Xt.textContent="评论正文";const T=s("textarea","body-input");T.required=!0,T.rows=3,Pt.append(Xt,T);const qt=s("div","form-actions"),st=s("button","secondary-button");st.type="button",st.textContent="取消";const _=s("button","primary-button");_.type="submit",_.textContent="保存评论",qt.append(st,_),R.append(wt,Ot,vt,Pt,qt);const ct=s("div","comment-list"),Ct=s("div","feedback");rt.append(P,Mt,R,ct,Ct),d.append(p,rt),o.append(r,a,d,w),document.body.append(e),Ee().then(n=>{Nt=n}),chrome.storage.local.get("excluded-paths").then(n=>{const i=n["excluded-paths"];Array.isArray(i)&&(Ft=[...nt,...i.filter(c=>typeof c=="string"&&c.trim()&&!nt.includes(c))])}),chrome.storage.onChanged.addListener((n,i)=>{i==="local"&&(n[mt]&&(Nt=de(n[mt].newValue),document.getElementById(y)&&be()),n["excluded-paths"]&&(Ft=[...nt,...Array.isArray(n["excluded-paths"].newValue)?n["excluded-paths"].newValue.filter(c=>typeof c=="string"&&c.trim()&&!nt.includes(c)):[]]))});let dt="",Dt="",$=[],J=null,lt,pt,X=!0,Et=!1,ut=!1,Ut=0,Wt=0,v=0,C=0,q=0,O=0,H=0;function B(n,i="error"){Ct.dataset.kind=i,Fe(Ct,n)}function ft(){J=null,R.hidden=!0,A.value="",M.value="",lt=void 0,pt=void 0,T.value=""}function Gt(){J=null,wt.textContent="新增私有评论",_.textContent="保存评论";const n=Ne();A.value=n.selectedText,M.value=n.anchor,lt=n.rangeAnchor,pt=n.quoteSelector,T.value="",R.hidden=!1,T.focus()}function me(n){J=n.id,wt.textContent="编辑私有评论",_.textContent="保存修改",A.value=n.selectedText,M.value=n.anchor,lt=n.rangeAnchor,pt=n.quoteSelector,T.value=n.body,R.hidden=!1,T.focus()}function ge(n){var f;const i=((f=n.quoteSelector)==null?void 0:f.exact)||n.selectedText||n.anchor;if(!i||!i.trim()){B("这条评论没有选中文本或锚点，无法定位原文。");return}if(jt(i,n)||Vt(n))return;B("正在等待文档内容渲染，请稍候…");let h=5;const x=()=>{h-=1,!(jt(i,n)||Vt(n))&&(h>0?window.setTimeout(x,800):B("未找到对应原文，页面可能尚未加载完成或内容已变更。请确保文档已完全展开后重试。"))};window.setTimeout(x,800)}function jt(n,i){const c=window.getSelection();c==null||c.removeAllRanges();const u=E(n);if(!u)return!1;const h=ye(u);for(const x of h){c==null||c.removeAllRanges();let f=!1;try{f=window.find(x,!1,!1,!0,!1,!1,!1)}catch{f=!1}if(f&&c&&c.toString().trim().length>0){const g=c.rangeCount?c.getRangeAt(0):null;if(g)return It(g),zt(i,g),!0}}return!1}function ye(n){var h;const i=[n],c=(h=n.split(/[。！？；\n]/)[0])==null?void 0:h.trim();if(c&&c.length>=4&&c!==n&&i.push(c),n.length>50){const x=n.slice(0,30);i.push(x);const f=n.slice(0,50);f!==x&&i.push(f)}const u=n.split(/[。！？；\n]/).filter(x=>x.trim().length>=4);return u.length>1&&i.push(u[u.length-1].trim()),Array.from(new Set(i))}function Vt(n){var f;const i=((f=n.quoteSelector)==null?void 0:f.exact)||n.selectedText||n.anchor;if(!(i!=null&&i.trim()))return!1;const c=E(i);if(!c)return!1;const u=ae(document.body);if(u.length===0)return!1;const h=Re(u,c);if(h)return It(h),zt(n,h),!0;const x=c.replace(/\s/g,"");if(x.length>=4){const g=ae(document.body);if(xe(g).map(z=>z.char).join("").replace(/\s/g,"").indexOf(x)>=0){const z=c.replace(/\s/g,"").slice(0,20);for(const tt of g)if(tt.data.replace(/\s/g,"").indexOf(z)>=0){const j=document.createRange();try{return j.selectNodeContents(tt),zt(n,j),It(j),!0}catch{continue}}}}return!1}function kt(){if(K.textContent=`${$.length} 条`,ct.replaceChildren(),$.length===0){const n=s("div","empty");n.textContent="当前文档还没有私有评论。选中文本后可直接添加。",ct.append(n);return}$.forEach(n=>{const i=s("article","comment-card"),c=s("div","card-summary"),u=s("div","card-summary-text"),h=s("span","author");h.textContent=n.author;const x=s("div","body-preview");x.textContent=n.body,u.append(h,x);const f=s("button","card-chevron");f.type="button",f.textContent="▾",c.append(u,f),i.append(c);const g=s("div","card-details"),k=s("div","card-details-inner"),Y=s("div","body");Y.textContent=n.body,k.append(Y);const Z=n.selectedText||n.anchor;if(Z){const et=s("div","selected"),j=s("div","selected-label");j.textContent="关联原文";const ee=s("div");ee.textContent=Z,et.append(j,ee),k.append(et)}const z=s("div","card-actions");z.append(se("编辑","text-button",()=>me(n)),se("删除","text-button danger-button",()=>{window.confirm("确定删除这条私有评论吗？")&&ve(n.id)})),k.append(z);const tt=s("div","comment-meta"),ht=s("time");ht.dateTime=n.updatedAt,ht.textContent=`${he(n.createdAt)}`,tt.append(ht),k.append(tt),g.append(k),i.append(g),u.addEventListener("click",()=>{ge(n)}),f.addEventListener("click",et=>{et.stopPropagation(),i.classList.toggle("expanded")}),ct.append(i)})}function Tt(n,i){P.hidden=n,at.textContent=n?"":`${i}。`,Q.disabled=!n}const I=8,xt=48;function Kt(n,i){const c=window.innerWidth,u=window.innerHeight,h=c-24-xt,x=u-24-xt,f=h+n,g=x+i,k=Math.max(I,Math.min(c-xt-I,f)),Y=Math.max(I,Math.min(u-xt-I,g));return{x:k-h,y:Y-x}}function Lt(n,i){const c=window.innerWidth,u=window.innerHeight,h=Math.min(340,c-32),x=Math.min(d.offsetHeight||400,u-110),f=c-24-h,g=u-80-x,k=f+n,Y=g+i,Z=Math.max(I,Math.min(c-h-I,k)),z=Math.max(I,Math.min(u-x-I,Y));return{x:Z-f,y:z-g}}function St(){const n=Kt(L,S);(n.x!==L||n.y!==S)&&(L=n.x,S=n.y,W=L,G=S,a.style.transform=`translate3d(${L}px, ${S}px, 0)`)}function At(n){if(X=n,X)d.classList.add("hidden"),a.classList.remove("hidden"),St();else{St(),v=L,C=S;const i=Lt(v,C);v=i.x,C=i.y,O=v,H=C,d.style.transform=`translate3d(${v}px, ${C}px, 0)`,d.classList.remove("hidden"),a.classList.add("hidden")}m.textContent=X?"+":"−",m.title=X?"展开评论面板":"最小化评论面板",m.setAttribute("aria-label",m.title),m.setAttribute("aria-expanded",String(!X))}async function we(n){if(Dt!==n&&le(window.location.href)){Dt=n;try{await V({type:"record-visit",url:window.location.href,documentKey:n,title:document.title})}catch{}}}async function D(){try{dt=Te(window.location.href),we(dt);const n=await V({type:"get-comments",documentKey:dt});if(!n.ok||!("library"in n)){$=[],Tt(!1,n.ok?"本地评论库不可用":n.error),B(n.ok?"请先连接本地目录。":n.error),kt();return}$=n.library.comments,Tt(!0,"已连接"),B("","info"),kt(),l.textContent=$.length>0?String($.length):""}catch(n){$=[],Tt(!1,"当前页面无法建立评论连接"),B(n instanceof Error?n.message:"评论加载失败"),kt()}}async function ve(n){const i=await V({type:"delete-comment",commentId:n});if(!i.ok){B(i.error);return}ft(),await D()}it.addEventListener("click",()=>{V({type:"open-options"})}),Q.addEventListener("click",Gt),st.addEventListener("click",ft),m.addEventListener("click",()=>{if(ut){ut=!1;return}At(!0)});let $t=!1,Bt=!1,Qt=0,Jt=0,L=0,S=0,U=0,W=0,G=0;a.addEventListener("pointerdown",n=>{$t=!0,Bt=!1,Qt=n.clientX,Jt=n.clientY,W=L,G=S,a.classList.add("dragging"),a.setPointerCapture(n.pointerId)}),a.addEventListener("pointermove",n=>{if(!$t)return;const i=n.clientX-Qt,c=n.clientY-Jt;(Math.abs(i)>5||Math.abs(c)>5)&&(Bt=!0);const u=Kt(L+i,S+c);W=u.x,G=u.y,U===0&&(U=window.requestAnimationFrame(()=>{U=0,a.style.transform=`translate3d(${W}px, ${G}px, 0)`}))}),a.addEventListener("pointerup",()=>{$t=!1,L=W,S=G,U!==0&&(window.cancelAnimationFrame(U),U=0,a.style.transform=`translate3d(${W}px, ${G}px, 0)`),a.classList.remove("dragging"),Bt||At(!1)}),p.addEventListener("pointerdown",n=>{n.target instanceof HTMLElement&&n.target.closest("button")||(Et=!0,ut=!1,Ut=n.clientX,Wt=n.clientY,O=v,H=C,d.classList.add("dragging"),p.setPointerCapture(n.pointerId))}),p.addEventListener("pointermove",n=>{if(!Et)return;const i=n.clientX-Ut,c=n.clientY-Wt;(Math.abs(i)>5||Math.abs(c)>5)&&(ut=!0);const u=Lt(v+i,C+c);O=u.x,H=u.y,q===0&&(q=window.requestAnimationFrame(()=>{q=0,d.style.transform=`translate3d(${O}px, ${H}px, 0)`}))}),p.addEventListener("pointerup",()=>{Et=!1,v=O,C=H,q!==0&&(window.cancelAnimationFrame(q),q=0,d.style.transform=`translate3d(${O}px, ${H}px, 0)`),d.classList.remove("dragging")}),w.addEventListener("click",()=>{w.style.display="none",At(!1),Gt()}),document.addEventListener("selectionchange",()=>{window.setTimeout(()=>{const n=window.getSelection();if(!((n==null?void 0:n.toString().trim())??"")||!(n!=null&&n.rangeCount)||!e.isConnected){w.style.display="none";return}const c=n.getRangeAt(0).getBoundingClientRect();w.style.left=`${Math.min(window.innerWidth-130,Math.max(8,c.left))}px`,w.style.top=`${Math.min(window.innerHeight-42,Math.max(8,c.bottom+8))}px`,w.style.display="block"},0)}),window.addEventListener("resize",()=>{if(St(),!X){const n=Lt(v,C);v=n.x,C=n.y,O=v,H=C,d.style.transform=`translate3d(${v}px, ${C}px, 0)`}}),R.addEventListener("submit",async n=>{n.preventDefault();const i={documentKey:dt,selectedText:A.value,anchor:M.value,rangeAnchor:lt,quoteSelector:pt,body:T.value};_.disabled=!0;try{const c=J?await V({type:"update-comment",commentId:J,patch:{selectedText:i.selectedText,anchor:i.anchor,rangeAnchor:i.rangeAnchor,quoteSelector:i.quoteSelector,body:i.body}}):await V({type:"create-comment",draft:i});if(!c.ok){B(c.error);return}ft(),await D()}finally{_.disabled=!1}}),D();let Zt=window.location.href;window.addEventListener("popstate",()=>void D()),window.addEventListener("hashchange",()=>void D()),window.setInterval(()=>{window.location.href!==Zt&&(Zt=window.location.href,ft(),D())},1e3)}le(location.href)&&_e();
