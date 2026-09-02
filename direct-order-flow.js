/* PrintBook 5.20.0 — center only the main Edit Order sheet. */
(() => {
  const style=document.createElement('style');
  style.textContent=`
    #orderDialog[open] > .sheet{
      position:fixed!important;
      left:50%!important;
      top:50%!important;
      transform:translate(-50%,-50%)!important;
      margin:0!important;
    }
  `;
  document.head.appendChild(style);
})();
