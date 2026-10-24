import { z } from "zod";
export const nameBadgeSchema = z
  .object({
    name: z.string().trim().min(1).max(24),
    width: z.number().min(40).max(150).default(80),
    height: z.number().min(18).max(60).default(28),
    hole: z.boolean().default(true),
  })
  .strict();
export function nameBadgeSource(input) {
  const p = nameBadgeSchema.parse(input);
  return `// 3DRFM editable name badge; units: mm. Verify text fit before slicing.
$fn=48;
name=${JSON.stringify(p.name)};
width=${p.width}; height=${p.height}; base=2.4; raised=0.8;
module plate(){hull(){for(x=[3,width-3])for(y=[3,height-3])translate([x,y,0])cylinder(r=3,h=base);}}
difference(){plate();${
    p.hole ? "translate([5,height/2,-1])cylinder(d=3.5,h=base+2);" : ""
  }}
translate([${
    p.hole ? "(width+8)/2" : "width/2"
  },height/2,base])linear_extrude(raised)text(name,size=min(height*0.42,(width-${
    p.hole ? "16" : "8"
  })/max(1,len(name))*0.8),font="Noto Sans CJK TC:style=Bold",halign="center",valign="center");
`;
}
