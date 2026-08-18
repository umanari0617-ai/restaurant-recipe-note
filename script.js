const KEY="restaurantRecipeNoteV1";
const $=id=>document.getElementById(id);

const DEFAULT_SERVING_OPTIONS=[
  {id:"o1",label:"1人前",multiplier:1},
  {id:"o2",label:"5人前",multiplier:5},
  {id:"o3",label:"10人前",multiplier:10},
  {id:"o4",label:"1回分",multiplier:1},
  {id:"o5",label:"1.5回分",multiplier:1.5},
  {id:"o6",label:"2回分",multiplier:2}
];
function servingLabels(s){return((s||state).servingOptions||[]).map(o=>o.label);}
function servingMultiplier(label,s){
  const opts=(s||state).servingOptions||[];
  const o=opts.find(o=>o.label===label);
  return o?o.multiplier:1;
}

let state=load();
let currentCategoryId=null;
let currentRecipeId=null;
let currentView="categoryView";
let currentTab="categoryView";
let isManagerMode=false;
let pinMode="enter";
let prepPickRecipeId=null;
let prepPickValue="1回分";
let formPhoto="";
let formStages=[];
let recipeFilterMode="all";

function defaultState(){
  return{
    categories:[
      {id:"appetizer",name:"前菜"},
      {id:"main",name:"メイン"},
      {id:"dessert",name:"デザート"},
      {id:"sauce",name:"ソース・タレ"}
    ],
    recipes:[],
    managerPin:null,
    servingOptions:DEFAULT_SERVING_OPTIONS.map(o=>({...o}))
  };
}
function load(){
  const raw=localStorage.getItem(KEY);
  if(!raw)return defaultState();
  try{
    const x=JSON.parse(raw);
    if(x&&Array.isArray(x.categories)&&Array.isArray(x.recipes)){
      migrateRecipes(x);
      return x;
    }
    saveBrokenCopy(raw);
    alert("保存されていたデータの形式が読み取れませんでした。元のデータは別名で端末内に残していますが、開発者にご連絡ください。");
    return defaultState();
  }catch(e){
    saveBrokenCopy(raw);
    alert("保存データの読み込み中にエラーが発生しました。元のデータは別名で端末内に残していますが、開発者にご連絡ください。\nエラー内容："+(e&&e.message?e.message:e));
    return defaultState();
  }
}
function saveBrokenCopy(raw){
  try{localStorage.setItem(KEY+"_broken_"+Date.now(),raw);}catch{}
}
function migrateRecipes(x){
  if(typeof x.managerPin==="undefined")x.managerPin=null;
  if(!Array.isArray(x.servingOptions)||!x.servingOptions.length){
    x.servingOptions=DEFAULT_SERVING_OPTIONS.map(o=>({...o}));
  }
  x.servingOptions.forEach(o=>{
    if(typeof o.id!=="string"||!o.id)o.id=id();
    if(typeof o.label!=="string")o.label="";
    if(typeof o.multiplier!=="number"||!(o.multiplier>0))o.multiplier=1;
  });
  x.recipes.forEach(r=>{
    if(typeof r.ingredients==="string"){
      r.ingredients=r.ingredients.split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
        const parts=line.split(/[\t　]{1,}| {2,}/).filter(Boolean);
        return{name:parts[0]||line,amount:parts.slice(1).join(" ")||""};
      });
    }
    if(!r.servingBase||!servingLabels(x).includes(r.servingBase))r.servingBase=servingLabels(x)[0]||"1人前";
    if(!Array.isArray(r.stages)){
      const ingredients=Array.isArray(r.ingredients)?r.ingredients:[];
      const instruction=typeof r.steps==="string"?r.steps:"";
      r.stages=(ingredients.length||instruction)?[{groupName:"",ingredients,instruction}]:[];
    }
    r.stages.forEach(s=>{
      if(!Array.isArray(s.ingredients))s.ingredients=[];
      if(typeof s.instruction!=="string")s.instruction="";
      if(typeof s.groupName!=="string")s.groupName="";
    });
    if(!Array.isArray(r.notes))r.notes=[];
    r.notes.forEach(n=>{if(typeof n.needsImprovement!=="boolean")n.needsImprovement=false;});
    if(typeof r.memo==="string"&&r.memo.trim()){
      r.notes.unshift({name:"",text:r.memo.trim(),date:r.cookedDate||new Date().toISOString().slice(0,10)});
    }
    delete r.rating;
    if(typeof r.needsPrep!=="boolean")r.needsPrep=false;
    if(!r.prepMultiplier||!servingLabels(x).includes(r.prepMultiplier))r.prepMultiplier=servingLabels(x)[0]||"1回分";
    if(typeof r.prepCount!=="number")r.prepCount=0;
    if(typeof r.lastPreppedDate!=="string")r.lastPreppedDate="";
    delete r.ingredients;
    delete r.steps;
    delete r.memo;
  });
}
function save(){
  try{
    localStorage.setItem(KEY,JSON.stringify(state));
  }catch(e){
    alert("データの保存に失敗しました。空き容量が足りない可能性があります。写真の枚数を減らすか、不要なレシピを削除してから、もう一度お試しください。\nエラー内容："+(e&&e.message?e.message:e));
  }
}
function id(){return crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2);}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function todayStr(){return new Date().toISOString().slice(0,10);}

