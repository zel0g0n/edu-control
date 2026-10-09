import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { translate } from "../i18n";
import { RU, UZ } from "@edunazorat/shared";

/** Manba kodidagi barcha t("...") / tr("...") kalitlari. */
function sourceKeys(): Set<string> {
  const keys = new Set<string>();
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) {
        if (f !== "__tests__") walk(p);
      } else if (/\.tsx?$/.test(f)) {
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(/\b(?:t|tr)\(\s*("(?:[^"\\]|\\.)*")/g)) keys.add(JSON.parse(m[1]));
        for (const m of src.matchAll(/\blabel:\s*("(?:[^"\\]|\\.)*")/g)) {
          const k = JSON.parse(m[1]);
          if (/[a-z]/.test(k) && !/^[A-Z]{2}$/.test(k)) keys.add(k);
        }
        for (const m of src.matchAll(/<(?:ParentFrame|StudentFrame)[^>]*title=("(?:[^"\\]|\\.)*")/g)) keys.add(JSON.parse(m[1]));
      }
    }
  };
  walk(path.resolve(__dirname, "../.."));
  return keys;
}

describe("tarjimalar", () => {
  it("interfeysdagi har bir matnning ruschasi bor", () => {
    const missing = [...sourceKeys()].filter((k) => !(k in RU) && !k.startsWith("demo."));
    expect(missing).toEqual([]);
  });

  it("barcha nuqtali o'zbekcha kalitlar ruschada ham bor", () => {
    expect(Object.keys(UZ).filter((k) => !(k in RU))).toEqual([]);
  });

  it("parametrlar ikkala tilda bir xil", () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const bad = Object.entries(RU).filter(([k, v]) => params(UZ[k] ?? k) !== params(v)).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("ichki kalit parametr ham tarjima qilinadi", () => {
    expect(translate("ru", "notif.grade", { student: "Kamila", subject: "Matematika", value: 5, gradeType: "grade.type.control" }))
      .toBe("Kamila: 5 по предмету «Matematika» (Контрольная)");
  });
});
