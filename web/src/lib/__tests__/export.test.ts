import { describe, expect, it } from "vitest";

import { buildXlsx } from "../export";

describe("Excel eksport", () => {
  it("matnni xavfsiz yozadi, raqamlarni raqam sifatida", () => {
    const f = buildXlsx([{ name: "A/B: 7", rows: [["Ism", "Ball"], ["<x>&\"", 4.5]] }, { name: "A/B: 7", rows: [] }]);
    const sheet = f["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("&lt;x&gt;&amp;&quot;");
    expect(sheet).toContain('<c r="B2"><v>4.5</v></c>');
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    // Varaq nomlari: taqiqlangan belgilarsiz va takrorlanmas
    expect(f["xl/workbook.xml"]).toContain('name="A B  7"');
    expect(f["xl/workbook.xml"]).toContain('name="A B  7 2"');
  });
});

describe("telefon kiritish", () => {
  it("qisman raqam to'g'ri guruhlanadi, 998 qo'shilmaydi", async () => {
    const { fmt } = await import("../format");
    expect(fmt.phoneLocal("")).toBe("");
    expect(fmt.phoneLocal("9")).toBe("9");
    expect(fmt.phoneLocal("901")).toBe("90 1");
    expect(fmt.phoneLocal("901234567")).toBe("90 123 45 67");
    expect(fmt.phoneLocal("90 123 45 6789")).toBe("90 123 45 67");
  });
});