function formatNumber(n){
  const rounded=Math.round(n*100)/100;
  return Number.isInteger(rounded)?String(rounded):String(rounded);
}
function scaleAmountText(text,ratio){
  if(!text)return text;
  if(ratio===1)return text;
  const m=text.match(/(\d+(?:\.\d+)?)/);
  if(!m)return text;
  const scaled=formatNumber(parseFloat(m[1])*ratio);
  return text.slice(0,m.index)+scaled+text.slice(m.index+m[1].length);
}
function ingredientHistory(){
  const names=new Set(),amounts=new Set();
  state.recipes.forEach(r=>(r.stages||[]).forEach(s=>(s.ingredients||[]).forEach(i=>{
    if(i.name)names.add(i.name);
    if(i.amount)amounts.add(i.amount);
  })));
  return{names:[...names],amounts:[...amounts]};
}
function filterHistory(arr,q){
  const query=q.trim();
  if(!query)return arr.slice(0,8);
  return arr.filter(v=>v.includes(query)).slice(0,8);
}
function setupAutocomplete(input,listEl,historyArr,onChange){
  function renderList(){
    const matches=filterHistory(historyArr,input.value);
    if(!matches.length){listEl.classList.add("hidden");listEl.innerHTML="";return;}
    listEl.innerHTML=matches.map(m=>`<li>${esc(m)}</li>`).join("");
    listEl.classList.remove("hidden");
  }
  input.addEventListener("input",()=>{onChange(input.value);renderList();});
  input.addEventListener("focus",renderList);
  input.addEventListener("blur",()=>{listEl.classList.add("hidden");});
  listEl.addEventListener("mousedown",e=>{
    const li=e.target.closest("li");
    if(!li)return;
    e.preventDefault();
    input.value=li.textContent;
    onChange(input.value);
    listEl.classList.add("hidden");
  });
}

function init(){
  bind();
  updateManagerUI();
  renderCategoryList();
  showView("categoryView");
}

function bind(){
  $("backButton").onclick=()=>{
    if(currentView==="recipeDetailView"||currentView==="categoryEditView"){showTab(currentTab);}
  };
  document.querySelectorAll(".tab-button").forEach(btn=>{
    btn.onclick=()=>showTab(btn.dataset.view);
  });
  $("gearButton").onclick=()=>{renderCategoryEditList();renderServingOptionsEditList();showView("categoryEditView");};
  $("addServingOptionButton").onclick=addServingOption;
  $("modeToggleButton").onclick=toggleManagerMode;
  $("changePinButton").onclick=()=>openPinModal("change");
  $("addRecipeButton").onclick=()=>openRecipeForm(null);
  $("editRecipeButton").onclick=()=>openRecipeForm(findRecipe(currentRecipeId));
  $("deleteRecipeButton").onclick=deleteCurrentRecipe;
  $("addCategoryButton").onclick=addCategory;
  $("newCategoryName").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addCategory();}});
  $("recipeForm").onsubmit=saveRecipeForm;
  $("recipePhotoInput").addEventListener("change",onPhotoChange);
  $("removePhotoButton").onclick=()=>{formPhoto="";renderPhotoPreview();};
  $("addStageButton").onclick=addStage;
  $("parsePasteButton").onclick=applyPastedRecipe;
  $("exportButton").onclick=exportBackup;
  $("importInput").onchange=importBackup;
  $("pinForm").onsubmit=submitPinForm;
  $("detailPrepCheckbox").onclick=onDetailPrepCheckboxClick;
  $("detailPrepMultiplier").onchange=e=>{
    const r=findRecipe(currentRecipeId);
    if(r){r.prepMultiplier=e.target.value;save();}
  };
  $("addNoteButton").onclick=addNote;
  $("filterAllButton").onclick=()=>setRecipeFilterMode("all");
  $("filterFlaggedButton").onclick=()=>setRecipeFilterMode("flagged");
  $("prepPickConfirm").onclick=confirmPrepPick;
  document.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>closeModal(x.dataset.close));
}

