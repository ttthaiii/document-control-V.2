"use strict";exports.id=8882,exports.ids=[8882],exports.modules={28882:(e,s,r)=>{r.d(s,{Z:()=>w});var a=r(10326),t=r(17577),l=r(26107),n=r(90434),i=r(35047),d=r(4055),o=r(94019),c=r(26754),x=r(36283),m=r(941),h=r(39183),g=r(67048),u=r(24061),p=r(71810),f=r(7619);function b({isOpen:e,onToggle:s}){let r=(0,i.usePathname)(),b=(0,i.useRouter)(),j=(0,i.useSearchParams)(),{user:y,logout:v}=(0,l.a)(),{showLoader:N}=(0,d.r)(),[w,k]=(0,t.useState)(!1),[D,C]=(0,t.useState)([]),z=(0,t.useMemo)(()=>y?.sites&&0!==D.length?D.filter(e=>y.sites.includes(e.id)):[],[y?.sites,D]),[A,Z]=(0,t.useState)(!1),F=async()=>{try{Z(!0),await v(),b.push("/")}catch(e){console.error("Logout error:",e)}finally{Z(!1)}},S=e=>r===e||r.startsWith(e+"/");return y?(0,a.jsxs)(a.Fragment,{children:[e&&a.jsx("div",{className:"lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30",onClick:s}),(0,a.jsxs)("div",{className:`
        fixed inset-y-0 left-0 z-40
        w-64 bg-gradient-to-b from-amber-50 to-orange-50
        border-r border-orange-200
        transform transition-transform duration-300 ease-in-out
        ${e?"translate-x-0":"-translate-x-full"}
        flex flex-col h-screen pt-16
      `,children:[(0,a.jsxs)("div",{className:"bg-gradient-to-r from-orange-600 to-orange-700 text-white p-4 lg:p-6",children:[a.jsx("div",{className:"lg:hidden flex justify-end mb-2",children:a.jsx("button",{onClick:s,className:"p-1 rounded-md hover:bg-white hover:bg-opacity-20",children:a.jsx(o.Z,{size:20})})}),(0,a.jsxs)("div",{className:"space-y-1",children:[(0,a.jsxs)("h3",{className:"font-semibold text-lg truncate",children:["Welcome ",y.email?.split("@")[0]]}),(0,a.jsxs)("p",{className:"text-orange-100 text-sm",children:["Role: ",y.role]}),z.length>0&&(0,a.jsxs)("div",{children:[a.jsx("p",{className:"text-orange-100 text-xs",children:"Site:"}),a.jsx("div",{className:"pl-2",children:z.map(e=>(0,a.jsxs)("p",{className:"text-orange-100 text-xs truncate",title:e.name,children:["- ",e.name]},e.id))})]})]})]}),(0,a.jsxs)("nav",{className:"flex-1 p-4 space-y-2 overflow-y-auto",children:[(0,a.jsxs)(n.default,{href:"/dashboard",onClick:N,className:`
              flex items-center px-3 py-2 rounded-lg transition-colors
              ${S("/dashboard")&&"/dashboard"===r?"bg-blue-100 text-blue-700":"text-gray-700 hover:bg-gray-100"}
            `,children:[a.jsx(c.Z,{className:"w-5 h-5 mr-3"}),"Dashboard"]}),!!y&&[...f.uc,...f.oU,...f.gf,"Admin"].includes(y.role)&&(0,a.jsxs)("div",{className:"space-y-1",children:[(0,a.jsxs)("button",{onClick:()=>{k(!w)},className:`
                  w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-200
                  ${r.startsWith("/dashboard/rfa")||r.startsWith("/rfa/")?"bg-orange-200 text-orange-900":"text-gray-700 hover:bg-orange-100 hover:text-orange-800"}
                `,children:[(0,a.jsxs)("div",{className:"flex items-center gap-3",children:[a.jsx(x.Z,{size:18}),a.jsx("span",{children:"RFA Documents"})]}),w?a.jsx(m.Z,{size:16}):a.jsx(h.Z,{size:16})]}),w&&(0,a.jsxs)("div",{className:"ml-6 space-y-1 border-l-2 border-orange-200 pl-4",children:[(0,a.jsxs)(n.default,{href:"/dashboard/rfa?type=RFA-SHOP",onClick:N,className:`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${"/dashboard/rfa"===r&&"RFA-SHOP"===j.get("type")?"bg-blue-100 text-blue-900 font-medium":"text-gray-600 hover:bg-gray-100 hover:text-gray-800"}
                    `,children:[a.jsx("div",{className:"w-2 h-2 bg-blue-500 rounded-full"}),a.jsx("span",{children:"\uD83C\uDFD7️ Shop Drawing"})]}),(0,a.jsxs)(n.default,{href:"/dashboard/rfa?type=RFA-GEN",onClick:N,className:`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${"/dashboard/rfa"===r&&"RFA-GEN"===j.get("type")?"bg-green-100 text-green-900 font-medium":"text-gray-600 hover:bg-gray-100 hover:text-gray-800"}
                    `,children:[a.jsx("div",{className:"w-2 h-2 bg-green-500 rounded-full"}),a.jsx("span",{children:"\uD83D\uDCCB General"})]}),(0,a.jsxs)(n.default,{href:"/dashboard/rfa?type=RFA-MAT",onClick:N,className:`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors duration-200
                      ${"/dashboard/rfa"===r&&"RFA-MAT"===j.get("type")?"bg-orange-100 text-orange-900 font-medium":"text-gray-600 hover:bg-gray-100 hover:text-gray-800"}
                    `,children:[a.jsx("div",{className:"w-2 h-2 bg-orange-500 rounded-full"}),a.jsx("span",{children:"\uD83E\uDDF1 Material"})]})]})]}),(0,a.jsxs)(n.default,{href:"/dashboard/work-request",onClick:N,className:`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-colors duration-200
              ${S("/dashboard/work-request")?"bg-orange-200 text-orange-900":"text-gray-700 hover:bg-orange-100 hover:text-orange-800"}
            `,children:[a.jsx(g.Z,{size:18}),a.jsx("span",{children:"Work Request"})]})]}),y&&"Admin"===y.role&&(0,a.jsxs)("div",{className:"px-4 py-2",children:[a.jsx("div",{className:"border-t border-orange-200"}),(0,a.jsxs)("div",{className:"mt-2 space-y-1",children:[a.jsx("p",{className:"px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider pt-2",children:"Admin"}),(0,a.jsxs)(n.default,{href:"/admin",onClick:N,className:`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-200
                  ${S("/admin")?"bg-red-100 text-red-800":"text-gray-700 hover:bg-red-50 hover:text-red-700"}
                `,children:[a.jsx(u.Z,{size:18}),a.jsx("span",{children:"Invite Users"})]})]})]}),a.jsx("div",{className:"p-4 border-t border-orange-200",children:(0,a.jsxs)("button",{onClick:F,disabled:A,className:`
              w-full flex items-center justify-center gap-2 
              px-4 py-2.5 rounded-lg text-sm font-medium
              ${A?"bg-red-400 cursor-not-allowed":"bg-red-500 hover:bg-red-600"} 
              text-white transition-colors duration-200
            `,children:[a.jsx(p.Z,{size:16}),a.jsx("span",{children:A?"กำลังออก...":"ออกจากระบบ"})]})})]})]}):null}r(67967),r(76);let j=e=>a.jsx(t.Suspense,{fallback:a.jsx("div",{className:"w-64 bg-gray-100 h-screen"}),children:a.jsx(b,{...e})});var y=r(90748),v=r(6507),N=r(59734);let w=({children:e})=>{let[s,r]=(0,t.useState)(!0),{user:n}=(0,l.a)(),{isLoading:i}=(0,d.r)(),o=()=>{r(!s)};return(0,a.jsxs)("div",{className:"min-h-screen bg-gray-100",children:[a.jsx("header",{className:"fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50",children:(0,a.jsxs)("div",{className:"flex items-center justify-between h-full px-4",children:[(0,a.jsxs)("div",{className:"flex items-center space-x-4",children:[a.jsx("button",{onClick:o,className:"p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors",children:a.jsx(y.Z,{size:20})}),a.jsx("h1",{className:"text-xl font-semibold text-gray-900",children:"\uD83C\uDFD7️ ttsdoc v2"})]}),(0,a.jsxs)("div",{className:"flex items-center space-x-4",children:[a.jsx("button",{className:"p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors",children:a.jsx(v.Z,{size:18})}),n&&(0,a.jsxs)("span",{className:"hidden sm:block text-sm text-gray-600",children:["\uD83D\uDC4B สวัสดี, ",n.email.split("@")[0]]}),(0,a.jsxs)("div",{className:"hidden md:flex items-center space-x-2 text-gray-600",children:[a.jsx(N.Z,{size:18}),a.jsx("span",{className:"text-sm font-medium",children:"T.T.S. Engineering"})]})]})]})}),(0,a.jsxs)("div",{className:"flex",children:[a.jsx(j,{isOpen:s,onToggle:o}),(0,a.jsxs)("main",{className:`
              relative flex-1 transition-all duration-300 ease-in-out
              ${s?"lg:ml-64":"lg:ml-0"}
              overflow-x-hidden //  <-- เพิ่มบรรทัดนี้เข้าไป
            `,children:[i&&a.jsx(d.Y,{}),a.jsx("div",{className:"h-full overflow-y-auto",children:(0,a.jsxs)("div",{className:"pt-16",children:[" ",(0,a.jsxs)("div",{className:"p-4 sm:p-6 lg:p-8",children:[" ",e]})]})})]})]})]})}}};