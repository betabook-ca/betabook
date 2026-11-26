/** Leave native HTML controls usable before the client takes over. Defer JS
 * preloads until the browser has had a paint opportunity; the stylesheet is
 * the only render-blocking resource for these entry documents. */
export function publicEntryTemplate(index: string, frame: string) {
  const entry = index.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
  if (!entry || !index.includes('<div id="root"'))
    throw new Error("Missing Vite application entry");
  const imports: string[] = [];
  const html = index
    .replace(entry[0], "")
    .replace(
      /<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"[^>]*>/g,
      (_tag: string, href: string) => {
        imports.push(href);
        return "";
      },
    )
    .replace('<link rel="stylesheet"', '<link fetchpriority="high" rel="stylesheet"');
  const launch = `<script type="module">
    let started=false;
    function start(){
      if(started)return;
      started=true;
      for(const type of ["pointerdown","keydown","focusin","visibilitychange"])document.removeEventListener(type,start,true);
      for(const href of ${JSON.stringify(imports)}){const link=document.createElement("link");link.rel="modulepreload";link.crossOrigin="anonymous";link.href=href;document.head.append(link);}
      import(${JSON.stringify(entry[1])});
    }
    for(const type of ["pointerdown","keydown","focusin","visibilitychange"])document.addEventListener(type,start,{capture:true,once:true});
    requestAnimationFrame(()=>requestAnimationFrame(start));
  </script>`;
  return html
    .replace("</head>", "<style>#public-entry ~ #root {display:none}</style></head>")
    .replace('<div id="root"', frame + '<div id="root"')
    .replace("</body>", launch + "</body>");
}