function updateManagerUI(){
  $("modeToggleButton").textContent=isManagerMode?"レシピ閲覧モードに戻る":"店長モードに入る";
  $("modeText").textContent=isManagerMode?"店長モード中":"閲覧モード";
  $("modeSubtext").classList.toggle("hidden",!isManagerMode);
  $("modeBar").classList.toggle("manager-mode",isManagerMode);
  $("appHeader").classList.toggle("manager-mode",isManagerMode);
  document.querySelectorAll(".manager-only").forEach(el=>{
    if(isManagerMode)el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
  if(!isManagerMode)$("gearButton").classList.add("hidden");
  else if(currentView==="categoryView")$("gearButton").classList.remove("hidden");
  if(isManagerMode&&currentView==="prepView"){
    showTab("categoryView");
  }else{
    const isTopLevel=currentView==="categoryView"||currentView==="prepView";
    document.querySelector(".tab-bar").classList.toggle("hidden",!isTopLevel||isManagerMode);
  }
}
function toggleManagerMode(){
  if(isManagerMode){
    isManagerMode=false;
    updateManagerUI();
    if(currentView==="categoryEditView")showTab("categoryView");
    return;
  }
  openPinModal(state.managerPin?"enter":"set");
}

function showTab(name){
  currentTab=name;
  document.querySelectorAll(".tab-button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  showView(name);
}
function showView(name){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(name).classList.remove("hidden");
  currentView=name;
  const isTopLevel=name==="categoryView"||name==="prepView";
  $("backButton").classList.toggle("hidden",isTopLevel);
  document.querySelector(".tab-bar").classList.toggle("hidden",!isTopLevel||isManagerMode);
  $("gearButton").classList.toggle("hidden",!(isManagerMode&&name==="categoryView"));
  const titles={categoryView:"飲食店レシピノート",prepView:"仕込みノート",recipeDetailView:(findRecipe(currentRecipeId)||{}).name||"",categoryEditView:"カテゴリを編集"};
  $("headerTitle").textContent=titles[name]||"飲食店レシピノート";
  if(name==="prepView")renderPrepList();
  window.scrollTo(0,0);
}

function categoryName(catId){return state.categories.find(c=>c.id===catId)?.name||"";}
function findRecipe(rid){return state.recipes.find(r=>r.id===rid);}
function recipesInCategory(catId){
  return state.recipes.filter(r=>r.categoryId===catId).sort((a,b)=>(b.prepCount||0)-(a.prepCount||0));
}
function flaggedNotes(r){return(r.notes||[]).filter(n=>n.needsImprovement&&n.text&&n.text.trim());}
function hasFlaggedNote(r){return flaggedNotes(r).length>0;}
function visibleRecipesInCategory(catId){
  const list=recipesInCategory(catId);
  return recipeFilterMode==="flagged"?list.filter(hasFlaggedNote):list;
}
function setRecipeFilterMode(mode){
  recipeFilterMode=mode;
  $("filterAllButton").classList.toggle("active",mode==="all");
  $("filterFlaggedButton").classList.toggle("active",mode==="flagged");
  renderRecipeList();
}

/* ---------- category sidebar ---------- */
function renderCategoryList(){
  const list=$("categoryList");
  if(!state.categories.length){
    list.innerHTML=`<li style="border:none;color:var(--muted);">カテゴリが<br>ありません</li>`;
    $("recipeList").innerHTML="";
    $("recipeListEmpty").classList.add("hidden");
    return;
  }
  if(!currentCategoryId||!state.categories.some(c=>c.id===currentCategoryId)){
    currentCategoryId=state.categories[0].id;
  }
  list.innerHTML=state.categories.map(c=>
    `<li data-id="${c.id}" class="${c.id===currentCategoryId?"active":""}">${esc(c.name)}</li>`
  ).join("");
  list.querySelectorAll("li[data-id]").forEach(li=>{
    li.onclick=()=>openCategory(li.dataset.id);
  });
  renderRecipeList();
}
function openCategory(catId){
  currentCategoryId=catId;
  renderCategoryList();
}

/* ---------- recipe list ---------- */
function renderRecipeList(){
  const recipes=visibleRecipesInCategory(currentCategoryId);
  $("recipeListEmpty").innerHTML=recipeFilterMode==="flagged"?"要改善のメモがある<br>レシピはありません。":"まだレシピが<br>ありません。";
  $("recipeListEmpty").classList.toggle("hidden",recipes.length>0);
  $("recipeList").innerHTML=recipes.map(r=>recipeRowHtml(r)).join("");
  bindRecipeRows($("recipeList"));
}
function recipeRowHtml(r){
  const thumb=r.photo?`<img class="recipe-thumb" src="${r.photo}" alt="">`:`<div class="recipe-thumb-placeholder">🍳</div>`;
  const flagCount=flaggedNotes(r).length;
  const badges=`${r.needsPrep?`<span class="recipe-row-mult">${esc(r.prepMultiplier)}</span>`:""}${flagCount?`<span class="recipe-row-flag">要改善×${flagCount}</span>`:""}`;
  const meta=badges?`<div class="recipe-row-badges">${badges}</div>`:"";
  return `<li data-id="${r.id}"><input type="checkbox" class="recipe-row-check prep-check" data-id="${r.id}" autocomplete="off" ${r.needsPrep?"checked":""}><div class="recipe-row-main">${thumb}<span class="recipe-name">${esc(r.name)}</span></div>${meta}</li>`;
}
function bindRecipeRows(container){
  container.querySelectorAll("li[data-id]").forEach(li=>{
    const box=li.querySelector(".prep-check");
    const r=findRecipe(li.dataset.id);
    if(r)box.checked=!!r.needsPrep;
    box.onclick=e=>{
      e.stopPropagation();
      e.preventDefault();
      onPrepCheckboxClick(li.dataset.id);
    };
    li.addEventListener("click",e=>{
      if(e.target.classList.contains("prep-check"))return;
      openRecipeDetail(li.dataset.id);
    });
  });
}

/* ---------- 仕込みノート ---------- */
function renderPrepList(){
  const items=state.recipes.filter(r=>r.needsPrep);
  $("prepListEmpty").classList.toggle("hidden",items.length>0);
  $("prepList").innerHTML=items.map(r=>recipeRowHtml(r)).join("");
  bindRecipeRows($("prepList"));
}
function onPrepCheckboxClick(rid){
  const r=findRecipe(rid);
  if(!r)return;
  if(r.needsPrep){
    completePrep(r);
  }else{
    openPrepPickModal(r);
  }
}
function openPrepPickModal(r){
  prepPickRecipeId=r.id;
  prepPickValue=(r.prepMultiplier&&servingLabels().includes(r.prepMultiplier))?r.prepMultiplier:(servingLabels()[0]||"1回分");
  $("prepPickName").textContent=r.name;
  renderPrepPickOptions();
  openModal("prepPick");
}
function renderPrepPickOptions(){
  $("prepPickOptions").innerHTML=servingLabels().map(o=>`<span data-v="${o}" class="${o===prepPickValue?"active":""}">${o}</span>`).join("");
  $("prepPickOptions").querySelectorAll("span").forEach(s=>{
    s.onclick=()=>{prepPickValue=s.dataset.v;renderPrepPickOptions();};
  });
}
function confirmPrepPick(){
  const r=findRecipe(prepPickRecipeId);
  if(!r)return;
  r.needsPrep=true;
  r.prepMultiplier=prepPickValue;
  save();
  closeModal("prepPick");
  refreshLists();
}
function completePrep(r){
  if(!confirm(`「${r.name}」の仕込みを完了にしますか？`))return;
  r.needsPrep=false;
  r.lastPreppedDate=todayStr();
  r.prepCount=(r.prepCount||0)+1;
  save();
  refreshLists();
}
function refreshLists(){
  renderCategoryList();
  renderPrepList();
  if(currentView==="recipeDetailView"&&currentRecipeId)openRecipeDetail(currentRecipeId);
}

/* ---------- recipe detail ---------- */
function openRecipeDetail(rid){
  const r=findRecipe(rid);
  if(!r)return;
  currentRecipeId=rid;
  $("detailPhotoWrap").classList.toggle("hidden",!r.photo);
  if(r.photo)$("detailPhoto").src=r.photo;
  $("detailName").textContent=r.name;
  $("detailTime").textContent=r.cookTime?`調理時間：${esc(r.cookTime)}`:"";
  $("detailLastPrepped").textContent=r.lastPreppedDate?`前回仕込み：${r.lastPreppedDate}`:"";

  $("detailPrepCheckbox").checked=r.needsPrep;
  $("detailPrepMultiplier").innerHTML=servingLabels().map(o=>`<option value="${o}">${o}</option>`).join("");
  $("detailPrepMultiplier").value=r.prepMultiplier||servingLabels()[0]||"1回分";
  $("detailPrepMultiplier").classList.toggle("hidden",!r.needsPrep);

  const stages=r.stages||[];
  const hasIngredients=stages.some(s=>(s.ingredients||[]).length>0);
  $("detailServingSelect").innerHTML=servingLabels().map(o=>`<option value="${o}">${o}</option>`).join("");
  $("detailServingSelect").value=r.servingBase||servingLabels()[0]||"1人前";
  $("detailServingSelect").onchange=()=>renderDetailStages(r);
  $("detailServingWrap").classList.toggle("hidden",!hasIngredients);

  $("detailStagesWrap").classList.toggle("hidden",!stages.length);
  renderDetailStages(r);
  renderDetailNotes(r);
  $("newNoteName").value="";
  $("newNoteText").value="";

  showView("recipeDetailView");
}
function onDetailPrepCheckboxClick(e){
  const r=findRecipe(currentRecipeId);
  if(!r)return;
  if(r.needsPrep){
    e.preventDefault();
    completePrep(r);
    return;
  }
  const box=e.target;
  box.checked=false;
  openPrepPickModal(r);
}
function renderDetailStages(r){
  const target=$("detailServingSelect").value;
  const ratio=servingMultiplier(target)/servingMultiplier(r.servingBase||servingLabels()[0]);
  const stages=r.stages||[];
  $("detailStages").innerHTML=stages.map(stage=>{
    const nameHtml=stage.groupName?`<div class="detail-stage-name">${esc(stage.groupName)}</div>`:"";
    const ingHtml=stage.ingredients.length?`<h4>材料</h4><ul class="plain-list">${stage.ingredients.map(i=>{
      const amount=scaleAmountText(i.amount,ratio);
      return `<li>${esc(i.name)}${amount?`　${esc(amount)}`:""}</li>`;
    }).join("")}</ul>`:"";
    const steps=(stage.instruction||"").split("\n").map(s=>s.trim()).filter(Boolean);
    const stepsHtml=steps.length?`<h4>作り方</h4><ol class="steps-list">${steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol>`:"";
    return `<div class="detail-stage">${nameHtml}${ingHtml}${stepsHtml}</div>`;
  }).join("");
}
function renderDetailNotes(r){
  const notes=r.notes||[];
  if(!notes.length){$("detailNotes").innerHTML=`<p class="field-benefit-note" style="margin:0;">まだ気づきメモはありません。</p>`;return;}
  $("detailNotes").innerHTML=notes.map(n=>`
    <div class="note-item${n.needsImprovement?" flagged":""}">
      <div class="note-item-head"><span>${esc(n.name||"名無し")}${n.needsImprovement?'<span class="note-flag-badge">要改善</span>':""}</span><span>${esc(n.date)}</span></div>
      <p class="note-item-text">${esc(n.text)}</p>
    </div>`).join("");
}
function addNote(){
  const r=findRecipe(currentRecipeId);
  if(!r)return;
  const text=$("newNoteText").value.trim();
  if(!text)return;
  const name=$("newNoteName").value.trim();
  const needsImprovement=$("newNoteFlag").checked;
  r.notes=r.notes||[];
  r.notes.unshift({name,text,date:todayStr(),needsImprovement});
  save();
  renderDetailNotes(r);
  $("newNoteName").value="";
  $("newNoteText").value="";
  $("newNoteFlag").checked=false;
}
function deleteCurrentRecipe(){
  const r=findRecipe(currentRecipeId);
  if(!r)return;
  if(!confirm(`「${r.name}」を削除しますか？`))return;
  state.recipes=state.recipes.filter(x=>x.id!==currentRecipeId);
  save();
  showTab("categoryView");
  renderCategoryList();
}

/* ---------- category edit ---------- */
function renderCategoryEditList(){
  $("categoryEditList").innerHTML=state.categories.map((c,i)=>`
    <li data-id="${c.id}">
      <span class="category-edit-name">${esc(c.name)}</span>
      <button class="secondary-button small-button up" type="button" ${i===0?"disabled":""}>↑</button>
      <button class="secondary-button small-button down" type="button" ${i===state.categories.length-1?"disabled":""}>↓</button>
      <button class="secondary-button small-button rename" type="button">名前変更</button>
      <button class="danger-outline-button small-button del" type="button">削除</button>
    </li>`).join("");
  $("categoryEditList").querySelectorAll("li").forEach((li,i)=>{
    const cat=state.categories[i];
    li.querySelector(".up").onclick=()=>moveCategory(i,-1);
    li.querySelector(".down").onclick=()=>moveCategory(i,1);
    li.querySelector(".rename").onclick=()=>renameCategory(cat);
    li.querySelector(".del").onclick=()=>deleteCategory(cat);
  });
}
function moveCategory(i,dir){
  const j=i+dir;
  if(j<0||j>=state.categories.length)return;
  [state.categories[i],state.categories[j]]=[state.categories[j],state.categories[i]];
  save();
  renderCategoryEditList();
}
function renameCategory(cat){
  const name=prompt("新しいカテゴリ名を入力してください。",cat.name)?.trim();
  if(!name||name===cat.name)return;
  if(state.categories.some(c=>c.id!==cat.id&&c.name===name)){alert("同じ名前のカテゴリがすでにあります。");return;}
  cat.name=name;
  save();
  renderCategoryEditList();
}
function deleteCategory(cat){
  const count=recipesInCategory(cat.id).length;
  const msg=count?`「${cat.name}」を削除しますか？\nこのカテゴリの中のレシピ${count}件も一緒に削除されます。`:`「${cat.name}」を削除しますか？`;
  if(!confirm(msg))return;
  state.categories=state.categories.filter(c=>c.id!==cat.id);
  state.recipes=state.recipes.filter(r=>r.categoryId!==cat.id);
  save();
  renderCategoryEditList();
}
function addCategory(){
  const input=$("newCategoryName");
  const name=input.value.trim();
  if(!name)return;
  if(state.categories.some(c=>c.name===name)){alert("同じ名前のカテゴリがすでにあります。");return;}
  state.categories.push({id:id(),name});
  input.value="";
  save();
  renderCategoryEditList();
}

/* ---------- 仕込み量の選択肢（全レシピ共通） ---------- */
function renderServingOptionsEditList(){
  const opts=state.servingOptions;
  $("servingOptionsEditList").innerHTML=opts.map((o,i)=>`
    <li data-i="${i}">
      <span class="category-edit-name">${esc(o.label)}（×${esc(formatNumber(o.multiplier))}）</span>
      <button class="secondary-button small-button up" type="button" ${i===0?"disabled":""}>↑</button>
      <button class="secondary-button small-button down" type="button" ${i===opts.length-1?"disabled":""}>↓</button>
      <button class="secondary-button small-button edit-so" type="button">編集</button>
      <button class="danger-outline-button small-button del-so" type="button" ${opts.length<=1?"disabled":""}>削除</button>
    </li>`).join("");
  $("servingOptionsEditList").querySelectorAll("li").forEach((li,i)=>{
    const o=opts[i];
    li.querySelector(".up").onclick=()=>moveServingOption(i,-1);
    li.querySelector(".down").onclick=()=>moveServingOption(i,1);
    li.querySelector(".edit-so").onclick=()=>editServingOption(o);
    const delBtn=li.querySelector(".del-so");
    if(delBtn)delBtn.onclick=()=>deleteServingOption(o);
  });
}
function moveServingOption(i,dir){
  const j=i+dir;
  if(j<0||j>=state.servingOptions.length)return;
  [state.servingOptions[i],state.servingOptions[j]]=[state.servingOptions[j],state.servingOptions[i]];
  save();
  renderServingOptionsEditList();
}
function editServingOption(o){
  const label=prompt("表示名を入力してください。",o.label)?.trim();
  if(!label)return;
  if(state.servingOptions.some(x=>x!==o&&x.label===label)){alert("同じ表示名の選択肢がすでにあります。");return;}
  const multStr=prompt("倍率を入力してください（例：3、0.5）。",String(o.multiplier));
  if(multStr===null)return;
  const mult=parseFloat(multStr);
  if(!(mult>0)){alert("倍率は0より大きい数値で入力してください。");return;}
  o.label=label;
  o.multiplier=mult;
  save();
  renderServingOptionsEditList();
}
function deleteServingOption(o){
  if(state.servingOptions.length<=1){alert("選択肢は最低1件必要です。削除できません。");return;}
  if(!confirm(`「${o.label}」を削除しますか？\nこの選択肢を使っているレシピは、一覧の一番上の選択肢に自動で変更されます。`))return;
  state.servingOptions=state.servingOptions.filter(x=>x!==o);
  const fallback=state.servingOptions[0].label;
  state.recipes.forEach(r=>{
    if(r.servingBase===o.label)r.servingBase=fallback;
    if(r.prepMultiplier===o.label)r.prepMultiplier=fallback;
  });
  save();
  renderServingOptionsEditList();
}
function addServingOption(){
  const label=$("newServingLabel").value.trim();
  const multStr=$("newServingMultiplier").value.trim();
  $("servingOptionError").textContent="";
  if(!label){$("servingOptionError").textContent="表示名を入力してください。";return;}
  const mult=parseFloat(multStr);
  if(!(mult>0)){$("servingOptionError").textContent="倍率は0より大きい数値で入力してください。";return;}
  if(state.servingOptions.some(o=>o.label===label)){$("servingOptionError").textContent="同じ表示名の選択肢がすでにあります。";return;}
  state.servingOptions.push({id:id(),label,multiplier:mult});
  $("newServingLabel").value="";
  $("newServingMultiplier").value="";
  save();
  renderServingOptionsEditList();
}

/* ---------- PIN / 店長モード ---------- */
function openPinModal(mode){
  pinMode=mode;
  $("pinForm").reset();
  $("pinFormError").textContent="";
  $("pinInputConfirm").classList.toggle("hidden",mode==="enter");
  $("pinConfirmLabel").classList.toggle("hidden",mode==="enter");
  if(mode==="enter"){
    $("pinModalTitle").textContent="店長モードのPINを入力";
    $("pinInputLabel").textContent="PIN";
  }else if(mode==="set"){
    $("pinModalTitle").textContent="店長モードのPINを設定";
    $("pinInputLabel").textContent="新しいPIN（数字4桁以上）";
  }else{
    $("pinModalTitle").textContent="PINを変更";
    $("pinInputLabel").textContent="新しいPIN（数字4桁以上）";
  }
  openModal("pin");
  $("pinInput").focus();
}
function submitPinForm(e){
  e.preventDefault();
  const val=$("pinInput").value.trim();
  if(pinMode==="enter"){
    if(val===state.managerPin){
      isManagerMode=true;
      closeModal("pin");
      updateManagerUI();
    }else{
      $("pinFormError").textContent="PINが違います。";
    }
    return;
  }
  const confirmVal=$("pinInputConfirm").value.trim();
  if(val.length<4){$("pinFormError").textContent="4桁以上の数字を入力してください。";return;}
  if(val!==confirmVal){$("pinFormError").textContent="確認用のPINが一致しません。";return;}
  state.managerPin=val;
  save();
  closeModal("pin");
  if(pinMode==="set"){
    isManagerMode=true;
    updateManagerUI();
  }else{
    alert("PINを変更しました。");
  }
}

/* ---------- data management ---------- */
function exportBackup(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`飲食店レシピノート_バックアップ_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importBackup(e){
  const file=e.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const x=JSON.parse(reader.result);
      if(!Array.isArray(x.categories)||!Array.isArray(x.recipes))throw 0;
      if(!confirm("現在のデータを、バックアップファイルの内容に置き換えますか？\nこの操作は取り消せません。"))return;
      migrateRecipes(x);
      state=x;
      save();
      currentCategoryId=null;
      renderCategoryList();
      renderPrepList();
      alert("復元しました。");
    }catch{
      alert("正しいバックアップファイルではありません。");
    }
    e.target.value="";
  };
  reader.readAsText(file);
}

/* ---------- stages (材料＋作り方) ---------- */
function renderStages(){
  $("stagesContainer").innerHTML=formStages.map((stage,si)=>`
    <div class="stage-block" data-si="${si}">
      <div class="stage-header">
        <input type="text" class="stage-name-input" placeholder="工程名（任意、例：A）" value="${esc(stage.groupName)}">
        ${formStages.length>1?`<button type="button" class="secondary-button small-button remove-stage">工程を削除</button>`:""}
      </div>
      <label>材料</label>
      <div class="ingredient-rows" data-si="${si}"></div>
      <button type="button" class="secondary-button small-button add-ingredient-row">＋ 材料を追加</button>
      <label>この工程でやること</label>
      <textarea class="stage-instruction-input" rows="3" placeholder="例：鍋にすべての材料を入れて弱火で3分煮詰める">${esc(stage.instruction)}</textarea>
    </div>`).join("");

  formStages.forEach((stage,si)=>{
    const block=$("stagesContainer").querySelector(`.stage-block[data-si="${si}"]`);
    block.querySelector(".stage-name-input").oninput=e=>{stage.groupName=e.target.value;};
    const removeBtn=block.querySelector(".remove-stage");
    if(removeBtn)removeBtn.onclick=()=>removeStage(si);
    block.querySelector(".stage-instruction-input").oninput=e=>{stage.instruction=e.target.value;};
    block.querySelector(".add-ingredient-row").onclick=()=>addIngredientRowToStage(si);
    renderStageIngredientRows(si);
  });
}
function renderStageIngredientRows(si){
  const {names,amounts}=ingredientHistory();
  const stage=formStages[si];
  const container=$("stagesContainer").querySelector(`.ingredient-rows[data-si="${si}"]`);
  container.innerHTML=stage.ingredients.map((ing,ii)=>`
    <div class="ingredient-row" data-ii="${ii}">
      <div class="autocomplete-wrap">
        <input type="text" class="name-input" placeholder="材料名（例：醤油）" value="${esc(ing.name)}" autocomplete="off">
        <ul class="suggest-list hidden"></ul>
      </div>
      <div class="autocomplete-wrap amount-wrap">
        <input type="text" class="amount-input" placeholder="分量（例：大さじ2、200ml）" value="${esc(ing.amount)}" autocomplete="off">
        <ul class="suggest-list hidden"></ul>
      </div>
      <button type="button" class="remove-row" aria-label="削除">×</button>
    </div>`).join("");
  container.querySelectorAll(".ingredient-row").forEach(row=>{
    const ii=Number(row.dataset.ii);
    const wraps=row.querySelectorAll(".autocomplete-wrap");
    const nameInput=wraps[0].querySelector("input"),nameList=wraps[0].querySelector(".suggest-list");
    const amountInput=wraps[1].querySelector("input"),amountList=wraps[1].querySelector(".suggest-list");
    setupAutocomplete(nameInput,nameList,names,v=>{stage.ingredients[ii].name=v;});
    setupAutocomplete(amountInput,amountList,amounts,v=>{stage.ingredients[ii].amount=v;});
    row.querySelector(".remove-row").onclick=()=>{stage.ingredients.splice(ii,1);renderStageIngredientRows(si);};
  });
}
function addIngredientRowToStage(si){
  formStages[si].ingredients.push({name:"",amount:""});
  renderStageIngredientRows(si);
  const container=$("stagesContainer").querySelector(`.ingredient-rows[data-si="${si}"]`);
  const rows=container.querySelectorAll(".name-input");
  rows[rows.length-1]?.focus();
}
function addStage(){
  formStages.push({groupName:"",ingredients:[{name:"",amount:""}],instruction:""});
  renderStages();
}
function removeStage(si){
  if(formStages.length<=1)return;
  formStages.splice(si,1);
  renderStages();
}

/* ---------- 貼り付けて自動入力 ---------- */
function parsePastedRecipe(text){
  const rawLines=text.split(/\r?\n/).map(s=>s.trim());
  const stripBullet=s=>s.replace(/^[・\-*•●○◯]+\s*/,"").replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/,"").replace(/^\d+[\.\)、）]\s*/,"").trim();
  const ingredientHeadRe=/^(材料)[\s:：]*$/;
  const stepHeadRe=/^(作り方|手順|工程)[\s:：]*$/;

  let ingIdx=-1,stepIdx=-1;
  rawLines.forEach((line,i)=>{
    if(ingIdx===-1&&ingredientHeadRe.test(line))ingIdx=i;
    if(stepIdx===-1&&stepHeadRe.test(line))stepIdx=i;
  });

  if(ingIdx===-1||stepIdx===-1){
    const joined=rawLines.filter(Boolean).join("\n");
    return{name:null,ingredients:[],instruction:joined};
  }

  const nameGuess=rawLines.slice(0,Math.min(ingIdx,stepIdx)).find(l=>l)||null;
  const ingLines=(ingIdx<stepIdx?rawLines.slice(ingIdx+1,stepIdx):rawLines.slice(ingIdx+1)).map(stripBullet).filter(Boolean);
  const stepLines=(stepIdx>ingIdx?rawLines.slice(stepIdx+1):rawLines.slice(stepIdx+1,ingIdx)).map(stripBullet).filter(Boolean);

  const ingredients=ingLines.map(line=>{
    const parts=line.split(/[\t　:：]{1,}| {2,}/).filter(Boolean);
    return{name:parts[0]||line,amount:parts.slice(1).join(" ")||""};
  });

  return{name:nameGuess,ingredients,instruction:stepLines.join("\n")};
}
function applyPastedRecipe(){
  const text=$("recipePasteInput").value;
  if(!text.trim())return;
  const parsed=parsePastedRecipe(text);
  if(parsed.name&&!$("recipeName").value.trim())$("recipeName").value=parsed.name;
  formStages=[{groupName:"",ingredients:parsed.ingredients.length?parsed.ingredients:[{name:"",amount:""}],instruction:parsed.instruction}];
  renderStages();
  $("recipePasteInput").value="";
}

/* ---------- recipe form ---------- */
function openRecipeForm(recipe){
  $("recipeForm").reset();
  $("recipeFormError").textContent="";
  $("recipeId").value=recipe?.id||"";
  $("pasteImportRow").classList.toggle("hidden",!!recipe);
  $("recipeFormTitle").textContent=recipe?"レシピを編集":"レシピを追加";
  $("recipeName").value=recipe?.name||"";
  $("recipeCategory").innerHTML=state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("recipeCategory").value=recipe?.categoryId||currentCategoryId||state.categories[0]?.id||"";
  $("recipeServingBase").innerHTML=servingLabels().map(o=>`<option value="${o}">${o}</option>`).join("");
  $("recipeServingBase").value=recipe?.servingBase||servingLabels()[0]||"1人前";
  formStages=recipe?.stages?.length?recipe.stages.map(s=>({groupName:s.groupName||"",ingredients:(s.ingredients||[]).map(i=>({...i})),instruction:s.instruction||""})):[{groupName:"",ingredients:[{name:"",amount:""}],instruction:""}];
  renderStages();
  $("recipeCookTime").value=recipe?.cookTime||"";
  formPhoto=recipe?.photo||"";
  renderPhotoPreview();
  openModal("recipeForm");
  $("recipeName").focus();
}
function renderPhotoPreview(){
  const img=$("recipePhotoPreview");
  const removeBtn=$("removePhotoButton");
  if(formPhoto){img.src=formPhoto;img.classList.remove("hidden");removeBtn.classList.remove("hidden");}
  else{img.classList.add("hidden");removeBtn.classList.add("hidden");}
}
function onPhotoChange(e){
  const file=e.target.files[0];
  if(!file)return;
  compressImage(file).then(dataUrl=>{formPhoto=dataUrl;renderPhotoPreview();}).catch(()=>{alert("写真の読み込みに失敗しました。");});
}
function compressImage(file,maxWidth=1000,quality=0.75){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.width,h=img.height;
        if(w>maxWidth){h=Math.round(h*maxWidth/w);w=maxWidth;}
        const canvas=document.createElement("canvas");
        canvas.width=w;canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL("image/jpeg",quality));
      };
      img.onerror=reject;
      img.src=reader.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}
function saveRecipeForm(e){
  e.preventDefault();
  const name=$("recipeName").value.trim();
  if(!name){$("recipeFormError").textContent="料理名を入力してください。";return;}
  const categoryId=$("recipeCategory").value;
  const stages=formStages.map(s=>({
    groupName:s.groupName.trim(),
    ingredients:s.ingredients.map(i=>({name:i.name.trim(),amount:i.amount.trim()})).filter(i=>i.name),
    instruction:s.instruction.trim()
  })).filter(s=>s.groupName||s.ingredients.length||s.instruction);
  const data={
    name,categoryId,
    photo:formPhoto,
    servingBase:$("recipeServingBase").value,
    stages,
    cookTime:$("recipeCookTime").value.trim()
  };
  const existingId=$("recipeId").value;
  if(existingId){
    const r=findRecipe(existingId);
    Object.assign(r,data);
  }else{
    state.recipes.push({id:id(),needsPrep:false,prepMultiplier:servingLabels()[0]||"1回分",prepCount:0,lastPreppedDate:"",notes:[],...data});
  }
  save();
  closeModal("recipeForm");
  currentCategoryId=categoryId;
  renderCategoryList();
  if(existingId)openRecipeDetail(existingId);
  else showTab("categoryView");
}

/* ---------- modal ---------- */
function openModal(name){
  $(name+"Modal").classList.remove("hidden");
  document.body.classList.add("modal-open");
}
function closeModal(name){
  $(name+"Modal").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

init();
