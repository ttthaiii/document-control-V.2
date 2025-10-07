"use strict";exports.id=8882,exports.ids=[8882],exports.modules={28882:(e,s,r)=>{r.d(s,{Z:()=>k});var t=r(10326),a=r(17577),n=r(26107),l=r(90434),i=r(35047),d=r(4055),o=r(94019),c=r(26754),x=r(36283),m=r(941),g=r(39183),h=r(36728),u=r(67048),p=r(24061),f=r(71810),b=r(7619);function j({isOpen:e,onToggle:s}){let r=(0,i.usePathname)(),j=(0,i.useRouter)(),y=(0,i.useSearchParams)(),{user:v,logout:N}=(0,n.aC)(),{showLoader:w}=(0,d.r)(),[k,C]=(0,a.useState)(!1),D=()=>!!v&&[...b.uc,...b.oU,...b.gf,"Admin"].includes(v.role),z=(0,a.useMemo)(()=>v?.sites&&0!==v.sites.length?v.sites.map((e,s)=>({id:e,name:`Site ${s+1}`})):[],[v?.sites]),[Z,A]=(0,a.useState)(!1),F=async()=>{try{A(!0),await N(),j.push("/")}catch(e){console.error("Logout error:",e)}finally{A(!1)}},$=e=>r===e||r.startsWith(e+"/");return v?(0,t.jsxs)(t.Fragment,{children:[e&&t.jsx("div",{className:"lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30",onClick:s}),(0,t.jsxs)("div",{className:`
        fixed inset-y-0 left-0 z-40
        w-64 bg-gradient-to-b from-amber-50 to-orange-50
        border-r border-orange-200
        transform transition-transform duration-300 ease-in-out
        ${e?"translate-x-0":"-translate-x-full"}
        flex flex-col h-screen pt-16
      `,children:[(0,t.jsxs)("div",{className:"bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 lg:p-6",children:[t.jsx("div",{className:"lg:hidden flex justify-end mb-2",children:t.jsx("button",{onClick:s,className:"p-1 rounded-md hover:bg-white hover:bg-opacity-20",children:t.jsx(o.Z,{size:20})})}),(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsxs)("h3",{className:"font-semibold text-lg truncate",children:["Welcome ",v.email?.split("@")[0]]}),(0,t.jsxs)("p",{className:"text-orange-100 text-sm",children:["Role: ",v.role]}),z.length>0&&(0,t.jsxs)("p",{className:"text-orange-100 text-xs truncate",children:["Site: ",z.map(e=>e.name).join(", ")]})]})]}),(0,t.jsxs)("nav",{className:"flex-1 p-4 space-y-2 overflow-y-auto",children:[(0,t.jsxs)(l.default,{href:"/dashboard",onClick:w,className:`
              flex items-center px-3 py-2 rounded-lg transition-colors
              ${$("/dashboard")&&"/dashboard"===r?"bg-blue-100 text-blue-700":"text-gray-700 hover:bg-gray-100"}
            `,children:[t.jsx(c.Z,{className:"w-5 h-5 mr-3"}),"Dashboard"]}),D()&&(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsxs)("button",{onClick:()=>{C(!k)},className:`
                  w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-200
                  ${r.startsWith("/dashboard/rfa")||r.startsWith("/rfa/")?"bg-orange-200 text-orange-900":"text-gray-700 hover:bg-orange-100 hover:text-orange-800"}
                `,children:[(0,t.jsxs)("div",{className:"flex items-center gap-3",children:[t.jsx(x.Z,{size:18}),t.jsx("span",{children:"RFA Documents"})]}),k?t.jsx(m.Z,{size:16}):t.jsx(g.Z,{size:16})]}),k&&(0,t.jsxs)("div",{className:"ml-6 space-y-1 border-l-2 border-orange-200 pl-4",children:[(0,t.jsxs)(l.default,{href:"/dashboard/rfa?type=RFA-SHOP",onClick:w,className:`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${"/dashboard/rfa"===r&&"RFA-SHOP"===y.get("type")?"bg-blue-100 text-blue-900 font-medium":"text-gray-600 hover:bg-gray-100 hover:text-gray-800"}
                    `,children:[t.jsx("div",{className:"w-2 h-2 bg-blue-500 rounded-full"}),t.jsx("span",{children:"\uD83C\uDFD7️ Shop Drawing"})]}),(0,t.jsxs)(l.default,{href:"/dashboard/rfa?type=RFA-GEN",onClick:w,className:`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${"/dashboard/rfa"===r&&"RFA-GEN"===y.get("type")?"bg-green-100 text-green-900 font-medium":"text-gray-600 hover:bg-gray-100 hover:text-gray-800"}
                    `,children:[t.jsx("div",{className:"w-2 h-2 bg-green-500 rounded-full"}),t.jsx("span",{children:"\uD83D\uDCCB General"})]}),(0,t.jsxs)(l.default,{href:"/dashboard/rfa?type=RFA-MAT",onClick:w,className:`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${"/dashboard/rfa"===r&&"RFA-MAT"===y.get("type")?"bg-orange-100 text-orange-900 font-medium":"text-gray-600 hover:bg-gray-100 hover:text-gray-800"}
                    `,children:[t.jsx("div",{className:"w-2 h-2 bg-orange-500 rounded-full"}),t.jsx("span",{children:"\uD83E\uDDF1 Material"})]})]})]}),D()&&(0,t.jsxs)(l.default,{href:"/rfi",onClick:w,className:`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors duration-200
                ${$("/rfi")?"bg-orange-200 text-orange-900":"text-gray-700 hover:bg-orange-100 hover:text-orange-800"}
              `,children:[t.jsx(h.Z,{size:18}),t.jsx("span",{children:"RFI"})]}),(0,t.jsxs)(l.default,{href:"/dashboard/work-request",onClick:w,className:`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-colors duration-200
              ${$("/dashboard/work-request")?"bg-orange-200 text-orange-900":"text-gray-700 hover:bg-orange-100 hover:text-orange-800"}
            `,children:[t.jsx(u.Z,{size:18}),t.jsx("span",{children:"Work Request"})]})]}),v&&"Admin"===v.role&&(0,t.jsxs)("div",{className:"px-4 py-2",children:[t.jsx("div",{className:"border-t border-orange-200"}),(0,t.jsxs)("div",{className:"mt-2 space-y-1",children:[t.jsx("p",{className:"px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider pt-2",children:"Admin"}),(0,t.jsxs)(l.default,{href:"/admin",onClick:w,className:`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-200
                  ${$("/admin")?"bg-red-100 text-red-800":"text-gray-700 hover:bg-red-50 hover:text-red-700"}
                `,children:[t.jsx(p.Z,{size:18}),t.jsx("span",{children:"Invite Users"})]})]})]}),t.jsx("div",{className:"p-4 border-t border-orange-200",children:(0,t.jsxs)("button",{onClick:F,disabled:Z,className:`
              w-full flex items-center justify-center gap-2 
              px-4 py-2.5 rounded-lg text-sm font-medium
              ${Z?"bg-red-400 cursor-not-allowed":"bg-red-500 hover:bg-red-600"} 
              text-white transition-colors duration-200
            `,children:[t.jsx(f.Z,{size:16}),t.jsx("span",{children:Z?"กำลังออก...":"ออกจากระบบ"})]})})]})]}):null}let y=e=>t.jsx(a.Suspense,{fallback:t.jsx("div",{className:"w-64 bg-gray-100 h-screen"}),children:t.jsx(j,{...e})});var v=r(90748),N=r(6507),w=r(59734);let k=({children:e})=>{let[s,r]=(0,a.useState)(!0),{user:l}=(0,n.aC)(),{isLoading:i}=(0,d.r)(),o=()=>{r(!s)};return(0,t.jsxs)("div",{className:"min-h-screen bg-gray-100",children:[t.jsx("header",{className:"fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50",children:(0,t.jsxs)("div",{className:"flex items-center justify-between h-full px-4",children:[(0,t.jsxs)("div",{className:"flex items-center space-x-4",children:[t.jsx("button",{onClick:o,className:"p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors",children:t.jsx(v.Z,{size:20})}),t.jsx("h1",{className:"text-xl font-semibold text-gray-900",children:"\uD83C\uDFD7️ ttsdoc v2"})]}),(0,t.jsxs)("div",{className:"flex items-center space-x-4",children:[t.jsx("button",{className:"p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors",children:t.jsx(N.Z,{size:18})}),l&&(0,t.jsxs)("span",{className:"hidden sm:block text-sm text-gray-600",children:["\uD83D\uDC4B สวัสดี, ",l.email.split("@")[0]]}),(0,t.jsxs)("div",{className:"hidden md:flex items-center space-x-2 text-gray-600",children:[t.jsx(w.Z,{size:18}),t.jsx("span",{className:"text-sm font-medium",children:"T.T.S. Engineering"})]})]})]})}),(0,t.jsxs)("div",{className:"flex",children:[t.jsx(y,{isOpen:s,onToggle:o}),(0,t.jsxs)("main",{className:`
            relative flex-1 transition-all duration-300 ease-in-out
            ${s?"lg:ml-64":"lg:ml-0"}
          `,children:[i&&t.jsx(d.Y,{}),t.jsx("div",{className:"h-full overflow-y-auto",children:(0,t.jsxs)("div",{className:"pt-16",children:[" ",(0,t.jsxs)("div",{className:"p-4 sm:p-6 lg:p-8",children:[" ",e]})]})})]})]})]})}}};